# Vertexa CPMIS / Express API

Express is the API authority for CPMIS and the public Vertexa inquiry/notification APIs. Next.js route handlers under `app/api/**` are thin BFF proxies that forward requests to this service.

## Install and run

Dependencies are installed **once at the repo root** (no separate `backend/node_modules`).

```bash
# from repo root (c:\dev\upwork)
npm install
copy .env.example .env   # or configure backend/.env as needed
npm run dev:backend      # tsx watch backend/src/index.js
```

Default API: `http://localhost:4000`

Useful scripts (repo root):

```bash
npm run dev:backend      # watch Express API
npm run test             # Vitest
npm run test:unit
npm run test:integration
npm run backup:mongo
npm run restore:mongo
```

## Environment

Configure via repo-root `.env` and/or `backend/.env`. See [../.env.example](../.env.example) for the full template.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables fail-fast config validation |
| `PORT` | `4000` | HTTP port |
| `HOST` | `0.0.0.0`/platform default | Listen host, if configured |
| `TRUST_PROXY` | `false` | Set when behind a trusted reverse proxy |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | MongoDB connection |
| `MONGODB_DB_ADMIN/PM/SE/QS` | `vertexa_admin/pm/se/qs` | Per-portal CPMIS databases |
| `MONGODB_DB` | `vertexa_cpmis` | Legacy/shared DB for inquiries/notifications |
| `CORS_ORIGINS` | localhost dev origins | Comma-separated; production requires explicit non-localhost origins |
| `VERTEXA_API_KEY` / `API_KEY` | dev default outside prod | Shared admin/BFF key; required in production |
| `VERTEXA_API_URL` / `CPMIS_API_URL` | `http://localhost:4000` in dev | Used by Next.js BFF proxies; required in production |
| `DEMO_PASSWORD_*` | seeded demo passwords | Override in real deployments |
| `AT_USERNAME`, `AT_API_KEY`, `AT_FROM` | sandbox/empty | Africa's Talking SMS for signup OTP |
| `OTP_DEMO_FALLBACK` | `false` | Temporary demo OTP fallback; must be `false` in production |
| `STORAGE_DRIVER` | `local` | Document object storage driver |
| `STORAGE_LOCAL_DIR` | `data/uploads` | Local document storage path |
| `INQUIRY_RATE_LIMIT_WINDOW_MS` | `600000` | Public inquiry rate-limit window |
| `INQUIRY_RATE_LIMIT_MAX` | `20` | Max public inquiry creates per IP/window |
| `INTERNAL_SERVICE_URL` | `http://127.0.0.1:4010` | Internal FastAPI service base URL |
| `INTERNAL_SERVICE_KEY` | dev default outside prod | Shared secret for Express-to-Python internal calls; required in production |
| `INTERNAL_SERVICE_TIMEOUT_MS` | `10000` | Internal service request timeout |

Production config validation fails fast for missing `MONGODB_URI`, missing API key, missing/non-local CORS origins, and `OTP_DEMO_FALLBACK=true`.

## API surface

All API routes are versioned under `/api/v1`. Responses include `X-API-Version: v1`; JSON errors include `apiVersion` and `requestId`.

### Root/discovery

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | public | Service metadata |
| GET | `/api/v1` | public | Resource discovery |
| GET | `/api/v1/health` | public | API + Mongo health |

### Public Vertexa APIs

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/inquiries` | public, rate-limited | Create inquiry + notifications |
| GET/PATCH | `/api/v1/inquiries*` | admin API key | Inquiry inbox/detail/update |
| GET/PATCH | `/api/v1/notifications*` | admin API key | Admin/PM notifications |

### CPMIS APIs

| Area | Base path | Notes |
|---|---|---|
| Auth/session/signup | `/api/v1/cpmis/auth/*` | Sign-in, sign-out, session, OTP signup; per-portal HttpOnly session cookies, CSRF |
| Portal state/actions | `/api/v1/cpmis/portal/:portal/*` | Session-scoped state and portal actions |
| Business JSON APIs | `/api/v1/cpmis/business/*` | Users, employees, projects/assignments, tasks, site reports, BOQ, cost reports, progress/report workflows |
| Legacy/compat routes | `/api/v1/cpmis/*` | Remaining form/redirect/file handlers used by BFF proxies; see `docs/api-contract-map.md` |

Business mutating endpoints require a valid portal session and CSRF token (`x-csrf-token` header or body `csrfToken`). Idempotency-Key is supported on selected business create POSTs.

## Security and behavior

- **Auth**: email+password credentials in `vertexa_admin.credentials`; per-portal opaque session tokens hashed in MongoDB; 12h TTL; invalidation on sign-out/password/credential changes/deactivation.
- **CSRF**: timing-safe token validation and same-origin checks for mutating session-authenticated requests.
- **RBAC/project access**: portal role allowlists, project ownership/assignment checks, scoped state responses.
- **Persistence**: MongoDB-backed portal stores; production fails closed on unavailable DB reads/writes. Multi-document portal writes use queue + session transaction with standalone fallback.
- **Validation**: request validation returns 4xx JSON envelopes; DB duplicate-key errors map to 409 conflicts where applicable.
- **Logging**: structured JSON logs with request IDs; global error handler sanitizes 5xx responses.

## Internal Python service

The FastAPI internal service in `backend/internal_service` provides health/readiness and worker coordination/job processing primitives. Express-to-Python calls use `backend/src/lib/internalServiceClient.js` and send `X-Internal-Service-Key`.

- Service docs: [internal_service/README.md](internal_service/README.md)
- Job schemas/lifecycle contract: [../docs/job-processing-contract.md](../docs/job-processing-contract.md)

## BFF and contracts

Next.js BFF routes forward cookies, CSRF, content type, origin, forwarded IP/host/proto, and Set-Cookie to Express. Browser/BFF/Express mappings are documented in [../docs/api-contract-map.md](../docs/api-contract-map.md).

## Backups and recovery

MongoDB backup/restore scripts and object-storage backup guidance are in [../docs/backup-recovery.md](../docs/backup-recovery.md).

```bash
npm run backup:mongo
npm run restore:mongo -- --confirm RESTORE --drop
```

Destructive restore requires explicit confirmation.

## Troubleshooting

- **Disk full / `ENOSPC` during install**: remove broken `backend/node_modules` if present, free disk space, optionally `npm cache clean --force`, then rerun `npm install` from repo root.
- **Mongo unavailable**: verify `MONGODB_URI` and that MongoDB is running/reachable. Development may use limited in-memory fallbacks for some flows; production should fail closed.
- **BFF 503/upstream unavailable**: ensure Express is running and `VERTEXA_API_URL`/`CPMIS_API_URL` points to it.
- **CORS/CSRF failures**: confirm `CORS_ORIGINS`, request Origin, portal session cookie, and `x-csrf-token`/`csrfToken`.
