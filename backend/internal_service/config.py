from __future__ import annotations

import os


def env(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value is not None and value != "" else default


SERVICE_NAME = env("INTERNAL_SERVICE_NAME", "cpmis-internal")
SERVICE_VERSION = env("INTERNAL_SERVICE_VERSION", "0.1.0")
HOST = env("INTERNAL_SERVICE_HOST", "127.0.0.1")
PORT = int(env("INTERNAL_SERVICE_PORT", "4010"))
INTERNAL_SERVICE_KEY = env("INTERNAL_SERVICE_KEY", "")
WORKER_HEARTBEAT_TTL_SECONDS = int(env("WORKER_HEARTBEAT_TTL_SECONDS", "30"))
LOCK_TTL_SECONDS = int(env("COORDINATION_LOCK_TTL_SECONDS", "60"))
JOB_DEFAULT_MAX_ATTEMPTS = int(env("JOB_DEFAULT_MAX_ATTEMPTS", "3"))
JOB_DEFAULT_RETRY_DELAY_SECONDS = int(env("JOB_DEFAULT_RETRY_DELAY_SECONDS", "15"))
JOB_CLAIM_LEASE_SECONDS = int(env("JOB_CLAIM_LEASE_SECONDS", "60"))

# Persistent coordination state (separate from portal business-state DB/reducer).
MONGODB_URI = env("INTERNAL_SERVICE_MONGODB_URI", env("MONGODB_URI", ""))
MONGODB_DB = env("INTERNAL_SERVICE_MONGODB_DB", "vertexa_internal")
MONGODB_CONNECT_TIMEOUT_MS = int(env("INTERNAL_SERVICE_MONGODB_CONNECT_TIMEOUT_MS", "5000"))
