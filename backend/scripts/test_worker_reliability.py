import asyncio
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Allow `from internal_service...` when run from backend/
BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from internal_service.jobs import JobStore  # noqa: E402


URI_FILE = Path(r"C:\Users\kayon\AppData\Local\Temp\opencode\cpmis-mongomem.uri")


def now_utc():
    return datetime.now(timezone.utc)


async def wait_for_uri(timeout=120):
    uri = os.environ.get("MONGODB_URI") or os.environ.get("INTERNAL_SERVICE_MONGODB_URI")
    if uri:
        return uri
    deadline = time.time() + timeout
    while time.time() < deadline:
        if URI_FILE.exists():
            text = URI_FILE.read_text(encoding="utf-8").strip()
            if text.startswith("ERROR:"):
                raise RuntimeError(f"mongo-memory-server failed: {text}")
            if text:
                return text
        await asyncio.sleep(0.5)
    raise RuntimeError("Timed out waiting for mongo-memory-server URI")


class Results:
    def __init__(self):
        self.passed = []
        self.failed = []

    def ok(self, name, detail=""):
        self.passed.append(name)
        print(f"PASS {name}" + (f" - {detail}" if detail else ""))

    def bad(self, name, detail=""):
        self.failed.append(name)
        print(f"FAIL {name}" + (f" - {detail}" if detail else ""))

    def check(self, name, cond, detail=""):
        if cond:
            self.ok(name, detail)
        else:
            self.bad(name, detail)
        return cond


async def make_store(client, db_name):
    db = client[db_name]
    # clean collections for isolation
    for c in ["internal_jobs", "internal_job_idempotency", "internal_counters", "internal_workers", "internal_locks"]:
        try:
            await db[c].drop()
        except Exception:
            pass
    store = JobStore(db, default_max_attempts=3, default_retry_delay_seconds=1, claim_lease_seconds=5)
    # ensure indexes used by production paths if any? JobStore relies on queries; create useful indexes
    await db["internal_jobs"].create_index("jobId", unique=True)
    await db["internal_job_idempotency"].create_index("key", unique=True)
    return db, store


async def test_duplicate_execution(r: Results, client):
    db, store = await make_store(client, "test_duplicate_execution")

    created = await store.create_job(job_type="internal.echo", payload={"x": 1}, max_attempts=3)
    job_id = created["job"]["jobId"]
    r.check("dup.create", created["ok"] and not created.get("deduped"), job_id)

    # Two workers race to claim the same job. Only one should succeed.
    c1, c2 = await asyncio.gather(
        store.claim_job(job_id, worker_id="worker-A", lease_seconds=30),
        store.claim_job(job_id, worker_id="worker-B", lease_seconds=30),
    )
    ok_count = sum(1 for c in [c1, c2] if c.get("ok"))
    r.check("dup.single_claim_winner", ok_count == 1, f"ok_count={ok_count} A={c1.get('ok')} B={c2.get('ok')}")
    winner = c1 if c1.get("ok") else c2
    loser = c2 if c1.get("ok") else c1
    r.check("dup.loser_rejected", not loser.get("ok") and loser.get("error") == "job-not-claimable", str(loser.get("error")))

    job = winner["job"]
    token = job["fencingToken"]
    owner = job["claimedBy"]
    r.check("dup.fencing_token_assigned", isinstance(token, int) and token >= 1, f"token={token} owner={owner}")

    # Stale/other worker cannot heartbeat/complete/fail with wrong token or wrong worker.
    wrong_worker_hb = await store.heartbeat_job(job_id, worker_id="worker-B" if owner == "worker-A" else "worker-A", fencing_token=token, lease_seconds=30)
    r.check("dup.wrong_worker_heartbeat_rejected", not wrong_worker_hb.get("ok"), wrong_worker_hb.get("error"))

    wrong_token_hb = await store.heartbeat_job(job_id, worker_id=owner, fencing_token=token + 999, lease_seconds=30)
    r.check("dup.wrong_token_heartbeat_rejected", not wrong_token_hb.get("ok") and wrong_token_hb.get("error") == "fencing-token-mismatch", wrong_token_hb.get("error"))

    wrong_token_complete = await store.complete_job(job_id, worker_id=owner, fencing_token=token + 999, result={"bad": True})
    r.check("dup.wrong_token_complete_rejected", not wrong_token_complete.get("ok") and wrong_token_complete.get("error") == "fencing-token-mismatch", wrong_token_complete.get("error"))

    # Job should still be running, untouched by rejected stale operations.
    mid = await store.get_job(job_id)
    r.check("dup.job_still_running_after_stale_ops", mid and mid["status"] == "running" and mid["claimedBy"] == owner and mid["fencingToken"] == token)

    # Correct owner completes.
    done = await store.complete_job(job_id, worker_id=owner, fencing_token=token, result={"ok": True})
    r.check("dup.owner_complete_ok", done.get("ok") and done["job"]["status"] == "succeeded", done.get("error"))

    # Duplicate complete after success is rejected.
    done2 = await store.complete_job(job_id, worker_id=owner, fencing_token=token, result={"ok": True})
    r.check("dup.second_complete_rejected", not done2.get("ok"), done2.get("error"))

    # claim_next_job should not return succeeded job; create two and ensure only two claims possible.
    j1 = (await store.create_job(job_type="internal.echo", payload={"n": 1}))["job"]["jobId"]
    j2 = (await store.create_job(job_type="internal.echo", payload={"n": 2}))["job"]["jobId"]
    claims = await asyncio.gather(
        store.claim_next_job(worker_id="W1", lease_seconds=30),
        store.claim_next_job(worker_id="W2", lease_seconds=30),
        store.claim_next_job(worker_id="W3", lease_seconds=30),
    )
    claimed_ids = [c["job"]["jobId"] for c in claims if c.get("ok") and c.get("job")]
    r.check("dup.claim_next_no_duplicate_jobs", len(claimed_ids) == 2 and len(set(claimed_ids)) == 2 and set(claimed_ids) == {j1, j2}, str(claimed_ids))


