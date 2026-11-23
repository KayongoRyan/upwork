from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


@dataclass
class WorkerRecord:
    worker_id: str
    name: str
    capabilities: list[str]
    metadata: dict[str, Any]
    registered_at: datetime
    last_heartbeat_at: datetime
    status: str = "online"
    heartbeat_ttl_seconds: int = 30

    def expires_at(self) -> datetime:
        return self.last_heartbeat_at + timedelta(seconds=self.heartbeat_ttl_seconds)

    def is_stale(self, now: datetime | None = None) -> bool:
        return (now or utcnow()) >= self.expires_at()

    def to_dict(self, now: datetime | None = None) -> dict[str, Any]:
        current = now or utcnow()
        stale = self.is_stale(current)
        return {
            "workerId": self.worker_id,
            "name": self.name,
            "capabilities": self.capabilities,
            "metadata": self.metadata,
            "status": "stale" if stale else self.status,
            "registeredAt": iso(self.registered_at),
            "lastHeartbeatAt": iso(self.last_heartbeat_at),
            "expiresAt": iso(self.expires_at()),
        }


@dataclass
class LockRecord:
    name: str
    owner_worker_id: str
    acquired_at: datetime
    expires_at: datetime
    fencing_token: int

    def is_expired(self, now: datetime | None = None) -> bool:
        return (now or utcnow()) >= self.expires_at

    def to_dict(self, now: datetime | None = None) -> dict[str, Any]:
        current = now or utcnow()
        return {
            "name": self.name,
            "ownerWorkerId": self.owner_worker_id,
            "acquiredAt": iso(self.acquired_at),
            "expiresAt": iso(self.expires_at),
            "expired": self.is_expired(current),
            "fencingToken": self.fencing_token,
        }


@dataclass
class CoordinatorState:
    workers: dict[str, WorkerRecord] = field(default_factory=dict)
    locks: dict[str, LockRecord] = field(default_factory=dict)
    fencing_counter: int = 0


class WorkerCoordinator:
    def __init__(self, *, worker_ttl_seconds: int = 30, lock_ttl_seconds: int = 60) -> None:
        self._state = CoordinatorState()
        self._mutex = asyncio.Lock()
        self._worker_ttl_seconds = worker_ttl_seconds
        self._lock_ttl_seconds = lock_ttl_seconds

    async def register_worker(
        self,
        *,
        name: str,
        capabilities: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        worker_id: str | None = None,
    ) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            wid = worker_id or f"wrk_{uuid4().hex}"
            record = WorkerRecord(
                worker_id=wid,
                name=name,
                capabilities=capabilities or [],
                metadata=metadata or {},
                registered_at=now,
                last_heartbeat_at=now,
                status="online",
                heartbeat_ttl_seconds=self._worker_ttl_seconds,
            )
            self._state.workers[wid] = record
            return record.to_dict(now)

    async def heartbeat(self, worker_id: str, *, metadata: dict[str, Any] | None = None) -> dict[str, Any] | None:
        async with self._mutex:
            now = utcnow()
            record = self._state.workers.get(worker_id)
            if not record:
                return None
            record.last_heartbeat_at = now
            record.status = "online"
            if metadata:
                record.metadata.update(metadata)
            return record.to_dict(now)

    async def deregister(self, worker_id: str) -> bool:
        async with self._mutex:
            record = self._state.workers.pop(worker_id, None)
            if not record:
                return False
            now = utcnow()
            for name, lock in list(self._state.locks.items()):
                if lock.owner_worker_id == worker_id and not lock.is_expired(now):
                    del self._state.locks[name]
            return True

    async def list_workers(self) -> list[dict[str, Any]]:
        async with self._mutex:
            now = utcnow()
            return [w.to_dict(now) for w in sorted(self._state.workers.values(), key=lambda x: x.registered_at)]

    async def get_worker(self, worker_id: str) -> dict[str, Any] | None:
        async with self._mutex:
            record = self._state.workers.get(worker_id)
            return record.to_dict() if record else None

    async def acquire_lock(self, *, name: str, owner_worker_id: str, ttl_seconds: int | None = None) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            worker = self._state.workers.get(owner_worker_id)
            if not worker:
                return {"ok": False, "error": "worker-not-found"}
            if worker.is_stale(now):
                return {"ok": False, "error": "worker-stale"}

            existing = self._state.locks.get(name)
            if existing and not existing.is_expired(now) and existing.owner_worker_id != owner_worker_id:
                return {"ok": False, "error": "lock-held", "lock": existing.to_dict(now)}

            ttl = ttl_seconds if ttl_seconds and ttl_seconds > 0 else self._lock_ttl_seconds
            self._state.fencing_counter += 1
            lock = LockRecord(
                name=name,
                owner_worker_id=owner_worker_id,
                acquired_at=now,
                expires_at=now + timedelta(seconds=ttl),
                fencing_token=self._state.fencing_counter,
            )
            self._state.locks[name] = lock
            return {"ok": True, "lock": lock.to_dict(now)}

    async def release_lock(self, *, name: str, owner_worker_id: str, fencing_token: int | None = None) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            existing = self._state.locks.get(name)
            if not existing:
                return {"ok": True, "released": False, "reason": "not-found"}
            if existing.is_expired(now):
                del self._state.locks[name]
                return {"ok": True, "released": False, "reason": "expired"}
            if existing.owner_worker_id != owner_worker_id:
                return {"ok": False, "error": "not-owner", "lock": existing.to_dict(now)}
            if fencing_token is not None and existing.fencing_token != fencing_token:
                return {"ok": False, "error": "fencing-token-mismatch", "lock": existing.to_dict(now)}
            del self._state.locks[name]
            return {"ok": True, "released": True}

    async def list_locks(self) -> list[dict[str, Any]]:
        async with self._mutex:
            now = utcnow()
            # Opportunistically drop expired locks from listing? keep visible with expired flag.
            return [l.to_dict(now) for l in sorted(self._state.locks.values(), key=lambda x: x.name)]

    async def status(self) -> dict[str, Any]:
        async with self._mutex:
            now = utcnow()
            workers = [w.to_dict(now) for w in self._state.workers.values()]
            locks = [l.to_dict(now) for l in self._state.locks.values()]
            return {
                "workers": {
                    "total": len(workers),
                    "online": sum(1 for w in workers if w["status"] == "online"),
                    "stale": sum(1 for w in workers if w["status"] == "stale"),
                },
                "locks": {
                    "total": len(locks),
                    "active": sum(1 for l in locks if not l["expired"]),
                    "expired": sum(1 for l in locks if l["expired"]),
                },
            }
