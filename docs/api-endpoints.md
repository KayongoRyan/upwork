# API Endpoints

This document lists the HTTP endpoints exposed by the Express API (canonical authority) and the Next.js BFF proxies. For frontend caller mappings and migration status, see [api-contract-map.md](./api-contract-map.md).

## Conventions

- **Base URL (Express)**: `http://localhost:4000` in development (`VERTEXA_API_URL` / `CPMIS_API_URL`).
- **Versioning**: Express APIs are versioned under `/api/v1`. Responses include `X-API-Version: v1`. JSON errors include `apiVersion: "v1"`.
- **Request ID**: responses include `X-Request-Id`; JSON errors include `requestId`.
- **JSON error envelope**: `{ ok: false, error: string, message?: string, details?: unknown, requestId?: string, apiVersion: "v1" }`.
- **Auth**:
  - **Public**: no session/API key required (some endpoints are rate-limited).
  - **Admin API key**: `X-API-Key: <VERTEXA_API_KEY>` or `Authorization: Bearer <VERTEXA_API_KEY>`.
  - **Portal session**: per-portal HttpOnly cookie (`cpmis_session_admin|pm|se|qs`), validated server-side.
- **CSRF**: mutating session-authenticated requests require CSRF token via `x-csrf-token` header or body field `csrfToken`. Native form posts use hidden `csrfToken`.
- **BFF**: Next.js `app/api/**/route.ts` handlers proxy to Express, forwarding cookies, CSRF, content type, origin, forwarded IP/host/proto, and Set-Cookie. They are not a separate authority.

## Express Endpoints

### Service / Discovery

| Method | Path | Auth | CSRF | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/` | Public | No | - | JSON `{ ok, name, version, apiVersion, apiBasePath, docs }` | Service metadata. |
| GET | `/api/v1` | Public | No | - | JSON `{ ok, version, resources[] }` | Resource discovery. |
| GET | `/api/v1/health` | Public | No | - | JSON health payload; 503 on DB unavailable | Pings API/Mongo. |

### Vertexa Inquiries

| Method | Path | Auth | CSRF | Request | Response | Notes |
|---|---|---|---|---|---|---|
| POST | `/api/v1/inquiries` | Public (rate-limited) | No | JSON inquiry payload | JSON `{ ok, inquiry }` or error | Creates inquiry + notifications. Rate limit: `429 rate_limited` with `Retry-After`/`RateLimit-*`. |
| GET | `/api/v1/inquiries` | Admin API key | No | Query: `status`, `search`, `limit` | JSON `{ ok, items }` | List inquiries. |
| GET | `/api/v1/inquiries/:id` | Admin API key | No | - | JSON `{ ok, inquiry }` | Get inquiry. |
| PATCH | `/api/v1/inquiries/:id` | Admin API key | No | JSON status/recipient/project/note fields | JSON `{ ok, inquiry }` | Update inquiry and append note. |

### Vertexa / Admin Notifications

| Method | Path | Auth | CSRF | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/api/v1/notifications` | Admin API key | No | Query: `recipientId=<user-id>` or `audience=admin` | JSON `{ ok, items }` | PM/admin inbox. |
| PATCH | `/api/v1/notifications/read-all` | Admin API key | No | Query/body as required by handler | JSON success/error | Mark all read for recipient/audience. |
| PATCH | `/api/v1/notifications/:id/read` | Admin API key | No | - | JSON success/error | Mark one notification read. |

### CPMIS Auth / Session

| Method | Path | Auth | CSRF | Request | Response | Notes |
|---|---|---|---|---|---|---|
| POST | `/api/v1/cpmis/auth/sign-in` | Public pre-auth (same-origin) | No | JSON `{ portal, email, password }` | JSON `{ ok, redirectTo }` + Set-Cookie session | Per-portal session cookie; login rate-limited. |
| POST | `/api/v1/cpmis/auth/sign-out` | Portal session (if present) | Yes when session present | JSON/form `{ portal, csrfToken? }` | JSON `{ ok: true }` | Invalidates session. |
| GET | `/api/v1/cpmis/auth/session/:portal` | Portal session | No | Path `portal` | JSON `{ ok, user }` | Returns current session user; 401/403 when missing/invalid. |
| POST | `/api/v1/cpmis/auth/signup/request-otp` | Public (same-origin/rate-limited) | No | JSON signup payload incl. portal/name/phone/email/password | JSON challenge response | Sends/creates OTP challenge. Temporary demo fallback controlled by env. |
| POST | `/api/v1/cpmis/auth/signup/verify-otp` | Public (same-origin) | No | JSON `{ challengeId, otp, ... }` | JSON success + session/redirect as implemented | Verifies OTP, creates active account, signs in. |

