"""Processing modules for internal service jobs.

Each module should expose:

    JOB_TYPES: list[str] | str
    async def handle(job: dict, ctx: "WorkerContext") -> dict

The handler returns a JSON-serializable result dict on success.
Raise RetryableJobError for transient failures, or any other Exception for
non-retryable/terminal failure (worker marks retryable based on exception type).
"""
