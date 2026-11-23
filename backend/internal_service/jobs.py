from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import uuid4


JobStatus = Literal["queued", "running", "succeeded", "failed", "dead_letter", "cancelled"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).isoformat() if dt else None


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@dataclass
class JobAttempt:
    attempt: int
    worker_id: str | None
    started_at: datetime
    ended_at: datetime | None = None
    outcome: str | None = None
    error: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "attempt": self.attempt,
            "workerId": self.worker_id,
            "startedAt": iso(self.started_at),
            "endedAt": iso(self.ended_at),
            "outcome": self.outcome,
            "error": self.error,
        }


@dataclass
class JobRecord:
    job_id: str
    type: str
    payload: dict[str, Any]
    status: JobStatus
    priority: int
    max_attempts: int
    attempts_made: int
    retry_delay_seconds: int
    idempotency_key: str | None
    created_at: datetime
    updated_at: datetime
    run_at: datetime
    claimed_by: str | None = None
    claim_expires_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    result: dict[str, Any] | None = None
    last_error: dict[str, Any] | None = None
    cancelled_reason: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    history: list[JobAttempt] = field(default_factory=list)

    def is_claimable(self, now: datetime) -> bool:
        if self.status != "queued":
            return False
        if self.run_at > now:
            return False
        return True

    def to_dict(self, now: datetime | None = None) -> dict[str, Any]:
        current = now or utcnow()
        return {
            "jobId": self.job_id,
            "type": self.type,
            "payload": self.payload,
            "status": self.status,
            "priority": self.priority,
            "maxAttempts": self.max_attempts,
            "attemptsMade": self.attempts_made,
            "retryDelaySeconds": self.retry_delay_seconds,
            "idempotencyKey": self.idempotency_key,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
            "runAt": iso(self.run_at),
            "claimedBy": self.claimed_by,
            "claimExpiresAt": iso(self.claim_expires_at),
            "startedAt": iso(self.started_at),
            "completedAt": iso(self.completed_at),
            "result": self.result,
            "lastError": self.last_error,
            "cancelledReason": self.cancelled_reason,
            "metadata": self.metadata,
            "history": [h.to_dict() for h in self.history],
            "claimExpired": bool(self.status == "running" and self.claim_expires_at and self.claim_expires_at <= current),
        }


