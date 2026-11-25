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
  "type": "analytics.predictive",
  "payload": { "state": { "projects": [], "tasks": [], "boq": [], "progressMarks": [] } },
  "priority": 5,
  "maxAttempts": 3,
  "retryDelaySeconds": 15,
  "executionTimeoutSeconds": 300,
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
- `executionTimeoutSeconds` (1-86400, optional, default `JOB_EXECUTION_TIMEOUT_SECONDS`): maximum handler execution time. Timeout is treated as a retryable `execution-timeout` failure if attempts remain.
- `idempotencyKey` (optional): dedupes job creation; same key returns existing job with `deduped:true`.
- `runAt` (optional ISO datetime): earliest claim time.
- `metadata` (object): non-contract metadata.

### Job Record

```json
{
  "jobId": "job_...",
  "type": "analytics.predictive",
  "payload": {},
  "status": "queued",
  "priority": 5,
  "maxAttempts": 3,
  "attemptsMade": 0,
  "retryDelaySeconds": 15,
  "executionTimeoutSeconds": 300,
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
      "error": { "code": "...", "message": "...", "details": {} },
      "fencingToken": 1
    }
  ],
  "claimExpired": false,
  "fencingToken": 1
}
```

## Persistence & Coordination

- **Persistent storage**: job records, idempotency keys, worker registrations, coordination locks, and fencing counters are stored in MongoDB (`INTERNAL_SERVICE_MONGODB_DB`, default `vertexa_internal`), separate from portal business-state reducer collections.
- **Atomic claiming**: job claims use Mongo `findOneAndUpdate` with status/runAt filters and priority/runAt/createdAt sort; claims are atomic per document.
- **Idempotency**: `internal_job_idempotency.key` has a unique index. Duplicate create requests with the same key return the existing job with `deduped:true`.
- **Lease expiration**: running jobs with expired `claimExpiresAt` are requeued if attempts remain, otherwise moved to `dead_letter`.
- **Fencing tokens**: each claim increments a fencing token stored on the job and history attempt. Heartbeat/complete/fail **require** `fencingToken`; stale workers with missing or mismatched tokens are rejected.

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
3. Heartbeat job while processing: `POST /jobs/{job_id}/heartbeat` with `{workerId, leaseSeconds?, fencingToken}`.
4. Complete: `POST /jobs/{job_id}/complete` with `{workerId, result, fencingToken}`.
5. Fail: `POST /jobs/{job_id}/fail` with `{workerId, error, retryable, retryDelaySeconds?, fencingToken}`.

Rules:
- Only the claiming worker can heartbeat/complete/fail a running job.
- Claims have leases; expired leases are requeued or dead-lettered.
- Workers should send periodic heartbeats for long-running jobs.
- Job handlers must be idempotent where retries are possible.
- Handlers should be async and cooperative with cancellation (`asyncio.CancelledError`) because timeout/cancellation stops handler tasks.

## Execution Timeout & Controlled Cancellation

- **Execution timeout**: each job may set `executionTimeoutSeconds`; otherwise the worker uses `JOB_EXECUTION_TIMEOUT_SECONDS` (default 300s). The worker enforces this deadline while the handler runs.
- **Timeout outcome**: when the deadline is exceeded, the worker cancels the handler task and reports `fail_job` with `retryable=true` and error code `execution-timeout` (unless attempts are exhausted, in which case normal fail semantics move it to `dead_letter`).
- **Controlled cancellation**: clients cancel via `POST /jobs/{job_id}/cancel` with `{reason?}`. The cancel endpoint marks queued/running jobs as `cancelled`.
- **Worker cancellation detection**: the worker monitor polls job state and fencing ownership. If it observes `status=cancelled`, missing job, or fencing/ownership loss, it cancels the handler task and exits without overwriting the cancelled/fenced state.
- **Shutdown behavior**: on worker shutdown, in-flight handlers are interrupted; jobs not explicitly completed/failed remain protected by claim lease expiration and will be requeued/dead-lettered by normal lease rules.

## Failure / Retry Semantics

- **Retryable failure**: transient error; service requeues if attempts remain. Handlers signal this by raising `RetryableJobError`.
- **Non-retryable failure**: permanent error; status becomes `failed`. Handlers signal this by raising `NonRetryableJobError`.
- **Unhandled handler exception**: treated as non-retryable (`failed`) by default, because unexpected exceptions are often deterministic; handlers should catch transient errors and raise `RetryableJobError` explicitly.
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

## Supported Job Types (Python worker)

Handlers live in `backend/internal_service/processing/` and are auto-discovered by `JOB_TYPES` + `async handle(job, ctx)`.

| Job type | Payload (minimum) | Result |
|---|---|---|
| `internal.echo` | any `payload` | echoes payload/job/worker metadata |
| `analytics.predictive` | `payload.state` (or payload containing `projects`, `tasks`, `boq/boqLines`, `progressMarks`) ; optional `now` | baseline delay/cost-overrun forecasts, evaluation, limitations |
| `analytics.project` | `payload.state` (or payload containing `projects/tasks/boq`) ; optional `projectId`, `now` | portfolio/project analytics, deviations, insights |
| `report.monthly-progress` | `payload.state`, `payload.month` (`YYYY-MM`), optional `projectId` | structured monthly progress report (summary, projectProgress, tasks, siteReports) |
| `report.project-workbook` | `payload.state`, optional `projectId`, `from`, `to` | structured workbook data (summary, projects, boq, costReports) |
| `boq.parse` | `payload.contentBase64` (or base64 `content`), optional `fileName`, `format` (`xlsx\|csv\|txt`) | BOQ import preview with mapped rows, validation errors/warnings, selection flags |

Notes:
- Analytics/report handlers are payload-driven snapshots; they do not mutate portal business state.
- `boq.parse` performs dependency-free parsing/validation only; accepting/importing into business records remains an explicit application action.
- Unknown job types fail as non-retryable `unknown-job-type`.

## Express Integration

Use `backend/src/lib/internalServiceClient.js`. It sends `X-Internal-Service-Key` and maps HTTP/timeouts to `InternalServiceError`.

Config (`backend/src/config.js` / env):
- `INTERNAL_SERVICE_URL`
- `INTERNAL_SERVICE_KEY`
- `INTERNAL_SERVICE_TIMEOUT_MS`