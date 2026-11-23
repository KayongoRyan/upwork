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

## Environment

| Variable | Default | Description |
|---|---|---|
| `INTERNAL_SERVICE_NAME` | `cpmis-internal` | Service name reported by health endpoints |
| `INTERNAL_SERVICE_VERSION` | `0.1.0` | Service version |
| `INTERNAL_SERVICE_HOST` | `127.0.0.1` | Bind host for `python -m internal_service` |
| `INTERNAL_SERVICE_PORT` | `4010` | Bind port |
| `INTERNAL_SERVICE_KEY` | empty | Shared secret required by non-health endpoints when set |
| `WORKER_HEARTBEAT_TTL_SECONDS` | `30` | Worker heartbeat TTL before marked stale |
| `COORDINATION_LOCK_TTL_SECONDS` | `60` | Default coordination lock TTL |
| `JOB_DEFAULT_MAX_ATTEMPTS` | `3` | Default max attempts for jobs |
| `JOB_DEFAULT_RETRY_DELAY_SECONDS` | `15` | Default retry delay |
| `JOB_CLAIM_LEASE_SECONDS` | `60` | Default worker claim lease |

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
- `POST /jobs/{job_id}/heartbeat` - extend claim lease `{workerId, leaseSeconds?}`
- `POST /jobs/{job_id}/complete` - complete job `{workerId, result?}`
- `POST /jobs/{job_id}/fail` - fail job `{workerId, error?, retryable?, retryDelaySeconds?}`
- `POST /jobs/{job_id}/cancel` - cancel queued/running job `{reason?}`
- `POST /jobs/{job_id}/retry` - manually requeue failed/dead/cancelled job

See [../../docs/job-processing-contract.md](../../docs/job-processing-contract.md) for schemas and lifecycle.