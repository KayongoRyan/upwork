# Backup and Recovery Procedures

This document defines operational backup and recovery procedures for CPMIS/Vertexa.

## Scope

Back up and restore all persistent system state:

| Component | Location | Notes |
| --- | --- | --- |
| Admin portal DB | `MONGODB_DB_ADMIN` (default `vertexa_admin`) | Projects, users, employees, documents, activity logs, work comments, settings, monthly activity, credentials, sessions, OTP challenges, login rate limits, file metadata (`files`), schema `meta` |
| PM portal DB | `MONGODB_DB_PM` (default `vertexa_pm`) | Tasks, calendar events, progress marks, cost reports, notifications, sessions |
| SE portal DB | `MONGODB_DB_SE` (default `vertexa_se`) | Engineer reports, notifications, sessions |
| QS portal DB | `MONGODB_DB_QS` (default `vertexa_qs`) | BOQ, notifications, sessions |
| Legacy Express DB | `MONGODB_DB` (default `vertexa_cpmis`) | Legacy Express `inquiries` and `notifications` collections used by `backend/src/db.js` |
| Object storage | `STORAGE_LOCAL_DIR` (default `data/uploads`) when `STORAGE_DRIVER=local` | Document/report files. MongoDB stores metadata and storage keys; files are required for downloads |
| Environment/config secrets | `.env`, deployment secret manager, API keys, DB credentials | Do **not** commit secrets. Back up through secure secret management |

## Recovery Objectives

Set and review these with operations/product owners:

- **RPO (Recovery Point Objective)**: maximum acceptable data loss. Recommended: <= 15 minutes for production MongoDB (replica set + PITR/oplog) or <= 24 hours for daily backups.
- **RTO (Recovery Time Objective)**: maximum acceptable downtime. Recommended: <= 1 hour for application restore in a prepared environment; depends on data size and storage restore.

Document the actual agreed RPO/RTO in your deployment runbook and verify during drills.

## Prerequisites

- MongoDB Database Tools installed: `mongodump`, `mongorestore`.
- Access to `MONGODB_URI` and target DB names.
- Access to object storage location (`STORAGE_LOCAL_DIR` or cloud bucket).
- A secure backup destination with encryption at rest, restricted access, and offsite copy.
- Maintenance window or write-quiesce plan for consistent standalone backups.

## Environment Variables

From `.env` / `.env.example`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_ADMIN=vertexa_admin
MONGODB_DB_PM=vertexa_pm
MONGODB_DB_SE=vertexa_se
MONGODB_DB_QS=vertexa_qs
MONGODB_DB=vertexa_cpmis
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=data/uploads
```

## MongoDB Backup

### What to back up

Always back up all five databases together for the same backup timestamp:

- `vertexa_admin`
- `vertexa_pm`
- `vertexa_se`
- `vertexa_qs`
- `vertexa_cpmis` (legacy Express DB)

### Recommended schedule

| Environment | Frequency | Retention | Notes |
| --- | --- | --- | --- |
| Production | Daily full + optional hourly/incremental/PITR | 30 daily, 12 monthly; per compliance | Prefer managed backup or replica-set PITR |
| Staging | Daily | 7-14 days | Before deployments/migrations |
| Development | As needed | Short | Before risky schema/data work |

### Backup command (manual)

Use the provided script:

```powershell
# Dry run - shows commands and target paths
node backend/scripts/backup-mongo.mjs --dry-run

# Real backup
node backend/scripts/backup-mongo.mjs --out backups/mongo
```

Equivalent raw `mongodump` commands:

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$out = "backups/mongo/$ts"
mongodump --uri "$env:MONGODB_URI" --db "$env:MONGODB_DB_ADMIN" --out "$out"
mongodump --uri "$env:MONGODB_URI" --db "$env:MONGODB_DB_PM" --out "$out"
mongodump --uri "$env:MONGODB_URI" --db "$env:MONGODB_DB_SE" --out "$out"
mongodump --uri "$env:MONGODB_URI" --db "$env:MONGODB_DB_QS" --out "$out"
mongodump --uri "$env:MONGODB_URI" --db "$env:MONGODB_DB" --out "$out"
```

### Consistency notes

- **Standalone MongoDB**: `mongodump` is not atomic across multiple databases. Schedule during low traffic or stop application writes during backup. For strict consistency, use a replica set and snapshot/PITR strategy.
- **Replica set / Atlas**: prefer snapshot/PITR/managed backup. Ensure oplog coverage meets RPO.
- **Transactions**: CPMIS uses multi-document transactions when MongoDB supports them (replica set). Standalone falls back to ordered bulk writes. Backups should capture all related DBs from the same window.

### Backup storage and security

- Encrypt backup files at rest and in transit.
- Store offsite / in a separate failure domain.
- Restrict access to backup operators and incident responders.
- Do not store `.env` secrets in plaintext backup artifacts. Use a secret manager or encrypted vault.
- Record backup timestamp, operator, source URI target (redacted), DB list, checksum, and storage location.

## Object Storage Backup

### Local driver (`STORAGE_DRIVER=local`)

Files are stored under `STORAGE_LOCAL_DIR` (default `data/uploads`). Keys are stored in MongoDB document revisions and `vertexa_admin.files` metadata.

Backup procedure:

1. Create MongoDB backup first (or in same controlled window).
2. Copy `STORAGE_LOCAL_DIR` to backup storage preserving relative paths.
3. Record backup timestamp and checksum/manifests.

