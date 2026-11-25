from __future__ import annotations

from typing import Any


class RetryableJobError(Exception):
    """Raise for transient failures that should be retried if attempts remain."""

    def __init__(self, message: str = "Retryable job failure", *, code: str = "retryable-error", details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "details": self.details}


class NonRetryableJobError(Exception):
    """Raise for permanent failures that should not be retried."""

    def __init__(self, message: str = "Non-retryable job failure", *, code: str = "non-retryable-error", details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "details": self.details}