### CPMIS Portal State / Actions

| Method | Path | Auth | CSRF | Request | Response | Notes |
|---|---|---|---|---|---|---|
| GET | `/api/v1/cpmis/portal/:portal/state` | Portal session | No | Path `portal` | Scoped portal state JSON | Session-derived; no client actor identity. |
| POST | `/api/v1/cpmis/portal/:portal/actions` | Portal session | Yes | JSON `{ action, csrfToken? }` | Scoped state/action result JSON | Action allowlist + RBAC/project checks; 503 on persistence failure. |

### CPMIS Documents

| Method | Path | Auth | CSRF | Request | Response | Notes |
|---|---|---|---|---|---|---|
| POST | `/api/v1/cpmis/documents` | Admin session | Yes | `multipart/form-data`: `file`, metadata fields, `csrfToken` | JSON/redirect per caller | Uploads to object storage; metadata in MongoDB; file validation enforced. |
| POST | `/api/v1/cpmis/documents/revise` | Admin session | Yes | `multipart/form-data`: `file`, `fileId`, metadata, `csrfToken` | JSON/redirect per caller | Appends revision; preserves history. |
| POST | `/api/v1/cpmis/documents/extract-invoice` | Admin session | Yes | `multipart/form-data`: `file`, `csrfToken` | JSON `{ ok, extraction }` | Best-effort invoice metadata extraction (no DB write). Returns confidence, warnings, editable fields, raw text preview; scanned/image OCR not available. |
| GET | `/api/v1/cpmis/documents/file` | Authorized session | No | Query identifying file/version | Binary stream with content headers | Authenticated/authorized download; supports legacy dataUrl fallback. |

### CPMIS Business APIs (JSON)

All endpoints below require a valid portal session. Mutating endpoints require CSRF. Project-scoped endpoints enforce RBAC/project access. Selected create POSTs support `Idempotency-Key` / `X-Idempotency-Key`.

#### Users (Admin)

| Method | Path | CSRF | Idempotency | Notes |
|---|---|---:|---:|---|
| GET | `/api/v1/cpmis/business/users` | No | No | List users. |
| POST | `/api/v1/cpmis/business/users` | Yes | Yes | Create user + credential; rollback/cleanup on credential persistence failure. |
| PATCH | `/api/v1/cpmis/business/users/:id` | Yes | No | Update user; duplicate email pre-check/E11000 -> 409. |
| PATCH | `/api/v1/cpmis/business/users/:id/status` | Yes | No | Activate/deactivate; deactivation invalidates sessions. |
| DELETE | `/api/v1/cpmis/business/users/:id` | Yes | No | Delete user; credential/session cleanup as implemented. |

#### Employees (Admin)

| Method | Path | CSRF | Idempotency | Notes |
|---|---|---:|---:|---|
| GET | `/api/v1/cpmis/business/employees` | No | No | List employees. |
| POST | `/api/v1/cpmis/business/employees` | Yes | Yes | Create employee; duplicate code/email handled. |
| PATCH | `/api/v1/cpmis/business/employees/:id` | Yes | No | Update employee; duplicate email/code pre-check/E11000 -> 409. |
| DELETE | `/api/v1/cpmis/business/employees/:id` | Yes | No | Delete employee. |

#### Projects / Assignments

| Method | Path | CSRF | Idempotency | Notes |
|---|---|---:|---:|---|
| GET | `/api/v1/cpmis/business/projects` | No | No | List projects scoped to session. |
| POST | `/api/v1/cpmis/business/projects` | Yes | Yes | Create project. |
| PATCH | `/api/v1/cpmis/business/projects/:id` | Yes | No | Update project. |
| DELETE | `/api/v1/cpmis/business/projects/:id` | Yes | No | Delete project. |
| PATCH | `/api/v1/cpmis/business/projects/:id/assignment` | Yes | No | Update project assignment. |

