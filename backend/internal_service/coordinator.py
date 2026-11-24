from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument


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


def _worker_dict(doc: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    current = now or utcnow()
    last = as_utc(doc.get("lastHeartbeatAt")) or current
    ttl = int(doc.get("heartbeatTtlSeconds", 30))
    expires = last + timedelta(seconds=ttl)
    stale = current >= expires
    return {
        "workerId": doc.get("workerId"),
        "name": doc.get("name"),
        "capabilities": doc.get("capabilities", []),
        "metadata": doc.get("metadata", {}),
        "status": "stale" if stale else doc.get("status", "online"),
        "registeredAt": iso(as_utc(doc.get("registeredAt"))),
        "lastHeartbeatAt": iso(last),
        "expiresAt": iso(expires),
    }


def _lock_dict(doc: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    current = now or utcnow()
    expires = as_utc(doc.get("expiresAt")) or current
    return {
        "name": doc.get("name"),
        "ownerWorkerId": doc.get("ownerWorkerId"),
        "acquiredAt": iso(as_utc(doc.get("acquiredAt"))),
        "expiresAt": iso(expires),
        "expired": current >= expires,
        "fencingToken": doc.get("fencingToken"),
    }


class WorkerCoordinator:
    def __init__(self, db: AsyncIOMotorDatabase, *, worker_ttl_seconds: int = 30, lock_ttl_seconds: int = 60) -> None:
        self._db = db
        self._workers = db["internal_workers"]
        self._locks = db["internal_locks"]
        self._counters = db["internal_counters"]
        self._worker_ttl_seconds = max(5, worker_ttl_seconds)
        self._lock_ttl_seconds = max(5, lock_ttl_seconds)

    async def _next_fencing_token(self, name: str) -> int:
        doc = await self._counters.find_one_and_update(
            {"name": name},
            {"$inc": {"value": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return int(doc.get("value", 1))

    def _is_stale(self, worker_doc: dict[str, Any], now: datetime) -> bool:
        last = as_utc(worker_doc.get("lastHeartbeatAt")) or now
        ttl = int(worker_doc.get("heartbeatTtlSeconds", self._worker_ttl_seconds))
        return now >= (last + timedelta(seconds=ttl))

    async def register_worker(
        self,
        *,
        name: str,
        capabilities: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        worker_id: str | None = None,
    ) -> dict[str, Any]:
        now = utcnow()
        wid = worker_id or f"wrk_{uuid4().hex}"
        doc = {
            "workerId": wid,
            "name": name,
            "capabilities": capabilities or [],
            "metadata": metadata or {},
            "registeredAt": now,
            "lastHeartbeatAt": now,
            "status": "online",
            "heartbeatTtlSeconds": self._worker_ttl_seconds,
        }
        await self._workers.update_one({"workerId": wid}, {"$set": doc}, upsert=True)
        stored = await self._workers.find_one({"workerId": wid})
        return _worker_dict(stored or doc, now)

    async def heartbeat(self, worker_id: str, *, metadata: dict[str, Any] | None = None) -> dict[str, Any] | None:
        now = utcnow()
        update: dict[str, Any] = {"$set": {"lastHeartbeatAt": now, "status": "online"}}
        if metadata:
            # merge metadata atomically per keys
            for k, v in metadata.items():
                update["$set"][f"metadata.{k}"] = v
        doc = await self._workers.find_one_and_update(
            {"workerId": worker_id},
            update,
            return_document=ReturnDocument.AFTER,
        )
        return _worker_dict(doc, now) if doc else None

    async def deregister(self, worker_id: str) -> bool:
        now = utcnow()
        res = await self._workers.delete_one({"workerId": worker_id})
        if res.deleted_count == 0:
            return False
        # Release active locks owned by this worker.
        await self._locks.delete_many({"ownerWorkerId": worker_id, "expiresAt": {"$gt": now}})
        return True

    async def list_workers(self) -> list[dict[str, Any]]:
        now = utcnow()
        cursor = self._workers.find({}).sort("registeredAt", 1)
        docs = await cursor.to_list(length=1000)
        return [_worker_dict(d, now) for d in docs]

    async def get_worker(self, worker_id: str) -> dict[str, Any] | None:
        now = utcnow()
        doc = await self._workers.find_one({"workerId": worker_id})
        return _worker_dict(doc, now) if doc else None

    async def acquire_lock(self, *, name: str, owner_worker_id: str, ttl_seconds: int | None = None) -> dict[str, Any]:
        now = utcnow()
        worker = await self._workers.find_one({"workerId": owner_worker_id})
        if not worker:
            return {"ok": False, "error": "worker-not-found"}
        if self._is_stale(worker, now):
            return {"ok": False, "error": "worker-stale"}

        ttl = ttl_seconds if ttl_seconds and ttl_seconds > 0 else self._lock_ttl_seconds
        expires_at = now + timedelta(seconds=ttl)

        existing = await self._locks.find_one({"name": name})
        if existing:
            existing_expires = as_utc(existing.get("expiresAt")) or now
            if existing_expires > now and existing.get("ownerWorkerId") != owner_worker_id:
                return {"ok": False, "error": "lock-held", "lock": _lock_dict(existing, now)}
            # Reentrant or expired - take over with new fencing token.
            fencing = await self._next_fencing_token(f"lock:{name}")
            doc = await self._locks.find_one_and_update(
                {"name": name, "fencingToken": existing.get("fencingToken")},
                {"$set": {"ownerWorkerId": owner_worker_id, "acquiredAt": now, "expiresAt": expires_at, "fencingToken": fencing}},
                return_document=ReturnDocument.AFTER,
            )
            if doc:
                return {"ok": True, "lock": _lock_dict(doc, now)}
            # Race: retry once by reading.
            latest = await self._locks.find_one({"name": name})
            if latest and (as_utc(latest.get("expiresAt")) or now) > now and latest.get("ownerWorkerId") != owner_worker_id:
                return {"ok": False, "error": "lock-held", "lock": _lock_dict(latest, now)}

        fencing = await self._next_fencing_token(f"lock:{name}")
        lock_doc = {"name": name, "ownerWorkerId": owner_worker_id, "acquiredAt": now, "expiresAt": expires_at, "fencingToken": fencing}
        try:
            await self._locks.insert_one(lock_doc)
            return {"ok": True, "lock": _lock_dict(lock_doc, now)}
        except Exception:
            # Duplicate key race - attempt atomic takeover if expired.
            latest = await self._locks.find_one({"name": name})
            if not latest:
                return {"ok": False, "error": "lock-held"}
            latest_expires = as_utc(latest.get("expiresAt")) or now
            if latest_expires > now and latest.get("ownerWorkerId") != owner_worker_id:
                return {"ok": False, "error": "lock-held", "lock": _lock_dict(latest, now)}
            fencing2 = await self._next_fencing_token(f"lock:{name}")
            doc = await self._locks.find_one_and_update(
                {"name": name, "fencingToken": latest.get("fencingToken")},
                {"$set": {"ownerWorkerId": owner_worker_id, "acquiredAt": now, "expiresAt": expires_at, "fencingToken": fencing2}},
                return_document=ReturnDocument.AFTER,
            )
            if doc:
                return {"ok": True, "lock": _lock_dict(doc, now)}
            latest2 = await self._locks.find_one({"name": name})
            return {"ok": False, "error": "lock-held", "lock": _lock_dict(latest2, now) if latest2 else None}

    async def release_lock(self, *, name: str, owner_worker_id: str, fencing_token: int | None = None) -> dict[str, Any]:
        now = utcnow()
        existing = await self._locks.find_one({"name": name})
        if not existing:
            return {"ok": True, "released": False, "reason": "not-found"}
        expires = as_utc(existing.get("expiresAt")) or now
        if expires <= now:
            await self._locks.delete_one({"name": name, "fencingToken": existing.get("fencingToken")})
            return {"ok": True, "released": False, "reason": "expired"}
        if existing.get("ownerWorkerId") != owner_worker_id:
            return {"ok": False, "error": "not-owner", "lock": _lock_dict(existing, now)}
        if fencing_token is not None and existing.get("fencingToken") != fencing_token:
            return {"ok": False, "error": "fencing-token-mismatch", "lock": _lock_dict(existing, now)}
        deleted = await self._locks.delete_one({"name": name, "ownerWorkerId": owner_worker_id, "fencingToken": existing.get("fencingToken")})
        return {"ok": True, "released": deleted.deleted_count > 0}

    async def list_locks(self) -> list[dict[str, Any]]:
        now = utcnow()
        cursor = self._locks.find({}).sort("name", 1)
        docs = await cursor.to_list(length=1000)
        return [_lock_dict(d, now) for d in docs]

    async def status(self) -> dict[str, Any]:
        now = utcnow()
        workers = await self._workers.find({}).to_list(length=10000)
        locks = await self._locks.find({}).to_list(length=10000)
        wdicts = [_worker_dict(w, now) for w in workers]
        ldicts = [_lock_dict(l, now) for l in locks]
        return {
            "workers": {
                "total": len(wdicts),
                "online": sum(1 for w in wdicts if w["status"] == "online"),
                "stale": sum(1 for w in wdicts if w["status"] == "stale"),
            },
            "locks": {
                "total": len(ldicts),
                "active": sum(1 for l in ldicts if not l["expired"]),
                "expired": sum(1 for l in ldicts if l["expired"]),
            },
        }