async def test_lease_recovery(r: Results, client):
    db, store = await make_store(client, "test_lease_recovery")

    # Job with short lease; simulate crash by not heartbeating.
    created = await store.create_job(job_type="internal.echo", payload={"crash": True}, max_attempts=2, retry_delay_seconds=0)
    job_id = created["job"]["jobId"]
    claim = await store.claim_job(job_id, worker_id="crashed-worker", lease_seconds=1)
    r.check("lease.claimed", claim.get("ok"), claim.get("error"))
    old_token = claim["job"]["fencingToken"]

    # Force lease expiry in DB to make test deterministic.
    await db["internal_jobs"].update_one(
        {"jobId": job_id},
        {"$set": {"claimExpiresAt": now_utc() - timedelta(seconds=5)}},
    )

    # Any store operation triggers recovery; get_job should show requeued.
    recovered = await store.get_job(job_id)
    r.check("lease.requeued_after_expiry", recovered and recovered["status"] == "queued", f"status={recovered and recovered['status']}")
    r.check("lease.attempts_preserved", recovered and recovered["attemptsMade"] == 1, f"attempts={recovered and recovered['attemptsMade']}")
    r.check("lease.claim_cleared", recovered and recovered["claimedBy"] is None and recovered["claimExpiresAt"] is None)
    r.check("lease.last_error_set", recovered and recovered["lastError"] and recovered["lastError"].get("code") == "claim-lease-expired")
    r.check("lease.history_marked_expired", recovered and recovered["history"] and recovered["history"][-1]["outcome"] == "lease-expired", str(recovered and recovered["history"][-1] if recovered else None))

    # Make requeued job immediately claimable (retry_delay may push runAt into future).
    await db["internal_jobs"].update_one({"jobId": job_id}, {"$set": {"runAt": now_utc() - timedelta(seconds=1)}})

    # Another worker can claim the recovered job.
    claim2 = await store.claim_job(job_id, worker_id="recovery-worker", lease_seconds=30)
    r.check("lease.reclaimed_by_new_worker", claim2.get("ok") and claim2["job"]["claimedBy"] == "recovery-worker", claim2.get("error"))
    new_token = claim2["job"]["fencingToken"]
    r.check("lease.new_fencing_token", isinstance(new_token, int) and new_token > old_token, f"old={old_token} new={new_token}")
    r.check("lease.attempt_incremented", claim2["job"]["attemptsMade"] == 2, f"attempts={claim2['job']['attemptsMade']}")

    # Crashed worker's late completion/fail with old token must be rejected.
    stale_complete = await store.complete_job(job_id, worker_id="crashed-worker", fencing_token=old_token, result={"stale": True})
    r.check("lease.stale_complete_rejected", not stale_complete.get("ok"), stale_complete.get("error"))
    stale_fail = await store.fail_job(job_id, worker_id="crashed-worker", fencing_token=old_token, error={"code": "stale"}, retryable=True)
    r.check("lease.stale_fail_rejected", not stale_fail.get("ok"), stale_fail.get("error"))

    # Job still owned by recovery worker.
    still = await store.get_job(job_id)
    r.check("lease.still_owned_by_recovery_worker", still and still["status"] == "running" and still["claimedBy"] == "recovery-worker" and still["fencingToken"] == new_token)

    # Exhaust attempts -> dead letter on lease expiry.
    await db["internal_jobs"].update_one({"jobId": job_id}, {"$set": {"claimExpiresAt": now_utc() - timedelta(seconds=5)}})
    dead = await store.get_job(job_id)
    r.check("lease.dead_letter_after_max_attempts", dead and dead["status"] == "dead_letter", f"status={dead and dead['status']}")
    r.check("lease.dead_letter_has_error", dead and dead["lastError"] and dead["lastError"].get("code") == "claim-lease-expired")