Example PowerShell copy:

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$src = "data/uploads"
$dst = "backups/uploads/$ts"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item -Path "$src\*" -Destination $dst -Recurse -Force
```

For large volumes, use `robocopy`, filesystem snapshot, or storage-native backup.

### S3/cloud driver (future)

If `STORAGE_DRIVER` is moved to S3/object storage:

- Enable bucket versioning.
- Enable server-side encryption and lifecycle policies.
- Use cross-region replication or backup vault per RPO/RTO.
- Back up bucket configuration/IAM/policies as infrastructure-as-code.

## Restore Procedures

### Before restore

1. Declare incident / maintenance window. Stop writes from CPMIS apps and background jobs.
2. Identify target backup timestamp and verify artifact integrity.
3. Confirm target environment and DB names. **Never restore into the wrong environment.**
4. Take a safety backup/snapshot of current state before destructive restore.
5. Ensure schema/code compatibility (see below).

### MongoDB restore

Use the provided script:

```powershell
# Dry run
node backend/scripts/restore-mongo.mjs --from backups/mongo/<timestamp> --dry-run

# Destructive restore (requires explicit confirmation)
node backend/scripts/restore-mongo.mjs --from backups/mongo/<timestamp> --drop --confirm RESTORE
```

Raw `mongorestore` example:

```powershell
$backup = "backups/mongo/<timestamp>"
mongorestore --uri "$env:MONGODB_URI" --drop --nsInclude "$env:MONGODB_DB_ADMIN.*" --dir "$backup"
mongorestore --uri "$env:MONGODB_URI" --drop --nsInclude "$env:MONGODB_DB_PM.*" --dir "$backup"
mongorestore --uri "$env:MONGODB_URI" --drop --nsInclude "$env:MONGODB_DB_SE.*" --dir "$backup"
mongorestore --uri "$env:MONGODB_URI" --drop --nsInclude "$env:MONGODB_DB_QS.*" --dir "$backup"
mongorestore --uri "$env:MONGODB_URI" --drop --nsInclude "$env:MONGODB_DB.*" --dir "$backup"
```

Restore notes:

- `--drop` replaces existing collections before restore. Use only with confirmed backup and target.
- Restore all five DBs from the same backup set.
- If using MongoDB Atlas/managed restore, follow provider PITR/snapshot restore and update connection strings as needed.

### Object storage restore

1. Restore file objects to the configured `STORAGE_LOCAL_DIR` (or bucket) for the same timestamp as MongoDB backup.
2. Preserve key paths exactly; document metadata stores object keys.
3. Verify file permissions and that the service account can read files.

### Environment/secret restore

- Restore `.env`/secrets from secure vault/secret manager, not from ad hoc files.
- Rotate secrets if compromise is suspected.
- Confirm `NODE_ENV=production`, `OTP_DEMO_FALLBACK=false`, CORS, API keys, Mongo URI, and storage config.

## Schema Migration / Version Compatibility

- CPMIS stores schema version in `vertexa_admin.meta` document `_id: "schema"`.
- Current schema version is defined by `CURRENT_SCHEMA_VERSION` in `lib/server/portal-store.ts`.
- On startup, `runMigrations()` applies pending migrations and updates schema version.
- Restore compatibility rules:
  - **Preferred**: restore DB backup to same app version it was taken from, then deploy newer app version and let migrations run.
  - **Supported**: restore older backup to newer app only if migrations are backward-compatible and tested.
  - **Avoid**: restoring newer-schema backup into older app version. This can cause validation/query incompatibilities.
- Before production restore, verify migration history and test restore in staging.

## Restore Verification Checklist

After restore, verify before reopening traffic:

- [ ] App starts cleanly; `/api/v1/health` returns `ok:true` and MongoDB connected.
- [ ] All five DBs present with expected collections/count sanity checks.
- [ ] `vertexa_admin.meta` contains expected `schema` version.
- [ ] Admin/PM/SE/QS sign-in works for known accounts.
- [ ] Project/document/task/report records load in affected portals.
- [ ] Document download works for representative files (`/api/documents/file?...`).
- [ ] Recent records around backup timestamp are present (within RPO).
- [ ] No unexpected validation/migration errors in logs.
- [ ] Write smoke test: create/update/delete a non-critical record in staging or controlled prod check.

## Incident Recovery Runbook

1. **Detect**: monitor health checks, DB connectivity, error logs (`persistence-failed`, Mongo errors), and user reports.
2. **Assess**: classify outage (app, DB, storage, network, corruption, accidental deletion, security incident).
3. **Contain**: stop writes, disable affected routes if needed, preserve evidence/logs/snapshots.
4. **Communicate**: notify stakeholders with impact, ETA, and next update time.
5. **Recover**: restore from latest known good backup set (MongoDB + object storage + secrets/config as needed).
6. **Verify**: run restore verification checklist.
7. **Reopen**: gradually restore traffic; monitor errors, latency, and data integrity.
8. **Postmortem**: document root cause, data loss window, RPO/RTO achieved, corrective actions.

## Operational Checks

- Test backup restore quarterly in staging (minimum).
- Monitor backup job success/failure and alert on failure.
- Periodically verify backup artifact integrity/checksums.
- Review retention, encryption, and access controls.
- Update this document when DB names, storage drivers, schema strategy, or deployment topology change.
