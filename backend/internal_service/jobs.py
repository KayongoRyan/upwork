from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError


JobStatus = Literal["queued", "running", "succeeded", "failed", "dead_letter", "cancelled"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).isoformat() if dt else None


def as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _job_doc_to_dict(doc: dict[str, Any] | None, now: datetime | None = None) -> dict[str, Any] | None:
    if not doc:
        return None
    current = now or utcnow()
    claim_expires = as_utc(doc.get("claimExpiresAt"))
    history = []
    for idx, h in enumerate(doc.get("history", []), start=1):
        attempt = h.get("attempt")
        history.append(
            {
                "attempt": attempt if attempt is not None else idx,
                "workerId": h.get("workerId"),
                "startedAt": iso(as_utc(h.get("startedAt"))),
                "endedAt": iso(as_utc(h.get("endedAt"))),
                "outcome": h.get("outcome"),
                "error": h.get("error"),
                "fencingToken": h.get("fencingToken"),
            }
        )
    return {
        "jobId": doc.get("jobId"),
        "type": doc.get("type"),
        "payload": doc.get("payload", {}),
        "status": doc.get("status"),
        "priority": doc.get("priority"),
        "maxAttempts": doc.get("maxAttempts"),
        "attemptsMade": doc.get("attemptsMade", 0),
        "retryDelaySeconds": doc.get("retryDelaySeconds"),
        "executionTimeoutSeconds": doc.get("executionTimeoutSeconds"),
        "idempotencyKey": doc.get("idempotencyKey"),
        "createdAt": iso(as_utc(doc.get("createdAt"))),
        "updatedAt": iso(as_utc(doc.get("updatedAt"))),
        "runAt": iso(as_utc(doc.get("runAt"))),
        "claimedBy": doc.get("claimedBy"),
        "claimExpiresAt": iso(claim_expires),
        "startedAt": iso(as_utc(doc.get("startedAt"))),
        "completedAt": iso(as_utc(doc.get("completedAt"))),
        "result": doc.get("result"),
        "lastError": doc.get("lastError"),
        "cancelledReason": doc.get("cancelledReason"),
        "metadata": doc.get("metadata", {}),
        "history": history,
        "claimExpired": bool(doc.get("status") == "running" and claim_expires and claim_expires <= current),
        "fencingToken": doc.get("fencingToken"),
    }


