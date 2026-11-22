# Vertexa backend (Express + MongoDB)

HTTP API separated from the Next.js frontend. Dependencies are installed **once at the repo root** (no separate `backend/node_modules`) to save disk space.

## Disk full / failed `backend/npm install`

If you saw `ENOSPC: no space left on device`:

1. Delete the broken partial install: `Remove-Item -Recurse -Force backend\node_modules` (if it exists).
2. Free space on `C:` — e.g. empty Recycle Bin, remove unused large files, delete `\.next` if you can rebuild (`Remove-Item -Recurse -Force .next`).
3. Optional: `npm cache clean --force` (from repo root).
4. From **repo root**: `npm install` (installs frontend + backend packages together).

## Setup

```bash
# from c:\dev\upwork
npm install
copy backend\env.example backend\.env
npm run dev:backend
```

Default API: **http://localhost:4000**

The Express service owns the public site's inquiries and notifications in
`MONGODB_DB` (default `vertexa_cpmis`). The CPMIS portals keep their workspace in
separate databases (`vertexa_admin`, `vertexa_pm`, `vertexa_se`, `vertexa_qs`), which
the Next.js app manages directly — see the root [`README.md`](../README.md#per-portal-databases).

## Environment (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | MongoDB connection string |
| `MONGODB_DB` | `vertexa_cpmis` | Database name |
| `CORS_ORIGINS` | `http://localhost:3030`, `http://localhost:3000`, … | Allowed browser origins |
| `VERTEXA_API_KEY` | `dev-vertexa-api-key` (non-production) | Shared secret for admin routes; **required in production** |
| `INQUIRY_RATE_LIMIT_WINDOW_MS` | `600000` | Rate-limit window for public inquiry creation |
| `INQUIRY_RATE_LIMIT_MAX` | `20` | Max public inquiry creates per IP per window |

## Security and observability

- **Request ID**: every request gets an `X-Request-Id` response header (echoes `X-Request-Id` when provided) and an access log line `[requestId] METHOD path status durationMs`. JSON error responses include `requestId`.
- **Admin auth**: `GET /api/v1/inquiries`, `GET /api/v1/inquiries/:id`, `PATCH /api/v1/inquiries/:id`, and all `/api/v1/notifications*` routes require `X-API-Key: <VERTEXA_API_KEY>` or `Authorization: Bearer <VERTEXA_API_KEY>`. Missing/invalid key → `401 { ok:false, error:"unauthorized" }`. Unconfigured key → `503 { ok:false, error:"admin_auth_not_configured" }`.
- **Public create**: `POST /api/v1/inquiries` remains accessible without admin auth but is rate-limited per client IP. Limit exceeded → `429 { ok:false, error:"rate_limited", retryAfter }` with `Retry-After`/`RateLimit-*` headers.
- **Error shape**: JSON errors are consistent: `{ ok:false, error:"<code>", requestId, ... }`. Structured validation/workflow codes are preserved (`invalid-*`, `invalid-transition`, `not_found`, etc.). DB outages return `503 { ok:false, error:"mongodb_unavailable", ... }`.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/health` | public | API + Mongo ping |
| POST | `/api/v1/inquiries` | public (rate-limited) | Create inquiry + notifications |
| GET | `/api/v1/inquiries` | admin key | List inquiries (`status`, `search`, `limit`) |
| GET | `/api/v1/inquiries/:id` | admin key | Get one inquiry |
| PATCH | `/api/v1/inquiries/:id` | admin key | Update status/recipient/project and append note |
| GET | `/api/v1/notifications?recipientId=<user-id>` | admin key | PM inbox |
| GET | `/api/v1/notifications?audience=admin` | admin key | Admin inbox |
| PATCH | `/api/v1/notifications/:id/read` | admin key | Mark read |

Successful inquiry/notification responses include `ok: true` with `items` or `inquiry`/record payloads.

### Examples

```bash
# Public inquiry create (no admin key)
curl -i -s -X POST http://localhost:4000/api/v1/inquiries \
  -H "Content-Type: application/json" \
  -d "{\"scope\":\"project-inquiry\",\"service\":\"custom-homes\",\"name\":\"Claudine Uwase\",\"email\":\"c@example.com\",\"phone\":\"0788123456\",\"location\":\"Kigali\",\"message\":\"Project description at least ten chars.\"}"

# Admin list (requires key)
curl -i -s http://localhost:4000/api/v1/inquiries \
  -H "X-API-Key: dev-vertexa-api-key"
```

MongoDB must be running locally (or use Atlas in `MONGODB_URI`).

## Frontend BFF

The Next.js app talks to this API server-side and forwards the admin key from `VERTEXA_API_KEY` (development defaults to `dev-vertexa-api-key` when unset; must match the backend).

- **Public inquiry create**: `/api/vertexa/inquiries` validates browser form submissions, forwards JSON to `POST {VERTEXA_API_URL}/api/v1/inquiries`, and redirects with `?saved=1` or `?error=<code>` (`rate_limited`, `unavailable`, structured `invalid-*`, etc.). When called with a JSON request/accept, it returns JSON `{ ok, error|inquiry }` with the same structured codes.
- **Admin inquiry ops**: `GET/PATCH /api/vertexa/inquiries` and `GET/PATCH /api/vertexa/inquiries/:id` proxy the authenticated admin inquiry routes.
- **Notifications**: `GET/PATCH /api/vertexa/notifications` proxies the authenticated notification routes (read-through + mark-read/mark-all for admin-audience notices). The root layout seeds initial notices server-side and the provider polls every 10 seconds; the demo workspace still renders if the API is unavailable.

Development defaults `VERTEXA_API_URL` to `http://localhost:4000`. If the API is not running in development (`ECONNREFUSED`), public inquiry create falls back to the in-memory store so the site keeps working, and logs a warning. Timeouts/5xx are reported as `unavailable` rather than retried, because the API may already have stored the inquiry. The BFF resolves an active project manager from the live CPMIS roster and sends that account id as `recipientId`; when the roster has no active project manager only the administrator notice is created and the lead stays unassigned for triage.