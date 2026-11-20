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
| GET | `/api/v1/inquiries` | List inquiries |
| GET | `/api/v1/notifications?recipientId=u-pm-2` | PM inbox |
| GET | `/api/v1/notifications?audience=admin` | Admin inbox |
| PATCH | `/api/v1/notifications/:id/read` | Mark read |

### Example

```bash
curl -s -X POST http://localhost:4000/api/v1/inquiries -H "Content-Type: application/json" -d "{\"scope\":\"project-inquiry\",\"service\":\"custom-homes\",\"name\":\"Claudine Uwase\",\"email\":\"c@example.com\",\"phone\":\"0788123456\",\"location\":\"Kigali\",\"message\":\"Project description at least ten chars.\"}"
```

MongoDB must be running locally (or use Atlas in `MONGODB_URI`).

## Frontend

Next.js still uses in-memory `/api/vertexa/inquiries` until you proxy to this service (`VERTEXA_API_URL`).