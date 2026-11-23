from __future__ import annotations

import hmac
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from pydantic import BaseModel, Field

from . import config
from .coordinator import WorkerCoordinator
from .jobs import JobStore


class RegisterWorkerRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    capabilities: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    workerId: str | None = Field(default=None, min_length=1, max_length=200)


class HeartbeatRequest(BaseModel):
    metadata: dict[str, Any] = Field(default_factory=dict)


class AcquireLockRequest(BaseModel):
    ownerWorkerId: str = Field(min_length=1)
    ttlSeconds: int | None = Field(default=None, ge=1, le=3600)


class ReleaseLockRequest(BaseModel):
    ownerWorkerId: str = Field(min_length=1)
    fencingToken: int | None = Field(default=None, ge=1)


class CreateJobRequest(BaseModel):
    type: str = Field(min_length=1, max_length=200)
    payload: dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=5, ge=1, le=10)
    maxAttempts: int | None = Field(default=None, ge=1, le=20)
    retryDelaySeconds: int | None = Field(default=None, ge=1, le=3600)
    idempotencyKey: str | None = Field(default=None, min_length=1, max_length=200)
    runAt: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ClaimJobRequest(BaseModel):
    workerId: str = Field(min_length=1, max_length=200)
    leaseSeconds: int | None = Field(default=None, ge=5, le=3600)


class ClaimNextJobRequest(BaseModel):
    workerId: str = Field(min_length=1, max_length=200)
    types: list[str] = Field(default_factory=list)
    leaseSeconds: int | None = Field(default=None, ge=5, le=3600)


class JobHeartbeatRequest(BaseModel):
    workerId: str = Field(min_length=1, max_length=200)
    leaseSeconds: int | None = Field(default=None, ge=5, le=3600)


class CompleteJobRequest(BaseModel):
    workerId: str = Field(min_length=1, max_length=200)
    result: dict[str, Any] = Field(default_factory=dict)


class FailJobRequest(BaseModel):
    workerId: str = Field(min_length=1, max_length=200)
    error: dict[str, Any] = Field(default_factory=dict)
    retryable: bool = True
    retryDelaySeconds: int | None = Field(default=None, ge=1, le=3600)


class CancelJobRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


coordinator = WorkerCoordinator(
    worker_ttl_seconds=config.WORKER_HEARTBEAT_TTL_SECONDS,
    lock_ttl_seconds=config.LOCK_TTL_SECONDS,
)
jobs = JobStore(
    default_max_attempts=config.JOB_DEFAULT_MAX_ATTEMPTS,
    default_retry_delay_seconds=config.JOB_DEFAULT_RETRY_DELAY_SECONDS,
    claim_lease_seconds=config.JOB_CLAIM_LEASE_SECONDS,
)


def require_internal_key(x_internal_service_key: str | None = Header(default=None, alias="X-Internal-Service-Key")) -> None:
    expected = config.INTERNAL_SERVICE_KEY
    if not expected:
        # Dev convenience: allow when key not configured. Production should set key.
        return
    if not x_internal_service_key or not hmac.compare_digest(expected, x_internal_service_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"ok": False, "error": "unauthorized"})


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


app = FastAPI(
    title="CPMIS Internal Service",
    version=config.SERVICE_VERSION,
    description="Internal service for health checks, worker coordination, and job processing contracts.",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": config.SERVICE_NAME,
        "version": config.SERVICE_VERSION,
        "status": "healthy",
    }


@app.get("/ready")
async def ready(_: None = Depends(require_internal_key)) -> dict[str, Any]:
    return {
        "ok": True,
        "service": config.SERVICE_NAME,
        "version": config.SERVICE_VERSION,
        "status": "ready",
        "coordination": await coordinator.status(),
    }


@app.get("/coordination/status")
async def coordination_status(_: None = Depends(require_internal_key)) -> dict[str, Any]:
    return {"ok": True, "coordination": await coordinator.status()}


