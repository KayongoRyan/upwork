from __future__ import annotations

import importlib
import pkgutil
from typing import Any, Awaitable, Callable

from .errors import NonRetryableJobError

Handler = Callable[[dict[str, Any], Any], Awaitable[dict[str, Any]]]


class HandlerRegistry:
    def __init__(self) -> None:
        self._handlers: dict[str, Handler] = {}

    def register(self, job_type: str, handler: Handler) -> None:
        self._handlers[job_type] = handler

    def get(self, job_type: str) -> Handler | None:
        return self._handlers.get(job_type)

    def types(self) -> list[str]:
        return sorted(self._handlers.keys())

    def load_builtin(self) -> "HandlerRegistry":
        # Import all modules in this package except registry/errors/__init__ helpers.
        from . import __path__ as pkg_path

        for mod in pkgutil.iter_modules(pkg_path):
            name = mod.name
            if name.startswith("_") or name in {"registry", "errors"}:
                continue
            module = importlib.import_module(f"{__package__}.{name}")
            handler = getattr(module, "handle", None)
            job_types = getattr(module, "JOB_TYPES", None)
            if handler is None or job_types is None:
                continue
            if isinstance(job_types, str):
                job_types = [job_types]
            for jt in job_types:
                self.register(str(jt), handler)
        return self

    async def dispatch(self, job: dict[str, Any], ctx: Any) -> dict[str, Any]:
        job_type = str(job.get("type") or "")
        handler = self.get(job_type)
        if handler is None:
            raise NonRetryableJobError(
                f"No handler registered for job type '{job_type}'",
                code="unknown-job-type",
                details={"jobType": job_type, "registeredTypes": self.types()},
            )
        result = handler(job, ctx)
        if hasattr(result, "__await__"):
            result = await result  # type: ignore[misc]
        if result is None:
            return {}
        if not isinstance(result, dict):
            raise NonRetryableJobError(
                "Job handler must return a dict",
                code="invalid-handler-result",
                details={"jobType": job_type, "returnedType": type(result).__name__},
            )
        return result
