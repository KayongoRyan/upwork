# CPMIS API Contract Map

Maps browser/frontend requests and server-side Next.js callers to BFF routes and Express endpoints. Express is the CPMIS API authority; Next.js `app/api/**/route.ts` handlers are thin BFF proxies unless noted.

## Legend

- **Status**: `aligned` = contract matches and is authorized; `mismatch` = caller/contract/auth issue; `unused` = no discovered frontend caller; `server-only` = called from Next server code, not browser.
- **Auth**: portal session cookie, admin API key, or public. CSRF applies to mutating session-authenticated requests.
- **CSRF**: `x-csrf-token` header and/or body `csrfToken` accepted by Express `verifyCsrfToken`; native HTML forms must send hidden `csrfToken`.

## Browser / Frontend Calls

| Frontend caller | BFF route | Express endpoint | Method | Payload / content type | Auth / CSRF | Response / redirect | Status |
|---|---|---|---|---|---|---|---|
| `components/auth/login-form.tsx` fetch | `/api/auth/sign-in` | `/api/v1/cpmis/auth/sign-in` | POST | JSON `{portal,email,password}` | Public pre-auth; same-origin check; no CSRF token | JSON `{ok,redirectTo}` or error | aligned |
| `components/auth/signup-form.tsx` fetch | `/api/auth/signup/request-otp` | `/api/v1/cpmis/auth/signup/request-otp` | POST | JSON signup payload | Public pre-auth; origin check; rate-limited | JSON `{ok,challengeId,expiresAt,demoOtp?}` | aligned |
| `components/auth/signup-form.tsx` fetch | `/api/auth/signup/verify-otp` | `/api/v1/cpmis/auth/signup/verify-otp` | POST | JSON `{portal,challengeId,otp}` | Public pre-auth; origin check; rate-limited | JSON `{ok,redirectTo}` + session cookie | aligned |
| `components/layout/header.tsx` form | `/api/auth/sign-out` | `/api/v1/cpmis/auth/sign-out` | POST | form/urlencoded or JSON `{portal,csrfToken}` | Portal session cookie; CSRF required when session present | JSON `{ok:true}`; BFF redirects browser to portal login on non-JSON accept | aligned |
| `lib/data/admin-store.tsx` fetch | `/api/portal/:portal/state` | `/api/v1/cpmis/portal/:portal/state` | GET | none | Portal session cookie | JSON scoped state, `cache-control: no-store` | aligned |
| `lib/data/admin-store.tsx` dispatch | `/api/portal/:portal/actions` | `/api/v1/cpmis/portal/:portal/actions` | POST | JSON AdminAction body | Portal session cookie + `x-csrf-token` header | JSON scoped state; 403 action-not-allowed; 503 persistence-failed | aligned |
| `components/users/users-view.tsx` user list | `/api/cpmis/business/users` | `/api/v1/cpmis/business/users` | GET | none | Administrator session | JSON `{ ok: true, items }` | aligned |
| `components/users/users-view.tsx` create user | `/api/cpmis/business/users` | `/api/v1/cpmis/business/users` | POST | JSON `{...userSchema,password}` + `x-csrf-token` | Administrator session + CSRF | JSON `201 { ok: true, id }` (or error envelope) | aligned |
| `components/users/users-view.tsx` update user | `/api/cpmis/business/users/:id` | `/api/v1/cpmis/business/users/:id` | PATCH | JSON partial/full user fields + `x-csrf-token` | Administrator session + CSRF | JSON `{ ok: true, state }` (or error envelope) | aligned |
| `components/users/users-view.tsx` set user status | `/api/cpmis/business/users/:id/status` | `/api/v1/cpmis/business/users/:id/status` | PATCH | JSON `{ status }` + `x-csrf-token` | Administrator session + CSRF | JSON `{ ok: true, state }` (or error envelope) | aligned |
| `components/users/users-view.tsx` delete user | `/api/cpmis/business/users/:id` | `/api/v1/cpmis/business/users/:id` | DELETE | `x-csrf-token` header | Administrator session + CSRF | JSON `{ ok: true }` (or error envelope) | aligned |
| `components/projects/projects-view.tsx` project list | `/api/cpmis/business/projects` | `/api/v1/cpmis/business/projects` | GET | none | Any authenticated session; scoped by role/project access | JSON `{ ok: true, items }` | aligned |
| `components/projects/projects-view.tsx` create project | `/api/cpmis/business/projects` | `/api/v1/cpmis/business/projects` | POST | JSON `{...projectSchema}` + `x-csrf-token` header | Administrator session + CSRF | JSON `201 { ok: true, state }` (or error envelope) | aligned |
| `components/projects/projects-view.tsx` update project | `/api/cpmis/business/projects/:id` | `/api/v1/cpmis/business/projects/:id` | PATCH | JSON partial/full project fields + `x-csrf-token` | Administrator session + CSRF | JSON `{ ok: true, state }` (or error envelope) | aligned |
| `components/projects/projects-view.tsx` delete project | `/api/cpmis/business/projects/:id` | `/api/v1/cpmis/business/projects/:id` | DELETE | `x-csrf-token` header | Administrator session + CSRF | JSON `{ ok: true }` (or error envelope) | aligned |
| `components/employees/employees-view.tsx` employee list | `/api/cpmis/business/employees` | `/api/v1/cpmis/business/employees` | GET | none | Administrator session | JSON `{ ok: true, items }` | aligned |
| `components/employees/employees-view.tsx` register employee | `/api/cpmis/business/employees` | `/api/v1/cpmis/business/employees` | POST | JSON `{...employeeSchema}` + `x-csrf-token` | Administrator session + CSRF | JSON `201 { ok: true, state }` (or error envelope) | aligned |
| `components/employees/employees-view.tsx` update/assign employee | `/api/cpmis/business/employees/:id` | `/api/v1/cpmis/business/employees/:id` | PATCH | JSON partial employee fields + `x-csrf-token` | Administrator session + CSRF | JSON `{ ok: true, state }` (or error envelope) | aligned |
| `components/employees/employees-view.tsx` delete employee | `/api/cpmis/business/employees/:id` | `/api/v1/cpmis/business/employees/:id` | DELETE | `x-csrf-token` header | Administrator session + CSRF | JSON `{ ok: true }` (or error envelope) | aligned |
| `components/help/help-view.tsx` form | `/api/help` | `/api/v1/cpmis/help` | POST | urlencoded form + `csrfToken` | Administrator session + CSRF | 303 redirect with saved/error | aligned |
| `components/notifications/portal-work.tsx` admin comment form | `/api/admin/comments` | `/api/v1/cpmis/admin/comments` | POST | urlencoded form + `csrfToken` | Administrator session + CSRF | 303 redirect to `/admin/notifications` with filters/hash | aligned |
| `components/pm/reports-view.tsx` create report form | `/api/pm/reports` | `/api/v1/cpmis/pm/reports` | POST | urlencoded form + `csrfToken` | Project manager session + CSRF + project ownership | 303 redirect to `/pm/reports` | aligned |
| `components/pm/reports-view.tsx` open review form | `/api/pm/reports/open` | `/api/v1/cpmis/pm/reports/open` | POST | urlencoded form + `csrfToken` | Project manager session + CSRF + ownership | 303 redirect | aligned |
| `components/pm/reports-view.tsx` decide report form | `/api/pm/reports/decide` | `/api/v1/cpmis/pm/reports/decide` | POST | urlencoded form + `csrfToken` | Project manager session + CSRF + ownership | 303 redirect | aligned |
| `components/pm/progress-view.tsx` form | `/api/pm/progress` | `/api/v1/cpmis/pm/progress` | POST | urlencoded form + `csrfToken` | Project manager session + CSRF + ownership | 303 redirect | aligned |
| `components/pm/dashboard-view.tsx` event form | `/api/pm/events` | `/api/v1/cpmis/pm/events` | POST | urlencoded form + `csrfToken` | Project manager session + CSRF | 303 redirect to `/pm#calendar` | aligned |
| `components/pm/costs-view.tsx` submit form action | `/api/pm/costs` | `/api/v1/cpmis/pm/costs` | POST | urlencoded form fields from bill form + `csrfToken` | Project manager session + CSRF + ownership | 303 redirect | aligned |
| `components/pm/costs-view.tsx` edit form action | `/api/pm/costs/edit` | `/api/v1/cpmis/pm/costs/edit` | POST | urlencoded form + `csrfToken` | Project manager session + CSRF + ownership | 303 redirect | aligned |
| `components/pm/costs-view.tsx` PDF form action | `/api/pm/costs/pdf` | `/api/v1/cpmis/pm/costs/pdf` | POST | urlencoded form + `csrfToken` | Project manager session + CSRF + ownership | `application/pdf` attachment response | aligned |
| `components/qs/report-view.tsx` form | `/api/qs/reports` | `/api/v1/cpmis/qs/reports` | POST | urlencoded form + `csrfToken` | Quantity surveyor session + CSRF + assigned project | 303 redirect | aligned |
| `components/se/report-view.tsx` form | `/api/se/reports` | `/api/v1/cpmis/se/reports` | POST | `multipart/form-data` (`photos`, fields, `csrfToken`) | Site engineer session + CSRF + assigned project | 303 redirect | aligned |
| `components/documents/documents-view.tsx` register form | `/api/documents` | `/api/v1/cpmis/documents` | POST | `multipart/form-data` (file, metadata, access[], `csrfToken`) | Administrator session + CSRF | 303 redirect to document or register error | aligned |
| `components/documents/documents-view.tsx` revise form | `/api/documents/revise` | `/api/v1/cpmis/documents/revise` | POST | `multipart/form-data` (documentId, file, note, `csrfToken`) | Administrator session + CSRF | 303 redirect to document or revise error | aligned |
| `components/documents/documents-view.tsx` download link | `/api/documents/file?documentId=&revisionId=` | `/api/v1/cpmis/documents/file?documentId=&revisionId=` | GET | query params | Any authenticated portal session with document/project access; no CSRF | File stream/attachment; 302 for legacy dataUrl; 403/404 errors | aligned |
| `components/reports/reports-view.tsx` CSV export link | `/api/reports?...` | `/api/v1/cpmis/reports?...` | GET | query params `from,to,project` | Administrator session; no CSRF | `text/csv` attachment | aligned |
| `components/reports/reports-view.tsx` workbook export link | `/api/reports/workbook?...` | `/api/v1/cpmis/reports/workbook?...` | GET | query params `from,to,project` | Administrator session; no CSRF | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` attachment | aligned |
| `components/vertexa/contact-form.tsx` fetch | `/api/vertexa/inquiries` | `/api/v1/inquiries` | POST | JSON from browser; BFF validates and forwards JSON with admin key | Public; BFF rate-limits/validates; Express public inquiry create rate-limited | JSON `{ok,inquiry}` or error; non-JSON form mode redirects | aligned |
| `components/vertexa/service-inquiry-form.tsx` fetch | `/api/vertexa/inquiries` | `/api/v1/inquiries` | POST | JSON | Public via BFF/admin-key upstream | JSON `{ok,inquiry}` or error | aligned |
| `components/inquiries/inquiries-view.tsx` fetch | `/api/vertexa/inquiries?...` | `/api/v1/inquiries?...` | GET | query params | Administrator session in BFF + `x-api-key` upstream | JSON `{ok,items}` | aligned |
| `components/inquiries/inquiry-detail.tsx` fetch | `/api/vertexa/inquiries/:id` | `/api/v1/inquiries/:id` | GET | none | Administrator session in BFF + admin key upstream | JSON `{ok,inquiry}` | aligned |
| `components/inquiries/inquiry-detail.tsx` fetch | `/api/vertexa/inquiries/:id` | `/api/v1/inquiries/:id` | PATCH | JSON body + `x-csrf-token` header | Administrator session + BFF CSRF check + admin key upstream | JSON `{ok,inquiry}` | aligned |
| `lib/data/admin-store.tsx` poll/fetch | `/api/vertexa/notifications` | `/api/v1/notifications?limit=100` | GET | none | Any portal session required by BFF; upstream uses admin key; BFF filters by session | JSON `{ok,items}`; BFF returns empty best-effort on upstream failure | aligned |
| `lib/data/admin-store.tsx` patch | `/api/vertexa/notifications` | `/api/v1/notifications/:id/read` (or read-all fanout) | PATCH | JSON `{id,read}` or `{all:true}` + `x-csrf-token` | Any portal session + BFF CSRF; BFF authorizes visible target; upstream admin key | JSON `{ok,...}` | aligned |

## BFF Routes With No Discovered Browser Caller

| Frontend caller | BFF route | Express endpoint | Method | Payload / content type | Auth / CSRF | Response / redirect | Status |
|---|---|---|---|---|---|---|---|
| None discovered | `/api/state` | `/api/v1/cpmis/state` | GET | none | Administrator session | JSON state | unused/reserved |
| None discovered | `/api/auth/session?portal=` | `/api/v1/cpmis/auth/session/:portal` | GET | query `portal` | Portal session | JSON `{ok,user}` | unused/reserved |
| None discovered (replaced for project creation) | `/api/projects` | `/api/v1/cpmis/projects` | POST | urlencoded form + `csrfToken` | Administrator session + CSRF | 303 redirect | unused/legacy (browser create now uses business API) |
| None discovered (replaced for user management) | `/api/users` | `/api/v1/cpmis/users` | POST/PATCH/DELETE | urlencoded form + `csrfToken` / `_method` | Administrator session + CSRF | 303 redirect | unused/legacy (browser user management now uses business API) |
| None discovered (replaced for employee registration) | `/api/employees` | `/api/v1/cpmis/employees` | POST | urlencoded form + `csrfToken` | Administrator session + CSRF | 303 redirect | unused/legacy (browser employee management now uses business API) |
| `components/projects/projects-view.tsx`, `components/users/users-view.tsx`, `components/employees/employees-view.tsx` (and future UI callers) | `/api/cpmis/business/[...path]` | `/api/v1/cpmis/business/:path*` | GET/POST/PATCH/PUT/DELETE | JSON; BFF forwards via `proxyCpmisJson` (includes `x-csrf-token`, cookies, forwarded host) | Endpoint-specific session/CSRF in Express business router | JSON responses; projects/users/employees CRUD now uses business API | aligned (partial adoption) |

## Server-Side / Non-Browser Callers

| Caller | Target | Express endpoint | Method | Auth | Notes | Status |
|---|---|---|---|---|---|---|
| `lib/server/vertexa-api.ts` server helpers | direct `VERTEXA_API_URL` fetch | `/api/v1/inquiries`, `/api/v1/notifications*` | GET/PATCH/POST | `x-api-key` admin key | Server-side only; used by Next server/BFF internals | server-only |

## Known Contract Fixes Applied In This Pass

| Area | Previous issue | Fix | Status |
|---|---|---|---|
| `components/qs/notices-view.tsx` | Posted mark-read form to admin-only `/api/notifications` (Express required administrator session). | Uses `data.markNotification(...)` portal action through `/api/portal/:portal/actions`, which is QS-authorized and CSRF-protected by admin-store. | aligned |
| `components/documents/documents-view.tsx` | Uploaded/revised documents via Base64 client dispatch through admin-store/local action path instead of object-storage multipart endpoint. | Register/revise forms now submit multipart directly to BFF `/api/documents` and `/api/documents/revise` with hidden `csrfToken`; server stores file object and metadata. | aligned |
| Native form CSRF | Native HTML forms cannot set `x-csrf-token` header. | `backend/src/lib/auth-bridge.ts` accepts CSRF from `x-csrf-token` or body `csrfToken`; forms include hidden `csrfToken`. | aligned |
| BFF origin forwarding | Express same-origin checks behind BFF could see API host. | `lib/server/cpmis-api.ts` forwards `x-forwarded-host` and `x-forwarded-proto`; manual redirect handling preserved. | aligned |

## Audit Notes / Follow-ups

- `POST /api/notifications` remains an administrator-only Express endpoint used by legacy/admin form flows; QS mark-read must go through portal actions or a QS-scoped API. No QS browser caller now targets `/api/notifications`.
- Document uploads are limited by server validation/object-storage rules; the old 512KB Base64 client limit was removed with the multipart migration.
- Business API endpoints under `/api/v1/cpmis/business/*` have BFF coverage; projects and user management browser flows now use them. Remaining business domains (employees, tasks, reports, BOQ, costs, etc.) are still reserved/partially adopted until UI migration.
- Remaining recommended validation: add contract tests for BFF forwarding/origin, CSRF body-token acceptance, QS notices authorization, and document multipart upload/revision; run `npx eslint`, `npx tsc --noEmit --pretty false`, and `npx vitest run --reporter=verbose`.