@app.post("/workers/register", status_code=status.HTTP_201_CREATED)
async def register_worker(payload: RegisterWorkerRequest, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    worker = await coordinator.register_worker(
        name=payload.name,
        capabilities=payload.capabilities,
        metadata=payload.metadata,
        worker_id=payload.workerId,
    )
    return {"ok": True, "worker": worker}


@app.get("/workers")
async def list_workers(_: None = Depends(require_internal_key)) -> dict[str, Any]:
    return {"ok": True, "items": await coordinator.list_workers()}


@app.get("/workers/{worker_id}")
async def get_worker(worker_id: str, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    worker = await coordinator.get_worker(worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail={"ok": False, "error": "worker-not-found"})
    return {"ok": True, "worker": worker}


@app.post("/workers/{worker_id}/heartbeat")
async def heartbeat(worker_id: str, payload: HeartbeatRequest | None = None, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    worker = await coordinator.heartbeat(worker_id, metadata=(payload.metadata if payload else None))
    if not worker:
        raise HTTPException(status_code=404, detail={"ok": False, "error": "worker-not-found"})
    return {"ok": True, "worker": worker}


@app.post("/workers/{worker_id}/deregister")
async def deregister_worker(worker_id: str, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    removed = await coordinator.deregister(worker_id)
    if not removed:
        raise HTTPException(status_code=404, detail={"ok": False, "error": "worker-not-found"})
    return {"ok": True, "deregistered": True, "workerId": worker_id}


@app.get("/coordination/locks")
async def list_locks(_: None = Depends(require_internal_key)) -> dict[str, Any]:
    return {"ok": True, "items": await coordinator.list_locks()}


@app.post("/coordination/locks/{name}/acquire")
async def acquire_lock(name: str, payload: AcquireLockRequest, response: Response, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    result = await coordinator.acquire_lock(name=name, owner_worker_id=payload.ownerWorkerId, ttl_seconds=payload.ttlSeconds)
    if not result.get("ok"):
        err = result.get("error")
        if err == "worker-not-found":
            response.status_code = status.HTTP_404_NOT_FOUND
        elif err in {"worker-stale", "lock-held"}:
            response.status_code = status.HTTP_409_CONFLICT
        else:
            response.status_code = status.HTTP_400_BAD_REQUEST
    return result


@app.post("/coordination/locks/{name}/release")
async def release_lock(name: str, payload: ReleaseLockRequest, response: Response, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    result = await coordinator.release_lock(name=name, owner_worker_id=payload.ownerWorkerId, fencing_token=payload.fencingToken)
    if not result.get("ok"):
        err = result.get("error")
        if err in {"not-owner", "fencing-token-mismatch"}:
            response.status_code = status.HTTP_409_CONFLICT
        else:
            response.status_code = status.HTTP_400_BAD_REQUEST
    return result


# --- Jobs / processing contracts ---

def _job_error_response(result: dict[str, Any], response: Response) -> dict[str, Any]:
    err = result.get("error")
    if err == "job-not-found":
        response.status_code = status.HTTP_404_NOT_FOUND
    elif err in {"job-not-claimable", "job-not-owned", "job-not-cancellable", "job-not-retryable"}:
        response.status_code = status.HTTP_409_CONFLICT
    else:
        response.status_code = status.HTTP_400_BAD_REQUEST
    return result


@app.post("/jobs", status_code=status.HTTP_201_CREATED)
async def create_job(payload: CreateJobRequest, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    from datetime import datetime, timezone

    run_at = None
    if payload.runAt:
        try:
            run_at = datetime.fromisoformat(payload.runAt.replace("Z", "+00:00"))
            if run_at.tzinfo is None:
                run_at = run_at.replace(tzinfo=timezone.utc)
        except Exception:
            raise HTTPException(status_code=400, detail={"ok": False, "error": "invalid-run-at"})
    return await jobs.create_job(
        job_type=payload.type,
        payload=payload.payload,
        priority=payload.priority,
        max_attempts=payload.maxAttempts,
        retry_delay_seconds=payload.retryDelaySeconds,
        idempotency_key=payload.idempotencyKey,
        run_at=run_at,
        metadata=payload.metadata,
    )


@app.get("/jobs")
async def list_jobs(status_filter: str | None = None, type: str | None = None, limit: int = 100, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    return {"ok": True, "items": await jobs.list_jobs(status=status_filter, job_type=type, limit=limit)}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str, response: Response, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    job = await jobs.get_job(job_id)
    if not job:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"ok": False, "error": "job-not-found"}
    return {"ok": True, "job": job}


@app.post("/jobs/claim-next")
async def claim_next_job(payload: ClaimNextJobRequest, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    return await jobs.claim_next_job(worker_id=payload.workerId, job_types=payload.types or None, lease_seconds=payload.leaseSeconds)


@app.post("/jobs/{job_id}/claim")
async def claim_job(job_id: str, payload: ClaimJobRequest, response: Response, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    result = await jobs.claim_job(job_id, worker_id=payload.workerId, lease_seconds=payload.leaseSeconds)
    if not result.get("ok"):
        return _job_error_response(result, response)
    return result


@app.post("/jobs/{job_id}/heartbeat")
async def heartbeat_job(job_id: str, payload: JobHeartbeatRequest, response: Response, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    result = await jobs.heartbeat_job(job_id, worker_id=payload.workerId, lease_seconds=payload.leaseSeconds)
    if not result.get("ok"):
        return _job_error_response(result, response)
    return result


@app.post("/jobs/{job_id}/complete")
async def complete_job(job_id: str, payload: CompleteJobRequest, response: Response, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    result = await jobs.complete_job(job_id, worker_id=payload.workerId, result=payload.result)
    if not result.get("ok"):
        return _job_error_response(result, response)
    return result


@app.post("/jobs/{job_id}/fail")
async def fail_job(job_id: str, payload: FailJobRequest, response: Response, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    result = await jobs.fail_job(
        job_id,
        worker_id=payload.workerId,
        error=payload.error or {"code": "job-failed", "message": "Job failed"},
        retryable=payload.retryable,
        retry_delay_seconds=payload.retryDelaySeconds,
    )
    if not result.get("ok"):
        return _job_error_response(result, response)
    return result


@app.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, response: Response, payload: CancelJobRequest | None = None, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    result = await jobs.cancel_job(job_id, reason=(payload.reason if payload else None))
    if not result.get("ok"):
        return _job_error_response(result, response)
    return result


@app.post("/jobs/{job_id}/retry")
async def retry_job(job_id: str, response: Response, _: None = Depends(require_internal_key)) -> dict[str, Any]:
    result = await jobs.retry_job(job_id)
    if not result.get("ok"):
        return _job_error_response(result, response)
    return result
