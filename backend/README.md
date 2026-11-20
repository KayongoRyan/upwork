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

## Environment (`backend/.env`)

| Variable | Default |
|----------|---------|
| `PORT` | `4000` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` |
| `MONGODB_DB` | `vertexa_cpmis` |
| `CORS_ORIGINS` | `http://localhost:3030`, `http://localhost:3000`, … |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | API + Mongo ping |
| POST | `/api/v1/inquiries` | Create inquiry + notifications |
| GET | `/api/v1/inquiries` | List inquiries (`status`, `search`, `limit`) |
| GET | `/api/v1/inquiries/:id` | Get one inquiry |
| PATCH | `/api/v1/inquiries/:id` | Update status/recipient/project and append note |
| GET | `/api/v1/notifications?recipientId=u-pm-2` | PM inbox |
| GET | `/api/v1/notifications?audience=admin` | Admin inbox |
| PATCH | `/api/v1/notifications/:id/read` | Mark read |

### Example

```bash
curl -s -X POST http://localhost:4000/api/v1/inquiries -H "Content-Type: application/json" -d "{\"scope\":\"project-inquiry\",\"service\":\"custom-homes\",\"name\":\"Claudine Uwase\",\"email\":\"c@example.com\",\"phone\":\"0788123456\",\"location\":\"Kigali\",\"message\":\"Project description at least ten chars.\"}"
```

MongoDB must be running locally (or use Atlas in `MONGODB_URI`).

## Frontend

The Vertexa site posts both inquiry forms to its own Next route, `/api/vertexa/inquiries`, which acts as a backend-for-frontend:

1. The route validates the multipart form (same rules as `backend/src/lib/validateInquiry.js`).
2. It forwards JSON to `POST {VERTEXA_API_URL}/api/v1/inquiries` — development defaults to `http://localhost:4000`.
3. `201 { ok: true, inquiry }` becomes a `303` back to the form with `?saved=1`; a `400 { ok: false, error }` becomes `?error=<code>`.
4. This API is the single source of truth: MongoDB holds the inquiry and the administrator/PM notifications. Next does not create a second copy.

If the API is not running in development (`ECONNREFUSED`), the route falls back to the in-memory store so the site keeps working, and logs a warning. Timeouts and 5xx responses are reported to the user as `?error=unavailable` rather than retried, because the API may already have stored the inquiry.

### CPMIS inboxes

The administrator and project-manager portals read the same MongoDB notices through two more Next BFF routes:

- `GET /api/vertexa/notifications` → `GET {VERTEXA_API_URL}/api/v1/notifications?limit=100`. It keeps only notices with `source: "vertexa"`, maps them to CPMIS notification records (`projectId: null`, label “Vertexa site”), and returns `{ items: [] }` when the API is not configured or cannot be reached.
- `PATCH /api/vertexa/notifications` with `{ id, read }` (or `{ all: true }`) → `PATCH {VERTEXA_API_URL}/api/v1/notifications/:id/read`. The bulk form issues one PATCH per unread admin-audience notice because the backend has no bulk endpoint; PM notices stay owned by the manager's inbox.

The root layout passes the first result to `AdminProvider` so notices are present in server-rendered HTML; the provider polls every 10 seconds and merges updates with the demo store. The PM preview (`u-pm-2`) only receives notices whose backend `recipientId` is `u-pm-2`.