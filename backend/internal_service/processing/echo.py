from __future__ import annotations

from typing import Any

JOB_TYPES = ["internal.echo"]


async def handle(job: dict[str, Any], ctx: Any) -> dict[str, Any]:
    payload = job.get("payload") or {}
    return {
        "echo": payload,
        "jobId": job.get("jobId"),
        "type": job.get("type"),
        "workerId": getattr(ctx, "worker_id", None),
    }