class JobStore:
    def __init__(
        self,
        db: AsyncIOMotorDatabase,
        *,
        default_max_attempts: int = 3,
        default_retry_delay_seconds: int = 15,
        claim_lease_seconds: int = 60,
    ) -> None:
        self._db = db
        self._jobs = db["internal_jobs"]
        self._idempotency = db["internal_job_idempotency"]
        self._counters = db["internal_counters"]
        self._default_max_attempts = max(1, default_max_attempts)
        self._default_retry_delay_seconds = max(1, default_retry_delay_seconds)
        self._claim_lease_seconds = max(5, claim_lease_seconds)

    async def _next_fencing_token(self, name: str) -> int:
        doc = await self._counters.find_one_and_update(
            {"name": name},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return int(doc.get("value", 1))

    async def _requeue_expired_claims(self, now: datetime) -> None:
        # Requeue expired running jobs atomically per document. Pipeline updates would be ideal,
        # but per-doc conditional updates are clear and safe with fencing/claim fields.
        cursor = self._jobs.find(
            {"status": "running", "claimExpiresAt": {"$lte": now}},
            {"jobId": 1, "attemptsMade": 1, "maxAttempts": 1, "retryDelaySeconds": 1, "fencingToken": 1, "history": 1},
        )
        async for doc in cursor:
            attempts_made = int(doc.get("attemptsMade", 0))
            max_attempts = int(doc.get("maxAttempts", 1))
            retry_delay = int(doc.get("retryDelaySeconds", self._default_retry_delay_seconds))
            fencing = doc.get("fencingToken")
            history = doc.get("history", [])
            if history and history[-1].get("outcome") is None:
                history[-1]["outcome"] = "lease-expired"
                history[-1]["endedAt"] = now
                history[-1]["error"] = {"code": "claim-lease-expired", "message": "Worker claim lease expired"}
            base_filter: dict[str, Any] = {"jobId": doc["jobId"], "status": "running", "fencingToken": fencing}
            common_set = {
                "updatedAt": now,
                "claimedBy": None,
                "claimExpiresAt": None,
                "lastError": {"code": "claim-lease-expired", "message": "Worker claim lease expired"},
                "history": history,
            }
            if attempts_made < max_attempts:
                await self._jobs.update_one(
                    base_filter,
                    {"$set": {**common_set, "status": "queued", "runAt": now + timedelta(seconds=retry_delay)}},
                )
            else:
                await self._jobs.update_one(
                    base_filter,
                    {"$set": {**common_set, "status": "dead_letter", "completedAt": now}},
                )

    async def create_job(
        self,
        *,
        job_type: str,
        payload: dict[str, Any],
        priority: int = 5,
        max_attempts: int | None = None,
        retry_delay_seconds: int | None = None,
        execution_timeout_seconds: int | None = None,
        idempotency_key: str | None = None,
        run_at: datetime | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = utcnow()
        run_at = as_utc(run_at) or now
        max_attempts_val = max(1, max_attempts or self._default_max_attempts)
        retry_delay_val = max(1, retry_delay_seconds or self._default_retry_delay_seconds)
        exec_timeout_val = max(1, int(execution_timeout_seconds or 0)) if execution_timeout_seconds is not None else None
        priority_val = max(1, min(10, priority))
        job_id = f"job_{uuid4().hex}"

        if idempotency_key:
            # Atomic idempotency reservation.
            idem = await self._idempotency.find_one_and_update(
                {"key": idempotency_key},
                {"$setOnInsert": {"key": idempotency_key, "jobId": job_id, "createdAt": now}},
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
            existing_job_id = idem.get("jobId") if idem else job_id
            if existing_job_id != job_id:
                existing = await self._jobs.find_one({"jobId": existing_job_id})
                if existing:
                    return {"ok": True, "job": _job_doc_to_dict(existing, now), "deduped": True}
                # Stale idempotency record pointing to missing job: reclaim it.
                await self._idempotency.update_one({"key": idempotency_key, "jobId": existing_job_id}, {"$set": {"jobId": job_id, "updatedAt": now}})

        doc = {
            "jobId": job_id,
            "type": job_type,
            "payload": payload,
            "status": "queued",
            "priority": priority_val,
            "maxAttempts": max_attempts_val,
            "attemptsMade": 0,
            "retryDelaySeconds": retry_delay_val,
            "executionTimeoutSeconds": exec_timeout_val,
            "idempotencyKey": idempotency_key,
            "createdAt": now,
            "updatedAt": now,
            "runAt": run_at,
            "claimedBy": None,
            "claimExpiresAt": None,
            "startedAt": None,
            "completedAt": None,
            "result": None,
            "lastError": None,
            "cancelledReason": None,
            "metadata": metadata or {},
            "history": [],
            "fencingToken": 0,
        }
        try:
            await self._jobs.insert_one(doc)
        except DuplicateKeyError:
            # Extremely rare race; if idempotency key exists, return existing.
            if idempotency_key:
                existing = await self._jobs.find_one({"idempotencyKey": idempotency_key})
                if existing:
                    return {"ok": True, "job": _job_doc_to_dict(existing, now), "deduped": True}
            raise
        except Exception:
            if idempotency_key:
                await self._idempotency.delete_one({"key": idempotency_key, "jobId": job_id})
            raise
        return {"ok": True, "job": _job_doc_to_dict(doc, now), "deduped": False}

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        now = utcnow()
        await self._requeue_expired_claims(now)
        doc = await self._jobs.find_one({"jobId": job_id})
        return _job_doc_to_dict(doc, now)

    async def list_jobs(self, *, status: str | None = None, job_type: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        now = utcnow()
        await self._requeue_expired_claims(now)
        q: dict[str, Any] = {}
        if status:
            q["status"] = status
        if job_type:
            q["type"] = job_type
        cursor = self._jobs.find(q).sort([("priority", DESCENDING), ("createdAt", ASCENDING)]).limit(max(1, min(limit, 500)))
        docs = await cursor.to_list(length=max(1, min(limit, 500)))
        return [_job_doc_to_dict(d, now) for d in docs if d]

    async def claim_job(self, job_id: str, *, worker_id: str, lease_seconds: int | None = None) -> dict[str, Any]:
        now = utcnow()
        await self._requeue_expired_claims(now)
        lease = max(5, lease_seconds or self._claim_lease_seconds)
        fencing = await self._next_fencing_token(f"job:{job_id}")
        doc = await self._jobs.find_one_and_update(
            {"jobId": job_id, "status": "queued", "runAt": {"$lte": now}},
            {
                "$set": {
                    "status": "running",
                    "claimedBy": worker_id,
                    "attemptsStartedAt": now,
                    "startedAt": now,
                    "updatedAt": now,
                    "claimExpiresAt": now + timedelta(seconds=lease),
                    "fencingToken": fencing,
                },
                "$inc": {"attemptsMade": 1},
                "$push": {
                    "history": {
                        "attempt": None,  # filled below in readback correction; easier to patch after
                        "workerId": worker_id,
                        "startedAt": now,
                        "endedAt": None,
                        "outcome": None,
                        "error": None,
                        "fencingToken": fencing,
                    }
                },
            },
            return_document=ReturnDocument.AFTER,
        )
        if not doc:
            existing = await self._jobs.find_one({"jobId": job_id})
            if not existing:
                return {"ok": False, "error": "job-not-found"}
            return {"ok": False, "error": "job-not-claimable", "job": _job_doc_to_dict(existing, now)}
        # Patch attempt number in last history entry.
        attempts_made = int(doc.get("attemptsMade", 1))
        await self._jobs.update_one(
            {"jobId": job_id, "fencingToken": fencing, "history.fencingToken": fencing},
            {"$set": {"history.$[h].attempt": attempts_made}},
            array_filters=[{"h.fencingToken": fencing, "h.attempt": None}],
        )
        doc = await self._jobs.find_one({"jobId": job_id})
        return {"ok": True, "job": _job_doc_to_dict(doc, now)}

    async def claim_next_job(self, *, worker_id: str, job_types: list[str] | None = None, lease_seconds: int | None = None) -> dict[str, Any]:
        now = utcnow()
        await self._requeue_expired_claims(now)
        q: dict[str, Any] = {"status": "queued", "runAt": {"$lte": now}}
        if job_types:
            q["type"] = {"$in": list(job_types)}
        # Atomic claim: findOneAndUpdate with sort picks highest priority due job.
        # We loop in case of contention/race producing no-op; findOneAndUpdate itself is atomic.
        for _ in range(5):
            candidate = await self._jobs.find_one(q, sort=[("priority", DESCENDING), ("runAt", ASCENDING), ("createdAt", ASCENDING)], projection={"jobId": 1})
            if not candidate:
                return {"ok": True, "job": None}
            res = await self.claim_job(candidate["jobId"], worker_id=worker_id, lease_seconds=lease_seconds)
            if res.get("ok"):
                return res
            if res.get("error") == "job-not-found":
                continue
            # Not claimable (taken by another worker) - try next candidate.
            continue
        return {"ok": True, "job": None}

    async def heartbeat_job(self, job_id: str, *, worker_id: str, fencing_token: int, lease_seconds: int | None = None) -> dict[str, Any]:
        now = utcnow()
        await self._requeue_expired_claims(now)
        lease = max(5, lease_seconds or self._claim_lease_seconds)
        q: dict[str, Any] = {"jobId": job_id, "status": "running", "claimedBy": worker_id, "fencingToken": fencing_token}
        doc = await self._jobs.find_one_and_update(
            q,
            {"$set": {"claimExpiresAt": now + timedelta(seconds=lease), "updatedAt": now}},
            return_document=ReturnDocument.AFTER,
        )
        if not doc:
            existing = await self._jobs.find_one({"jobId": job_id})
            if not existing:
                return {"ok": False, "error": "job-not-found"}
            if existing.get("status") != "running" or existing.get("claimedBy") != worker_id:
                return {"ok": False, "error": "job-not-owned", "job": _job_doc_to_dict(existing, now)}
            if existing.get("fencingToken") != fencing_token:
                return {"ok": False, "error": "fencing-token-mismatch", "job": _job_doc_to_dict(existing, now)}
            return {"ok": False, "error": "job-not-owned", "job": _job_doc_to_dict(existing, now)}
        return {"ok": True, "job": _job_doc_to_dict(doc, now)}

    async def complete_job(self, job_id: str, *, worker_id: str, fencing_token: int, result: dict[str, Any] | None = None) -> dict[str, Any]:
        now = utcnow()
        await self._requeue_expired_claims(now)
        q: dict[str, Any] = {"jobId": job_id, "status": "running", "claimedBy": worker_id, "fencingToken": fencing_token}
        existing = await self._jobs.find_one({"jobId": job_id})
        if not existing:
            return {"ok": False, "error": "job-not-found"}
        if existing.get("status") != "running" or existing.get("claimedBy") != worker_id:
            return {"ok": False, "error": "job-not-owned", "job": _job_doc_to_dict(existing, now)}
        if existing.get("fencingToken") != fencing_token:
            return {"ok": False, "error": "fencing-token-mismatch", "job": _job_doc_to_dict(existing, now)}

        history = existing.get("history", [])
        if history and history[-1].get("outcome") is None:
            history[-1]["outcome"] = "succeeded"
            history[-1]["endedAt"] = now
        doc = await self._jobs.find_one_and_update(
            q,
            {"$set": {"status": "succeeded", "result": result or {}, "updatedAt": now, "completedAt": now, "claimExpiresAt": None, "history": history}},
            return_document=ReturnDocument.AFTER,
        )
        if not doc:
            latest = await self._jobs.find_one({"jobId": job_id})
            if not latest:
                return {"ok": False, "error": "job-not-found"}
            if latest.get("fencingToken") != fencing_token:
                return {"ok": False, "error": "fencing-token-mismatch", "job": _job_doc_to_dict(latest, now)}
            return {"ok": False, "error": "job-not-owned", "job": _job_doc_to_dict(latest, now)}
        return {"ok": True, "job": _job_doc_to_dict(doc, now)}

    async def fail_job(
        self,
        job_id: str,
        *,
        worker_id: str,
        fencing_token: int,
        error: dict[str, Any] | None = None,
        retryable: bool = True,
        retry_delay_seconds: int | None = None,
    ) -> dict[str, Any]:
        now = utcnow()
        await self._requeue_expired_claims(now)
        existing = await self._jobs.find_one({"jobId": job_id})
        if not existing:
            return {"ok": False, "error": "job-not-found"}
        if existing.get("status") != "running" or existing.get("claimedBy") != worker_id:
            return {"ok": False, "error": "job-not-owned", "job": _job_doc_to_dict(existing, now)}
        if existing.get("fencingToken") != fencing_token:
            return {"ok": False, "error": "fencing-token-mismatch", "job": _job_doc_to_dict(existing, now)}

        err = error or {"code": "job-failed", "message": "Job failed"}
        history = existing.get("history", [])
        if history and history[-1].get("outcome") is None:
            history[-1]["outcome"] = "failed"
            history[-1]["endedAt"] = now
            history[-1]["error"] = err

        attempts_made = int(existing.get("attemptsMade", 0))
        max_attempts = int(existing.get("maxAttempts", 1))
        can_retry = retryable and attempts_made < max_attempts
        q: dict[str, Any] = {"jobId": job_id, "status": "running", "claimedBy": worker_id, "fencingToken": fencing_token}
        if can_retry:
            delay = max(1, retry_delay_seconds or int(existing.get("retryDelaySeconds", self._default_retry_delay_seconds)))
            doc = await self._jobs.find_one_and_update(
                q,
                {"$set": {"status": "queued", "lastError": err, "updatedAt": now, "claimedBy": None, "claimExpiresAt": None, "runAt": now + timedelta(seconds=delay), "history": history}},
                return_document=ReturnDocument.AFTER,
            )
            if not doc:
                latest = await self._jobs.find_one({"jobId": job_id})
                return {"ok": False, "error": "job-not-owned", "job": _job_doc_to_dict(latest, now)}
            return {"ok": True, "job": _job_doc_to_dict(doc, now), "willRetry": True}

        final_status = "dead_letter" if retryable else "failed"
        doc = await self._jobs.find_one_and_update(
            q,
            {"$set": {"status": final_status, "lastError": err, "updatedAt": now, "completedAt": now, "claimedBy": None, "claimExpiresAt": None, "history": history}},
            return_document=ReturnDocument.AFTER,
        )
        if not doc:
            latest = await self._jobs.find_one({"jobId": job_id})
            return {"ok": False, "error": "job-not-owned", "job": _job_doc_to_dict(latest, now)}
        return {"ok": True, "job": _job_doc_to_dict(doc, now), "willRetry": False}

    async def cancel_job(self, job_id: str, *, reason: str | None = None) -> dict[str, Any]:
        now = utcnow()
        await self._requeue_expired_claims(now)
        existing = await self._jobs.find_one({"jobId": job_id})
        if not existing:
            return {"ok": False, "error": "job-not-found"}
        if existing.get("status") in {"succeeded", "failed", "dead_letter", "cancelled"}:
            return {"ok": False, "error": "job-not-cancellable", "job": _job_doc_to_dict(existing, now)}
        history = existing.get("history", [])
        if history and history[-1].get("outcome") is None:
            history[-1]["outcome"] = "cancelled"
            history[-1]["endedAt"] = now
        doc = await self._jobs.find_one_and_update(
            {"jobId": job_id, "status": {"$in": ["queued", "running"]}},
            {"$set": {"status": "cancelled", "cancelledReason": reason or "cancelled", "updatedAt": now, "completedAt": now, "claimedBy": None, "claimExpiresAt": None, "history": history}},
            return_document=ReturnDocument.AFTER,
        )
        if not doc:
            latest = await self._jobs.find_one({"jobId": job_id})
            if not latest:
                return {"ok": False, "error": "job-not-found"}
            return {"ok": False, "error": "job-not-cancellable", "job": _job_doc_to_dict(latest, now)}
        return {"ok": True, "job": _job_doc_to_dict(doc, now)}

    async def retry_job(self, job_id: str) -> dict[str, Any]:
        now = utcnow()
        await self._requeue_expired_claims(now)
        existing = await self._jobs.find_one({"jobId": job_id})
        if not existing:
            return {"ok": False, "error": "job-not-found"}
        if existing.get("status") not in {"failed", "dead_letter", "cancelled"}:
            return {"ok": False, "error": "job-not-retryable", "job": _job_doc_to_dict(existing, now)}
        doc = await self._jobs.find_one_and_update(
            {"jobId": job_id, "status": existing.get("status")},
            {"$set": {"status": "queued", "runAt": now, "updatedAt": now, "completedAt": None, "claimedBy": None, "claimExpiresAt": None, "cancelledReason": None, "attemptsMade": 0, "history": []}},
            return_document=ReturnDocument.AFTER,
        )
        if not doc:
            latest = await self._jobs.find_one({"jobId": job_id})
            return {"ok": False, "error": "job-not-retryable", "job": _job_doc_to_dict(latest, now)}
        return {"ok": True, "job": _job_doc_to_dict(doc, now)}
