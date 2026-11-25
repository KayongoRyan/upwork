# Internal Service (FastAPI)

Internal FastAPI service for liveness/readiness checks and worker coordination.

## Run

From `backend/` with the Python venv activated (or use the venv Python directly):

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn internal_service.main:app --host 127.0.0.1 --port 4010
```

Or:

```powershell
cd backend
.\.venv\Scripts\python.exe -m internal_service
```

## Worker

Run a Python job worker (registers worker, claims jobs, dispatches by `job.type`, sends heartbeats, reports success/failure):

```powershell
cd backend
.\.venv\Scripts\python.exe -m internal_service.worker
```

Handlers live in `backend/internal_service/processing/`. Each module exports `JOB_TYPES` and `async def handle(job, ctx) -> dict`. Unknown job types fail as non-retryable `unknown-job-type`.

Built-in handlers:
- `internal.echo` - echoes payload (diagnostic)
- `analytics.predictive` - baseline delay/cost-overrun predictive analytics from project snapshot payload
- `analytics.project` - project/portfolio analytics from snapshot payload
- `report.monthly-progress` - structured monthly progress report data from snapshot payload
- `report.project-workbook` - structured financial workbook data from snapshot payload
- `boq.parse` - dependency-free BOQ CSV/XLSX/TXT parsing + validation preview from base64 payload

The worker enforces per-job execution timeouts (`executionTimeoutSeconds` or `JOB_EXECUTION_TIMEOUT_SECONDS`) and detects controlled cancellation (`POST /jobs/{id}/cancel`). Timed-out handlers are cancelled and failed as retryable `execution-timeout`; cancelled jobs are detected by the worker monitor and the worker does not overwrite cancellation status.

## Environment

| Variable | Default | Description |
|---|---|---|
| `INTERNAL_SERVICE_NAME` | `cpmis-internal` | Service name reported by health endpoints |
| `INTERNAL_SERVICE_VERSION` | `0.1.0` | Service version |
| `INTERNAL_SERVICE_HOST` | `127.0.0.1` | Bind host for `python -m internal_service` |
| `INTERNAL_SERVICE_PORT` | `4010` | Bind port |
| `INTERNAL_SERVICE_KEY` | empty | Shared secret required by non-health endpoints when set |
| `INTERNAL_SERVICE_MONGODB_URI` | falls back to `MONGODB_URI` | MongoDB connection for persistent internal coordination state (**required**) |
| `INTERNAL_SERVICE_MONGODB_DB` | `vertexa_internal` | MongoDB database for internal service state (separate from portal business-state reducer) |
| `INTERNAL_SERVICE_MONGODB_CONNECT_TIMEOUT_MS` | `5000` | Mongo connect/select timeout |
| `WORKER_HEARTBEAT_TTL_SECONDS` | `30` | Worker heartbeat TTL before marked stale |
| `COORDINATION_LOCK_TTL_SECONDS` | `60` | Default coordination lock TTL |
| `JOB_DEFAULT_MAX_ATTEMPTS` | `3` | Default max attempts for jobs |
| `JOB_DEFAULT_RETRY_DELAY_SECONDS` | `15` | Default retry delay |
| `JOB_CLAIM_LEASE_SECONDS` | `60` | Default worker claim lease |
| `JOB_EXECUTION_TIMEOUT_SECONDS` | `300` | Default max handler execution time; timeout is reported as retryable `execution-timeout` |
| `INTERNAL_WORKER_ID` | auto | Worker ID for `python -m internal_service.worker` |
| `INTERNAL_WORKER_NAME` | auto | Worker display name |
| `INTERNAL_WORKER_JOB_TYPES` | empty = all | Comma-separated job types this worker will claim |
| `INTERNAL_WORKER_POLL_INTERVAL_SECONDS` | `2.0` | Poll interval when no job is available |
| `INTERNAL_WORKER_HEARTBEAT_SECONDS` | `15` | Worker/job heartbeat interval |
| `INTERNAL_WORKER_CLAIM_LEASE_SECONDS` | `JOB_CLAIM_LEASE_SECONDS` | Claim lease for worker |
| `INTERNAL_WORKER_LOG_LEVEL` | `INFO` | Worker log level |

## Persistence

Job records, idempotency keys, worker registrations, coordination locks, and fencing counters are stored in MongoDB (`INTERNAL_SERVICE_MONGODB_DB`, default `vertexa_internal`). This state is intentionally separate from the portal business-state reducer/collections. Job claims use atomic Mongo `findOneAndUpdate`; idempotency keys use a unique index; expired leases are requeued/dead-lettered; fencing tokens protect stale workers from mutating reclaimed jobs/locks.

## Security

All endpoints except `GET /health` require `X-Internal-Service-Key` when `INTERNAL_SERVICE_KEY` is configured. Express should call this service using `backend/src/lib/internalServiceClient.js`.

## Endpoints

### Health/coordination
- `GET /health` - liveness (open)
- `GET /ready` - readiness + coordination status
- `GET /coordination/status` - worker/lock summary
- `POST /workers/register` - register worker `{name, capabilities?, metadata?, workerId?}`
- `GET /workers` - list workers
- `GET /workers/{worker_id}` - worker details
- `POST /workers/{worker_id}/heartbeat` - heartbeat `{metadata?}`
- `POST /workers/{worker_id}/deregister` - deregister and release owned locks
- `GET /coordination/locks` - list locks
- `POST /coordination/locks/{name}/acquire` - acquire lock `{ownerWorkerId, ttlSeconds?}`
- `POST /coordination/locks/{name}/release` - release lock `{ownerWorkerId, fencingToken?}`

### Jobs
- `POST /jobs` - enqueue job
- `GET /jobs?status=&type=&limit=` - list jobs
- `GET /jobs/{job_id}` - job details
- `POST /jobs/claim-next` - claim next queued job `{workerId, types?, leaseSeconds?}`
- `POST /jobs/{job_id}/claim` - claim specific job `{workerId, leaseSeconds?}`
- `POST /jobs/{job_id}/heartbeat` - extend claim lease `{workerId, leaseSeconds?, fencingToken}`
- `POST /jobs/{job_id}/complete` - complete job `{workerId, result?, fencingToken}`
- `POST /jobs/{job_id}/fail` - fail job `{workerId, error?, retryable?, retryDelaySeconds?, fencingToken}`
- `POST /jobs/{job_id}/cancel` - cancel queued/running job `{reason?}`
- `POST /jobs/{job_id}/retry` - manually requeue failed/dead/cancelled job

See [../../docs/job-processing-contract.md](../../docs/job-processing-contract.md) for schemas and lifecycle.