class JobStore:
    def __init__(self, *, default_max_attempts: int = 3, default_retry_delay_seconds: int = 15, claim_lease_seconds: int = 60) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._idempotency: dict[str, str] = {}  # key -> job_id
        self._mutex = asyncio.Lock()
        self._default_max_attempts = max(1, default_max_attempts)
        self._default_retry_delay_seconds = max(1, default_retry_delay_seconds)
        self._claim_lease_seconds = max(5, claim_lease_seconds)

    def _requeue_expired_claims(self, now: datetime) -> None:
        for job in self._jobs.values():
            if job.status == "running" and job.claim_expires_at and job.claim_expires_at <= now:
                # Treat expired claim as a failed attempt due to lease timeout.
                attempt = job.history[-1] if job.history else None
                if attempt and attempt.outcome is None:
                    attempt.outcome = "lease-expired"
                    attempt.ended_at = now
                    attempt.error = {"code": "claim-lease-expired", "message": "Worker claim lease expired"}
                job.last_error = {"code": "claim-lease-expired", "message": "Worker claim lease expired"}
                job.claimed_by = None
                job.claim_expires_at = None
                job.updated_at = now
                if job.attempts_made < job.max_attempts:
                    job.status = "queued"
                    job.run_at = now + timedelta(seconds=job.retry_delay_seconds)
                else:
                    job.status = "dead_letter"
                    job.completed_at = now

    async def create_job(
        self,
        *,
        job_type: str,
        payload: dict[str, Any],
        priority: int = 5,
        max_attempts: int | None = None,
        retry_delay_seconds: int | None = None,
        idempotency_key: str | None = None,
        run_at: datetime | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            if idempotency_key:
                existing_id = self._idempotency.get(idempotency_key)
                if existing_id and existing_id in self._jobs:
                    return {"ok": True, "job": self._jobs[existing_id].to_dict(now), "deduped": True}

            job = JobRecord(
                job_id=f"job_{uuid4().hex}",
                type=job_type,
                payload=payload,
                status="queued",
                priority=max(1, min(10, priority)),
                max_attempts=max(1, max_attempts or self._default_max_attempts),
                attempts_made=0,
                retry_delay_seconds=max(1, retry_delay_seconds or self._default_retry_delay_seconds),
                idempotency_key=idempotency_key,
                created_at=now,
                updated_at=now,
                run_at=run_at or now,
                metadata=metadata or {},
            )
            self._jobs[job.job_id] = job
            if idempotency_key:
                self._idempotency[idempotency_key] = job.job_id
            return {"ok": True, "job": job.to_dict(now), "deduped": False}

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        async with self._mutex:
            now = utcnow()
            self._requeue_expired_claims(now)
            job = self._jobs.get(job_id)
            return job.to_dict(now) if job else None

    async def list_jobs(self, *, status: str | None = None, job_type: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        async with self._mutex:
            now = utcnow()
            self._requeue_expired_claims(now)
            jobs = list(self._jobs.values())
            if status:
                jobs = [j for j in jobs if j.status == status]
            if job_type:
                jobs = [j for j in jobs if j.type == job_type]
            jobs.sort(key=lambda j: (-j.priority, j.created_at))
            return [j.to_dict(now) for j in jobs[: max(1, min(limit, 500))]]

    async def claim_job(self, job_id: str, *, worker_id: str, lease_seconds: int | None = None) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            self._requeue_expired_claims(now)
            job = self._jobs.get(job_id)
            if not job:
                return {"ok": False, "error": "job-not-found"}
            if not job.is_claimable(now):
                return {"ok": False, "error": "job-not-claimable", "job": job.to_dict(now)}
            return self._claim(job, worker_id=worker_id, now=now, lease_seconds=lease_seconds)

    async def claim_next_job(self, *, worker_id: str, job_types: list[str] | None = None, lease_seconds: int | None = None) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            self._requeue_expired_claims(now)
            candidates = [j for j in self._jobs.values() if j.is_claimable(now)]
            if job_types:
                allowed = set(job_types)
                candidates = [j for j in candidates if j.type in allowed]
            candidates.sort(key=lambda j: (-j.priority, j.run_at, j.created_at))
            if not candidates:
                return {"ok": True, "job": None}
            return self._claim(candidates[0], worker_id=worker_id, now=now, lease_seconds=lease_seconds)

    def _claim(self, job: JobRecord, *, worker_id: str, now: datetime, lease_seconds: int | None) -> dict[str, Any]:
        job.status = "running"
        job.claimed_by = worker_id
        job.attempts_made += 1
        job.started_at = now
        job.updated_at = now
        lease = max(5, lease_seconds or self._claim_lease_seconds)
        job.claim_expires_at = now + timedelta(seconds=lease)
        job.history.append(JobAttempt(attempt=job.attempts_made, worker_id=worker_id, started_at=now))
        return {"ok": True, "job": job.to_dict(now)}

    async def heartbeat_job(self, job_id: str, *, worker_id: str, lease_seconds: int | None = None) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            self._requeue_expired_claims(now)
            job = self._jobs.get(job_id)
            if not job:
                return {"ok": False, "error": "job-not-found"}
            if job.status != "running" or job.claimed_by != worker_id:
                return {"ok": False, "error": "job-not-owned", "job": job.to_dict(now)}
            lease = max(5, lease_seconds or self._claim_lease_seconds)
            job.claim_expires_at = now + timedelta(seconds=lease)
            job.updated_at = now
            return {"ok": True, "job": job.to_dict(now)}

    async def complete_job(self, job_id: str, *, worker_id: str, result: dict[str, Any] | None = None) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            self._requeue_expired_claims(now)
            job = self._jobs.get(job_id)
            if not job:
                return {"ok": False, "error": "job-not-found"}
            if job.status != "running" or job.claimed_by != worker_id:
                return {"ok": False, "error": "job-not-owned", "job": job.to_dict(now)}
            job.status = "succeeded"
            job.result = result or {}
            job.updated_at = now
            job.completed_at = now
            job.claim_expires_at = None
            attempt = job.history[-1] if job.history else None
            if attempt and attempt.outcome is None:
                attempt.outcome = "succeeded"
                attempt.ended_at = now
            return {"ok": True, "job": job.to_dict(now)}

    async def fail_job(
        self,
        job_id: str,
        *,
        worker_id: str,
        error: dict[str, Any] | None = None,
        retryable: bool = True,
        retry_delay_seconds: int | None = None,
    ) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            self._requeue_expired_claims(now)
            job = self._jobs.get(job_id)
            if not job:
                return {"ok": False, "error": "job-not-found"}
            if job.status != "running" or job.claimed_by != worker_id:
                return {"ok": False, "error": "job-not-owned", "job": job.to_dict(now)}
            err = error or {"code": "job-failed", "message": "Job failed"}
            job.last_error = err
            job.updated_at = now
            job.claimed_by = None
            job.claim_expires_at = None
            attempt = job.history[-1] if job.history else None
            if attempt and attempt.outcome is None:
                attempt.outcome = "failed"
                attempt.ended_at = now
                attempt.error = err

            can_retry = retryable and job.attempts_made < job.max_attempts
            if can_retry:
                job.status = "queued"
                delay = max(1, retry_delay_seconds or job.retry_delay_seconds)
                job.run_at = now + timedelta(seconds=delay)
                return {"ok": True, "job": job.to_dict(now), "willRetry": True}
            job.status = "dead_letter" if retryable else "failed"
            job.completed_at = now
            return {"ok": True, "job": job.to_dict(now), "willRetry": False}

    async def cancel_job(self, job_id: str, *, reason: str | None = None) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            self._requeue_expired_claims(now)
            job = self._jobs.get(job_id)
            if not job:
                return {"ok": False, "error": "job-not-found"}
            if job.status in {"succeeded", "failed", "dead_letter", "cancelled"}:
                return {"ok": False, "error": "job-not-cancellable", "job": job.to_dict(now)}
            job.status = "cancelled"
            job.cancelled_reason = reason or "cancelled"
            job.updated_at = now
            job.completed_at = now
            job.claimed_by = None
            job.claim_expires_at = None
            attempt = job.history[-1] if job.history else None
            if attempt and attempt.outcome is None:
                attempt.outcome = "cancelled"
                attempt.ended_at = now
            return {"ok": True, "job": job.to_dict(now)}

    async def retry_job(self, job_id: str) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            self._requeue_expired_claims(now)
            job = self._jobs.get(job_id)
            if not job:
                return {"ok": False, "error": "job-not-found"}
            if job.status not in {"failed", "dead_letter", "cancelled"}:
                return {"ok": False, "error": "job-not-retryable", "job": job.to_dict(now)}
            job.status = "queued"
            job.run_at = now
            job.updated_at = now
            job.completed_at = None
            job.claimed_by = None
            job.claim_expires_at = None
            job.cancelled_reason = None
            # Manual retry gets a fresh attempt budget.
            job.attempts_made = 0
            job.history.clear()
            return {"ok": True, "job": job.to_dict(now)}