async def test_worker_crash_recovery(r: Results, client):
    """Simulate worker crash mid-execution: claim, lose lease, requeue, reclaim, complete."""
    db, store = await make_store(client, "test_worker_crash")

    created = await store.create_job(job_type="internal.echo", payload={"work": "x"}, max_attempts=3, retry_delay_seconds=0)
    job_id = created["job"]["jobId"]

    # Worker 1 claims and "crashes" (no heartbeats/completion).
    c1 = await store.claim_job(job_id, worker_id="worker-crash-1", lease_seconds=1)
    r.check("crash.claimed", c1.get("ok"))
    t1 = c1["job"]["fencingToken"]

    # Expire lease.
    await db["internal_jobs"].update_one({"jobId": job_id}, {"$set": {"claimExpiresAt": now_utc() - timedelta(seconds=10)}})
    after_crash = await store.get_job(job_id)
    r.check("crash.requeued", after_crash and after_crash["status"] == "queued")
    await db["internal_jobs"].update_one({"jobId": job_id}, {"$set": {"runAt": now_utc() - timedelta(seconds=1)}})

    # Worker 2 claims and also crashes.
    c2 = await store.claim_job(job_id, worker_id="worker-crash-2", lease_seconds=1)
    r.check("crash.reclaimed", c2.get("ok"))
    t2 = c2["job"]["fencingToken"]
    r.check("crash.fencing_monotonic", t2 > t1, f"t1={t1} t2={t2}")

    await db["internal_jobs"].update_one({"jobId": job_id}, {"$set": {"claimExpiresAt": now_utc() - timedelta(seconds=10)}})
    after_crash2 = await store.get_job(job_id)
    r.check("crash.requeued_again", after_crash2 and after_crash2["status"] == "queued")
    r.check("crash.attempts_made_2", after_crash2 and after_crash2["attemptsMade"] == 2)
    await db["internal_jobs"].update_one({"jobId": job_id}, {"$set": {"runAt": now_utc() - timedelta(seconds=1)}})

    # Worker 3 claims and completes successfully.
    c3 = await store.claim_job(job_id, worker_id="worker-ok-3", lease_seconds=30)
    r.check("crash.claimed_by_worker3", c3.get("ok"))
    t3 = c3["job"]["fencingToken"]
    done = await store.complete_job(job_id, worker_id="worker-ok-3", fencing_token=t3, result={"recovered": True})
    r.check("crash.completed_after_recovery", done.get("ok") and done["job"]["status"] == "succeeded")

    # Old workers cannot mutate completed job.
    late1 = await store.complete_job(job_id, worker_id="worker-crash-1", fencing_token=t1, result={"late": 1})
    late2 = await store.fail_job(job_id, worker_id="worker-crash-2", fencing_token=t2, error={"code": "late"}, retryable=True)
    r.check("crash.stale_worker1_rejected", not late1.get("ok"))
    r.check("crash.stale_worker2_rejected", not late2.get("ok"))

    final = await store.get_job(job_id)
    r.check("crash.final_state_succeeded", final and final["status"] == "succeeded" and final["result"] == {"recovered": True})
    r.check("crash.history_has_3_attempts", final and len(final["history"]) == 3, f"len={len(final['history']) if final else None}")
    outcomes = [h.get("outcome") for h in (final["history"] if final else [])]
    r.check("crash.history_outcomes", outcomes == ["lease-expired", "lease-expired", "succeeded"], str(outcomes))


async def test_idempotency_and_duplicate_create(r: Results, client):
    db, store = await make_store(client, "test_idempotency")
    a = await store.create_job(job_type="internal.echo", payload={"a": 1}, idempotency_key="idem-1")
    b = await store.create_job(job_type="internal.echo", payload={"a": 1}, idempotency_key="idem-1")
    r.check("idem.first_created", a.get("ok") and not a.get("deduped"))
    r.check("idem.second_deduped", b.get("ok") and b.get("deduped"))
    r.check("idem.same_job_id", a["job"]["jobId"] == b["job"]["jobId"], f"{a['job']['jobId']} vs {b['job']['jobId']}")


async def main():
    uri = await wait_for_uri()
    print(f"Using MongoDB: {uri[:40]}...")
    client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=10000)
    try:
        await client.admin.command("ping")
    except Exception as e:
        print(f"FAIL mongo.ping - {e}")
        sys.exit(2)

    r = Results()
    for name, fn in [
        ("duplicate_execution", test_duplicate_execution),
        ("lease_recovery", test_lease_recovery),
        ("worker_crash_recovery", test_worker_crash_recovery),
        ("idempotency", test_idempotency_and_duplicate_create),
    ]:
        print(f"\n== {name} ==")
        try:
            await fn(r, client)
        except Exception as e:
            import traceback
            traceback.print_exc()
            r.bad(f"{name}.unhandled_exception", str(e))

    print(f"\n== summary ==")
    print(f"passed={len(r.passed)} failed={len(r.failed)}")
    for f in r.failed:
        print(f" - FAIL: {f}")
    client.close()
    return 0 if not r.failed else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