#### Tasks / Schedules

| Method | Path | CSRF | Idempotency | Notes |
|---|---|---:|---:|---|
| GET | `/api/v1/cpmis/business/tasks` | No | No | List tasks; project/session scoped. |
| POST | `/api/v1/cpmis/business/tasks` | Yes | Yes | Create task. |
| POST | `/api/v1/cpmis/business/tasks/:id/status` | Yes | No | Update task status. |
| POST | `/api/v1/cpmis/business/tasks/:id/assign` | Yes | No | Assign task. |
| POST | `/api/v1/cpmis/business/tasks/:id/schedule` | Yes | No | Schedule task; PM ownership enforced. |
| POST | `/api/v1/cpmis/business/tasks/:id/progress` | Yes | No | Update task progress. |
| DELETE | `/api/v1/cpmis/business/tasks/:id` | Yes | No | Delete task. |

#### Site Reports / Approvals

| Method | Path | CSRF | Idempotency | Notes |
|---|---|---:|---:|---|
| GET | `/api/v1/cpmis/business/site-reports` | No | No | List site reports; scoped. |
| POST | `/api/v1/cpmis/business/site-reports` | Yes | Yes | Create site report. |
| PATCH | `/api/v1/cpmis/business/site-reports/:id/resubmit` | Yes | No | SE resubmits own project report. |
| DELETE | `/api/v1/cpmis/business/site-reports/:id` | Yes | No | Delete site report. |
| POST | `/api/v1/cpmis/business/site-reports/:id/open` | Yes | No | PM opens report for review. |
| POST | `/api/v1/cpmis/business/site-reports/:id/decide` | Yes | No | PM approves/rejects report. |

#### BOQ / Expenses

| Method | Path | CSRF | Idempotency | Notes |
|---|---|---:|---:|---|
| GET | `/api/v1/cpmis/business/boq` | No | No | List BOQ items. |
| GET | `/api/v1/cpmis/business/boq/export` | No | No | XLSX attachment (`boq-summary-*.xlsx`); query `projectId?`; Summary and BOQ Lines sheets; scoped to authorized projects. |
| POST | `/api/v1/cpmis/business/boq/import/preview` | Yes | No | Multipart `file`, `projectId`, `csrfToken`; QS session. Parses .xlsx/.csv/.pdf/.txt, extracts BOQ tables, returns validated preview rows (no DB writes). PDF/TXT extraction is best-effort. |
| POST | `/api/v1/cpmis/business/boq/import/accept` | Yes | Yes | JSON `{ projectId, rows[] }`; QS session. Server revalidates selected rows and creates BOQ lines via batch action. |
| POST | `/api/v1/cpmis/business/boq` | Yes | Yes | Create BOQ item; QS/assignment checks. |
| PATCH | `/api/v1/cpmis/business/boq/:id` | Yes | No | Update BOQ item. |
| DELETE | `/api/v1/cpmis/business/boq/:id` | Yes | No | Delete BOQ item. |
| GET | `/api/v1/cpmis/business/projects/:id/expenses` | No | No | List project expenses. |

#### Cost Reports

| Method | Path | CSRF | Idempotency | Notes |
|---|---|---:|---:|---|
| GET | `/api/v1/cpmis/business/cost-reports` | No | No | List cost reports. |
| POST | `/api/v1/cpmis/business/cost-reports/send` | Yes | Yes | QS sends cost report. |
| POST | `/api/v1/cpmis/business/cost-reports/submit` | Yes | Yes | PM submits cost report. |
| PATCH | `/api/v1/cpmis/business/cost-reports/revise-bill` | Yes | No | Revise bill; project ownership enforced. |
| DELETE | `/api/v1/cpmis/business/cost-reports/:id` | Yes | No | Delete cost report. |

### CPMIS Legacy / Compatibility Routes

These routes remain for compatibility, form workflows, file downloads, or legacy callers. Many browser CRUD flows have migrated to `/api/v1/cpmis/business/*`.

