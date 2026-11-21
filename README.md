# CPMIS

Frontend-only Construction Project Management Information System for Vertexa Group.

Each portal owns a MongoDB database, so its records survive a restart and are stored
alongside the work that portal does. The ports share one Node process; the data does
not live in that process. On first boot each database is seeded from the sample
workspace, and later changes persist.

The preview clock is 6 Nov 2026. Money is RWF. Each portal requires email + password sign-in. Sessions are per portal (signing into one portal does not sign into another). Each portal also has a sign-up flow: users scan the portal QR code from the admin dashboard, submit their name, phone, email, and password, verify their phone with an SMS OTP, and are signed into that portal.

### Demo credentials

Seeded accounts use a password based on role (override with `DEMO_PASSWORD_*` in `.env`):

| Role | Demo password | Example account |
| --- | --- | --- |
| Administrator | `AdminDemo2026!` | amina.uwase@cpmis.demo |
| Project manager | `PmDemo2026!` | sarah.mukamana@cpmis.demo |
| Site engineer | `SeDemo2026!` | lydia.mukeshimana@cpmis.demo |
| Quantity surveyor | `QsDemo2026!` | david.nshimiyimana@cpmis.demo |

All seeded users in `lib/mock-data/seed.ts` can sign in with their role password.

### Self-signup (QR + OTP)

The Administrator dashboard includes a **QR Code** section with a QR for each portal (Administrator, Project Manager, Site Engineer, Quantity Surveyor). Scanning a QR opens that portal's sign-up page where the user enters first/last name, phone number, email, and password. A 6-digit OTP is sent by SMS through Twilio; after verification the account is created as active for that portal role and the user is signed in.

Configure Twilio in `.env`:

```env
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
```

If Twilio is not configured, existing email/password sign-in still works, but OTP signup will return a configuration error.

## Run

Start MongoDB first (the repository ships a local database that keeps its files in
`.mongo-data/`):

```bash
npm install
npm run mongo:local
```

Then, in another terminal:

```bash
npm run dev
```

The portals use `MONGODB_URI` (default `mongodb://127.0.0.1:27017`). If the database
is not reachable the preview still runs from in-memory state and logs a warning; start
MongoDB and restart the app to persist again.

### Per-portal databases

| Portal | Database (default) | Owns |
| --- | --- | --- |
| Administrator | `vertexa_admin` | projects, users, employees, documents, activity logs, work comments, settings, monthly activity |
| Project manager | `vertexa_pm` | tasks, calendar events, progress marks, cost reports |
| Site engineer | `vertexa_se` | engineer reports |
| Quantity surveyor | `vertexa_qs` | bill of quantities |

Notifications are split by recipient and stored in the recipient portal's database.

Override the names with `MONGODB_DB_ADMIN`, `MONGODB_DB_PM`, `MONGODB_DB_SE`, and
`MONGODB_DB_QS` (see `.env.example`). Each portal reads and writes through
`/api/portal/<portal>/state` and `/api/portal/<portal>/actions`; the action endpoint
only accepts actions owned by that portal. The databases are seeded once from
`lib/mock-data/seed.ts`, so deleting a database resets that portal's sample records.

### Backend API (Express + MongoDB)

The API lives in [`backend/`](backend/README.md). It is separate from the Next.js app and stores Vertexa inquiries in MongoDB.

```bash
npm install
copy backend\env.example backend\.env
npm run dev:backend
```

Backend packages (`express`, `mongodb`, etc.) are declared in the **root** `package.json` — do not run `npm install` inside `backend/` unless you have plenty of disk space.

The API runs at http://localhost:4000 and owns Vertexa inquiries: both form types post to this app's `/api/vertexa/inquiries` route, which validates the submission, forwards it as JSON to `POST /api/v1/inquiries`, and redirects back with `?saved=1` or `?error=<code>` (including `rate_limited`). Set `VERTEXA_API_URL` to use another host (see `.env.example`). Development defaults to `http://localhost:4000`; if nothing is listening there the inquiry is kept in memory so the site still works, and production never silently stores a second copy.

Admin API routes (inquiry ops and notifications) require a shared key: set `VERTEXA_API_KEY` in both `.env` (Next BFF → Express) and `backend/.env` (Express). Development defaults to `dev-vertexa-api-key` when unset. Express sets `X-Request-Id` on responses and logs each request with its id; public `POST /api/v1/inquiries` is rate-limited per IP.

The same API URL drives the CPMIS inbox read-through. `GET /api/vertexa/notifications` maps MongoDB notices to CPMIS `AppNotification` records and is loaded in the root layout, so the administrator and project-manager inboxes render public-site inquiries on the first response. The provider then polls that route every 10 seconds for new notices. `PATCH /api/vertexa/notifications` writes mark-read changes back to `PATCH /api/v1/notifications/:id/read`. Mongo notices are merged ahead of the demo notices and labelled **Vertexa site**; the administrator inbox has a matching portal filter. If the API is unavailable, the demo workspace still renders its own notices.

- Administrator: http://localhost:3000/admin
- Project manager: http://localhost:3001/pm
- Site engineer: http://localhost:3002/se
- Quantity surveyor: http://localhost:3003/qs
- Vertexa Group: http://localhost:3030

Each portal starts at its preferred port and steps up by 10 if that port is taken. The URL it actually bound is printed at startup. Links between portals follow those ports.

## Administrator

Portfolio dashboard, projects, document register, users, employees, reports, tasks, activity logs, notifications, and organization settings. Creating a project, user, employee, or document writes to the administrator database, so the other portals see it on their next load.

## Project manager

Dashboard for Sarah’s projects. Today, Daily, Weekly, and Monthly filter the task board. Saved progress from the Progress page is drawn on the dashboard chart. Add event asks for a calendar date, then a name and whether it is a meeting or another event. Save marks that day.

Schedule opens the programme for the project picked in the dropdown. Month, Week, Daily, and Hourly change the scale. Daily and Hourly scroll to 6 Nov 2026.

Tasks can be assigned. Engineer reports can be opened, approved, or rejected. Cost reports can be edited, saved, submitted to the administrator, or saved as a PDF of the figures on the form. A statement the quantity surveyor sends shows up here first.

## Site engineer

Today’s site for Lydia on KGL-CGT-25. File today’s report opens the shift for 6 Nov 2026: progress, what happened, issues, and up to four photos. Filing it puts the report in history and notifies the project manager. Rejected reports can be resubmitted from history. Assigned tasks take a progress update.

## Quantity surveyor

Bill of quantities, measured expenditure, and the financial statement for KGL-CGT-25. Send that statement to the project manager. Notices on that project show here. The project manager submits the cost report to the administrator.
