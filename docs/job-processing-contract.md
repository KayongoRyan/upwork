# Job Processing Contract

This document defines job schemas and processing contracts for the internal FastAPI service (`backend/internal_service`). Express communicates with it through `backend/src/lib/internalServiceClient.js`.

## Security

- Internal endpoints (except `GET /health`) require `X-Internal-Service-Key`.
- Configure `INTERNAL_SERVICE_KEY` in both Express and Python service environments.
- Production should run the internal service on a private network/interface and require the key.

## Job Schema

### Create Job Request

`POST /jobs`

```json
{
  "type": "report.generate",
  "payload": { "projectId": "..." },
  "priority": 5,
  "maxAttempts": 3,
  "retryDelaySeconds": 15,
  "idempotencyKey": "optional-dedupe-key",
  "runAt": "2026-11-23T12:00:00Z",
  "metadata": { "source": "express" }
}
```

Fields:
- `type` (string, required): job type/handler key.
- `payload` (object, required): job input; must be JSON-serializable.
- `priority` (1-10, default 5): higher values claimed first.
- `maxAttempts` (1-20, default from env): total attempts including first claim.
- `retryDelaySeconds` (1-3600, default from env): delay before retry after retryable failure.
- `idempotencyKey` (optional): dedupes job creation; same key returns existing job with `deduped:true`.
- `runAt` (optional ISO datetime): earliest claim time.
- `metadata` (object): non-contract metadata.

### Job Record

```json
{
  "jobId": "job_...",
  "type": "report.generate",
  "payload": {},
  "status": "queued",
  "priority": 5,
  "maxAttempts": 3,
  "attemptsMade": 0,
  "retryDelaySeconds": 15,
  "idempotencyKey": null,
  "createdAt": "...",
  "updatedAt": "...",
  "runAt": "...",
  "claimedBy": null,
  "claimExpiresAt": null,
  "startedAt": null,
  "completedAt": null,
  "result": null,
  "lastError": null,
  "cancelledReason": null,
  "metadata": {},
  "history": [
    {
      "attempt": 1,
      "workerId": "wrk_...",
      "startedAt": "...",
      "endedAt": "...",
      "outcome": "succeeded|failed|lease-expired|cancelled",
      "error": { "code": "...", "message": "...", "details": {} }
    }
  ],
  "claimExpired": false
}
```

## Lifecycle

Statuses:
- `queued` - ready or scheduled for claim.
- `running` - claimed by a worker; has claim lease.
- `succeeded` - completed successfully.
- `failed` - terminal failure (non-retryable, or explicitly marked non-retryable).
- `dead_letter` - retryable failure exhausted `maxAttempts`.
- `cancelled` - cancelled before completion.

Transitions:
- create -> `queued`
- `queued` -> `running` via claim
- `running` -> `succeeded` via complete
- `running` -> `queued` via fail when retryable and attempts remain
- `running` -> `dead_letter` via fail when retryable and attempts exhausted
- `running` -> `failed` via fail when `retryable=false`
- `running` claim lease expired -> `queued` or `dead_letter` (same attempt budget rule)
- `queued|running` -> `cancelled` via cancel
- `failed|dead_letter|cancelled` -> `queued` via manual retry (resets attempts/history)

## Worker Contract

1. Register worker: `POST /workers/register`.
2. Claim work: `POST /jobs/claim-next` with `{workerId, types?, leaseSeconds?}`.
3. Heartbeat job while processing: `POST /jobs/{job_id}/heartbeat`.
4. Complete: `POST /jobs/{job_id}/complete` with `{workerId, result}`.
5. Fail: `POST /jobs/{job_id}/fail` with `{workerId, error, retryable, retryDelaySeconds?}`.

Rules:
- Only the claiming worker can heartbeat/complete/fail a running job.
- Claims have leases; expired leases are requeued or dead-lettered.
- Workers should send periodic heartbeats for long-running jobs.
- Job handlers must be idempotent where retries are possible.

## Failure / Retry Semantics

- **Retryable failure**: transient error; service requeues if attempts remain.
- **Non-retryable failure**: permanent error; status becomes `failed`.
- **Dead letter**: retryable but attempts exhausted; requires manual inspection/retry.
- **Manual retry**: `POST /jobs/{job_id}/retry` resets attempts and moves to `queued`.

Error object convention:

```json
{
  "code": "upstream-timeout",
  "message": "Upstream timed out",
  "details": { "service": "..." }
}
```

## Express Integration

Use `backend/src/lib/internalServiceClient.js`. It sends `X-Internal-Service-Key` and maps HTTP/timeouts to `InternalServiceError`.

Config (`backend/src/config.js` / env):
- `INTERNAL_SERVICE_URL`
- `INTERNAL_SERVICE_KEY`
- `INTERNAL_SERVICE_TIMEOUT_MS`