| Method | Path | Auth | CSRF | Request | Response | Status/Notes |
|---|---|---|---|---|---|---|
| GET | `/api/v1/cpmis/state` | Admin session | No | - | Scoped state JSON | Reserved/unused by browser. |
| POST | `/api/v1/cpmis/users` | Admin session | Yes | Form/urlencoded + `csrfToken` | 303 redirect | Legacy; browser user management migrated to business API. |
| POST | `/api/v1/cpmis/projects` | Admin session | Yes | Form/urlencoded + `csrfToken` | 303 redirect | Legacy; browser project creation migrated to business API. |
| POST | `/api/v1/cpmis/employees` | Admin session | Yes | Form/urlencoded + `csrfToken` | 303 redirect | Legacy; browser employee registration migrated to business API. |
| POST | `/api/v1/cpmis/help` | Admin session | Yes | Form/urlencoded + `csrfToken` | 303 redirect | Active form workflow. |
| POST | `/api/v1/cpmis/admin/comments` | Admin session | Yes | Form/urlencoded + `csrfToken` | 303 redirect | Active admin comment workflow. |
| POST | `/api/v1/cpmis/notifications` | Admin session | Yes | Form/urlencoded + `csrfToken` | 303 redirect | Legacy/admin-only; QS mark-read uses portal action. |
| GET | `/api/v1/cpmis/reports` | Admin session | No | Query params as needed | CSV/file response | Admin report export. |
| GET | `/api/v1/cpmis/reports/workbook` | Admin session | No | Query `from,to,project` | XLSX workbook attachment | Project financial workbook export. |
| GET | `/api/v1/cpmis/reports/monthly-progress` | Admin session | No | Query `month=YYYY-MM,project` | XLSX workbook attachment | Monthly progress report export. |
| POST | `/api/v1/cpmis/pm/reports` | PM session | Yes | Form + `csrfToken` | 303 redirect | Active form workflow. |
| POST | `/api/v1/cpmis/pm/reports/open` | PM session | Yes | Form + `csrfToken` | 303 redirect | Active form workflow. |
| POST | `/api/v1/cpmis/pm/reports/decide` | PM session | Yes | Form + `csrfToken` | 303 redirect | Active form workflow. |
| POST | `/api/v1/cpmis/pm/progress` | PM session | Yes | Form + `csrfToken` | 303 redirect | Active form workflow. |
| POST | `/api/v1/cpmis/pm/events` | PM session | Yes | Form + `csrfToken` | 303 redirect | Active form workflow. |
| POST | `/api/v1/cpmis/pm/costs` | PM session | Yes | Form + `csrfToken` | 303 redirect | Active form workflow. |
| POST | `/api/v1/cpmis/pm/costs/edit` | PM session | Yes | Form + `csrfToken` | 303 redirect | Active form workflow. |
| POST | `/api/v1/cpmis/pm/costs/pdf` | PM session | Yes | Form + `csrfToken` | `application/pdf` attachment | Active form/download workflow. |
| POST | `/api/v1/cpmis/qs/reports` | QS session | Yes | Form + `csrfToken` | 303 redirect | Active form workflow. |
| POST | `/api/v1/cpmis/se/reports` | SE session | Yes | `multipart/form-data` with photos + `csrfToken` | 303 redirect | Active multipart form workflow. |

## Next.js BFF Proxy Endpoints

These routes live under `app/api/**/route.ts`. They forward to Express and should be treated as BFF/proxy layer, not business-authority endpoints.

