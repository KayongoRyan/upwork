from __future__ import annotations

import asyncio
import logging
import os
import signal
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from . import config
from .coordinator import WorkerCoordinator
from .db import MongoManager
from .jobs import JobStore
from .processing.errors import NonRetryableJobError, RetryableJobError
from .processing.registry import HandlerRegistry

log = logging.getLogger("cpmis.internal.worker")


def _env(name: str, default: str) -> str:
    v = os.getenv(name)
    return v if v is not None and v != "" else default


@dataclass
class WorkerContext:
    worker_id: str
    worker_name: str
    job: dict[str, Any]
    fencing_token: int | None


class WorkerRunner:
    def __init__(
        self,
        *,
        db_manager: MongoManager | None = None,
        job_store: JobStore | None = None,
        coordinator: WorkerCoordinator | None = None,
        registry: HandlerRegistry | None = None,
        worker_id: str | None = None,
        worker_name: str | None = None,
        job_types: list[str] | None = None,
        poll_interval_seconds: float = 2.0,
        heartbeat_interval_seconds: float = 15.0,
        lease_seconds: int | None = None,
    ) -> None:
        self._db_manager = db_manager
        self._jobs = job_store
        self._coordinator = coordinator
        self._registry = registry or HandlerRegistry().load_builtin()
        self.worker_id = worker_id or _env("INTERNAL_WORKER_ID", f"wrk_{socket.gethostname()}_{os.getpid()}")
        self.worker_name = worker_name or _env("INTERNAL_WORKER_NAME", f"internal-worker-{socket.gethostname()}")
        self.job_types = job_types if job_types is not None else [s.strip() for s in _env("INTERNAL_WORKER_JOB_TYPES", "").split(",") if s.strip()]
        self.poll_interval_seconds = max(0.5, float(_env("INTERNAL_WORKER_POLL_INTERVAL_SECONDS", str(poll_interval_seconds))))
        self.heartbeat_interval_seconds = max(2.0, float(_env("INTERNAL_WORKER_HEARTBEAT_SECONDS", str(heartbeat_interval_seconds))))
        self.lease_seconds = int(_env("INTERNAL_WORKER_CLAIM_LEASE_SECONDS", str(lease_seconds or config.JOB_CLAIM_LEASE_SECONDS)))
        self._stop = asyncio.Event()
        self._registered = False

    @property
    def jobs(self) -> JobStore:
        if self._jobs is None:
            raise RuntimeError("JobStore not initialized")
        return self._jobs

    @property
    def coordinator(self) -> WorkerCoordinator:
        if self._coordinator is None:
            raise RuntimeError("WorkerCoordinator not initialized")
        return self._coordinator

    async def start(self) -> None:
        if self._jobs is None or self._coordinator is None:
            self._db_manager = self._db_manager or MongoManager()
            db = await self._db_manager.connect()
            self._jobs = JobStore(
                db,
                default_max_attempts=config.JOB_DEFAULT_MAX_ATTEMPTS,
                default_retry_delay_seconds=config.JOB_DEFAULT_RETRY_DELAY_SECONDS,
                claim_lease_seconds=config.JOB_CLAIM_LEASE_SECONDS,
            )
            self._coordinator = WorkerCoordinator(
                db,
                worker_ttl_seconds=config.WORKER_HEARTBEAT_TTL_SECONDS,
                lock_ttl_seconds=config.LOCK_TTL_SECONDS,
            )
        await self.register()

    async def close(self) -> None:
        if self._registered and self._coordinator is not None:
            try:
                await self._coordinator.deregister(self.worker_id)
            except Exception:
                log.exception("worker.deregister_failed worker_id=%s", self.worker_id)
            self._registered = False
        if self._db_manager is not None:
            await self._db_manager.close()

    async def register(self) -> None:
        await self.coordinator.register_worker(
            name=self.worker_name,
            capabilities=self.job_types or ["*"],
            metadata={
                "pid": os.getpid(),
                "hostname": socket.gethostname(),
                "startedAt": datetime.now(timezone.utc).isoformat(),
                "jobTypes": self.job_types,
            },
            worker_id=self.worker_id,
        )
        self._registered = True
        log.info("worker.registered worker_id=%s types=%s", self.worker_id, self.job_types or ["*"])

    async def run_forever(self) -> None:
        await self.start()
        worker_hb = asyncio.create_task(self._worker_heartbeat_loop(), name="worker-heartbeat")
        try:
            while not self._stop.is_set():
                try:
                    claimed = await self._claim_and_process_one()
                except Exception:
                    log.exception("worker.loop_error worker_id=%s", self.worker_id)
                    claimed = False
                if not claimed:
                    try:
                        await asyncio.wait_for(self._stop.wait(), timeout=self.poll_interval_seconds)
                    except asyncio.TimeoutError:
                        pass
        finally:
            worker_hb.cancel()
            try:
                await worker_hb
            except asyncio.CancelledError:
                pass
            except Exception:
                log.exception("worker.heartbeat_task_failed worker_id=%s", self.worker_id)
            await self.close()

    def request_stop(self) -> None:
        self._stop.set()

    async def _worker_heartbeat_loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self.coordinator.heartbeat(self.worker_id, metadata={"lastLoopAt": datetime.now(timezone.utc).isoformat()})
            except Exception:
                log.exception("worker.heartbeat_failed worker_id=%s", self.worker_id)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=min(self.heartbeat_interval_seconds, 30.0))
            except asyncio.TimeoutError:
                pass

    async def _claim_and_process_one(self) -> bool:
        res = await self.jobs.claim_next_job(worker_id=self.worker_id, job_types=self.job_types or None, lease_seconds=self.lease_seconds)
        if not res.get("ok"):
            log.warning("worker.claim_failed worker_id=%s result=%s", self.worker_id, res)
            return False
        job = res.get("job")
        if not job:
            return False
        await self._process_job(job)
        return True

    async def _process_job(self, job: dict[str, Any]) -> None:
        job_id = str(job.get("jobId"))
        job_type = str(job.get("type"))
        fencing_token = job.get("fencingToken")
        ctx = WorkerContext(worker_id=self.worker_id, worker_name=self.worker_name, job=job, fencing_token=fencing_token)
        log.info("worker.job_claimed worker_id=%s job_id=%s type=%s fencing=%s", self.worker_id, job_id, job_type, fencing_token)

        hb_stop = asyncio.Event()
        hb_task = asyncio.create_task(self._job_heartbeat_loop(job_id, fencing_token, hb_stop), name=f"job-heartbeat-{job_id}")
        try:
            result = await self._registry.dispatch(job, ctx)
            await self.jobs.complete_job(job_id, worker_id=self.worker_id, result=result, fencing_token=fencing_token)
            log.info("worker.job_completed worker_id=%s job_id=%s type=%s", self.worker_id, job_id, job_type)
        except asyncio.CancelledError:
            await self.jobs.fail_job(
                job_id,
                worker_id=self.worker_id,
                error={"code": "worker-cancelled", "message": "Worker cancelled while processing job"},
                retryable=True,
                fencing_token=fencing_token,
            )
            raise
        except RetryableJobError as exc:
            log.warning("worker.job_retryable_failure worker_id=%s job_id=%s type=%s err=%s", self.worker_id, job_id, job_type, exc)
            await self.jobs.fail_job(job_id, worker_id=self.worker_id, error=exc.to_dict(), retryable=True, fencing_token=fencing_token)
        except NonRetryableJobError as exc:
            log.warning("worker.job_nonretryable_failure worker_id=%s job_id=%s type=%s err=%s", self.worker_id, job_id, job_type, exc)
            await self.jobs.fail_job(job_id, worker_id=self.worker_id, error=exc.to_dict(), retryable=False, fencing_token=fencing_token)
        except Exception as exc:
            log.exception("worker.job_unhandled_failure worker_id=%s job_id=%s type=%s", self.worker_id, job_id, job_type)
            await self.jobs.fail_job(
                job_id,
                worker_id=self.worker_id,
                error={"code": "unhandled-exception", "message": str(exc), "details": {"exceptionType": type(exc).__name__}},
                retryable=True,
                fencing_token=fencing_token,
            )
        finally:
            hb_stop.set()
            hb_task.cancel()
            try:
                await hb_task
            except asyncio.CancelledError:
                pass
            except Exception:
                log.exception("worker.job_heartbeat_task_failed worker_id=%s job_id=%s", self.worker_id, job_id)

    async def _job_heartbeat_loop(self, job_id: str, fencing_token: int | None, stop: asyncio.Event) -> None:
        interval = max(2.0, min(self.heartbeat_interval_seconds, max(5.0, self.lease_seconds / 3)))
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=interval)
                return
            except asyncio.TimeoutError:
                pass
            try:
                res = await self.jobs.heartbeat_job(job_id, worker_id=self.worker_id, lease_seconds=self.lease_seconds, fencing_token=fencing_token)
                if not res.get("ok"):
                    log.warning("worker.job_heartbeat_rejected worker_id=%s job_id=%s result=%s", self.worker_id, job_id, res)
                    return
            except Exception:
                log.exception("worker.job_heartbeat_error worker_id=%s job_id=%s", self.worker_id, job_id)


async def run_worker() -> None:
    logging.basicConfig(level=os.getenv("INTERNAL_WORKER_LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s %(name)s %(message)s")
    runner = WorkerRunner()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, runner.request_stop)
        except NotImplementedError:
            # Windows/proactor may not support add_signal_handler for all signals.
            pass
    try:
        await runner.run_forever()
    finally:
        # close() is called by run_forever finally, but safe if start failed partially.
        pass


def main() -> None:
    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
