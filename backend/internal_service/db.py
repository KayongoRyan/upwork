from __future__ import annotations

from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from . import config


class MongoManager:
    def __init__(self) -> None:
        self.client: AsyncIOMotorClient | None = None
        self.db: AsyncIOMotorDatabase | None = None

    @property
    def enabled(self) -> bool:
        return bool(config.MONGODB_URI)

    async def connect(self) -> AsyncIOMotorDatabase:
        if self.db is not None:
            return self.db
        if not config.MONGODB_URI:
            raise RuntimeError(
                "INTERNAL_SERVICE_MONGODB_URI or MONGODB_URI is required for persistent internal service state"
            )
        self.client = AsyncIOMotorClient(
            config.MONGODB_URI,
            serverSelectionTimeoutMS=config.MONGODB_CONNECT_TIMEOUT_MS,
            connectTimeoutMS=config.MONGODB_CONNECT_TIMEOUT_MS,
        )
        # Force connection check early.
        await self.client.admin.command("ping")
        self.db = self.client[config.MONGODB_DB]
        await self.ensure_indexes(self.db)
        return self.db

    async def ensure_indexes(self, db: AsyncIOMotorDatabase) -> None:
        jobs = db["internal_jobs"]
        idempotency = db["internal_job_idempotency"]
        workers = db["internal_workers"]
        locks = db["internal_locks"]
        counters = db["internal_counters"]

        await jobs.create_index([("status", 1), ("runAt", 1), ("priority", -1), ("createdAt", 1)])
        await jobs.create_index([("status", 1), ("claimExpiresAt", 1)])
        await jobs.create_index([("idempotencyKey", 1)], sparse=True)
        await jobs.create_index([("type", 1), ("createdAt", -1)])
        await jobs.create_index([("updatedAt", -1)])

        await idempotency.create_index([("key", 1)], unique=True)
        await idempotency.create_index([("jobId", 1)])

        await workers.create_index([("workerId", 1)], unique=True)
        await workers.create_index([("lastHeartbeatAt", 1)])
        await workers.create_index([("status", 1)])

        await locks.create_index([("name", 1)], unique=True)
        await locks.create_index([("ownerWorkerId", 1)])
        await locks.create_index([("expiresAt", 1)])

        await counters.create_index([("name", 1)], unique=True)

    async def close(self) -> None:
        if self.client is not None:
            self.client.close()
        self.client = None
        self.db = None


mongo = MongoManager()