| BFF Path | Methods | Proxies to Express | Auth/CSRF notes |
|---|---|---|---|
| `/api/auth/sign-in` | POST | `/api/v1/cpmis/auth/sign-in` | Public pre-auth; forwards JSON. |
| `/api/auth/sign-out` | POST | `/api/v1/cpmis/auth/sign-out` | Session cookie; CSRF when session present. |
| `/api/auth/session` | GET | `/api/v1/cpmis/auth/session/:portal` (via query `portal`) | Session cookie. |
| `/api/auth/signup/request-otp` | POST | `/api/v1/cpmis/auth/signup/request-otp` | Public. |
| `/api/auth/signup/verify-otp` | POST | `/api/v1/cpmis/auth/signup/verify-otp` | Public. |
| `/api/portal/[portal]/state` | GET | `/api/v1/cpmis/portal/:portal/state` | Session cookie. |
| `/api/portal/[portal]/actions` | POST | `/api/v1/cpmis/portal/:portal/actions` | Session cookie + CSRF. |
| `/api/cpmis/business/[...path]` | GET,POST,PATCH,PUT,DELETE | `/api/v1/cpmis/business/:path` | Session cookie + CSRF for mutating requests. |
| `/api/documents` | POST | `/api/v1/cpmis/documents` | Admin session + CSRF; multipart. |
| `/api/documents/revise` | POST | `/api/v1/cpmis/documents/revise` | Admin session + CSRF; multipart. |
| `/api/documents/extract-invoice` | POST | `/api/v1/cpmis/documents/extract-invoice` | Admin session + CSRF; multipart; no DB write. |
| `/api/documents/file` | GET | `/api/v1/cpmis/documents/file` | Authorized session. |
| `/api/state` | GET | `/api/v1/cpmis/state` | Admin session; reserved/unused. |
| `/api/users` | POST | `/api/v1/cpmis/users` | Admin session + CSRF; legacy form. |
| `/api/projects` | POST | `/api/v1/cpmis/projects` | Admin session + CSRF; legacy form. |
| `/api/employees` | POST | `/api/v1/cpmis/employees` | Admin session + CSRF; legacy form. |
| `/api/help` | POST | `/api/v1/cpmis/help` | Admin session + CSRF. |
| `/api/admin/comments` | POST | `/api/v1/cpmis/admin/comments` | Admin session + CSRF. |
| `/api/notifications` | POST | `/api/v1/cpmis/notifications` | Admin session + CSRF; legacy/admin-only. |
| `/api/reports` | GET | `/api/v1/cpmis/reports` | Admin session. |
| `/api/reports/workbook` | GET | `/api/v1/cpmis/reports/workbook` | Admin session; XLSX workbook. |
| `/api/reports/monthly-progress` | GET | `/api/v1/cpmis/reports/monthly-progress` | Admin session; XLSX monthly progress report. |
| `/api/pm/reports` | POST | `/api/v1/cpmis/pm/reports` | PM session + CSRF. |
| `/api/pm/reports/open` | POST | `/api/v1/cpmis/pm/reports/open` | PM session + CSRF. |
| `/api/pm/reports/decide` | POST | `/api/v1/cpmis/pm/reports/decide` | PM session + CSRF. |
| `/api/pm/progress` | POST | `/api/v1/cpmis/pm/progress` | PM session + CSRF. |
| `/api/pm/events` | POST | `/api/v1/cpmis/pm/events` | PM session + CSRF. |
| `/api/pm/costs` | POST | `/api/v1/cpmis/pm/costs` | PM session + CSRF. |
| `/api/pm/costs/edit` | POST | `/api/v1/cpmis/pm/costs/edit` | PM session + CSRF. |
| `/api/pm/costs/pdf` | POST | `/api/v1/cpmis/pm/costs/pdf` | PM session + CSRF; PDF response. |
| `/api/qs/reports` | POST | `/api/v1/cpmis/qs/reports` | QS session + CSRF. |
| `/api/se/reports` | POST | `/api/v1/cpmis/se/reports` | SE session + CSRF; multipart. |
| `/api/vertexa/inquiries` | GET,POST | `/api/v1/inquiries` | GET admin key; POST public with BFF validation/rate-limit handling. |
| `/api/vertexa/inquiries/[id]` | GET,PATCH | `/api/v1/inquiries/:id` | Admin key. |
| `/api/vertexa/notifications` | GET,PATCH | `/api/v1/notifications*` | Admin key; PATCH supports read/read-all proxy behavior. |

## Notes

- **Legacy vs business APIs**: browser CRUD for users/projects/employees has migrated to `/api/cpmis/business/*`. Legacy `/api/users`, `/api/projects`, `/api/employees` BFF+Express handlers remain for compatibility but have no discovered browser callers.
- **Idempotency**: business create POSTs accept optional `Idempotency-Key`/`X-Idempotency-Key`; same key with different body returns 409.
- **Persistence failures**: production should fail closed; persistence-unavailable conditions return `503` with `error: "persistence-failed"` where applicable.
- **Detailed contract mapping**: see [api-contract-map.md](./api-contract-map.md) for frontend caller status and payload/redirect details.