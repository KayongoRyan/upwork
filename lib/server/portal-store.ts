/**
 * MongoDB persistence for the CPMIS preview workspace.
 *
 * Each portal owns a database:
 *   administrator      → vertexa_admin   projects, users, employees, documents,
 *                                        activity logs, work comments, settings,
 *                                        monthly activity
 *   project_manager    → vertexa_pm      tasks, calendar events, progress marks,
 *                                        cost reports
 *   site_engineer      → vertexa_se      engineer reports
 *   quantity_surveyor  → vertexa_qs      bill of quantities
 *
 * Notifications are split by recipient first (recipientId) and then by the portal
 * that sent them. The databases are named by environment variables so a deployment
 * can point at existing databases without a code change.
 *
 * The domain rules stay in `lib/data/reducer.ts`. This module only:
 *   1. assembles one `AdminState` from the portal databases,
 *   2. seeds every database once from `createSeedState()`,
 *   3. runs the reducer and writes the changed collections back,
 *   4. falls back to in-memory state when MongoDB is not reachable, so the
 *      preview keeps working before the database is started.
 */

import type { Db, Document } from "mongodb";
import { adminReducer, type AdminAction } from "@/lib/data/reducer";
import { createSeedState } from "@/lib/mock-data/seed";
import { getMongoRuntime, portalDatabaseName, type MongoRuntime } from "@/lib/server/mongo";
import { cpmisPortalIds, type CpmisPortalId } from "@/lib/portals";
import { PREVIEW_PM_ID, PREVIEW_QS_ID, PREVIEW_SE_ID } from "@/lib/utils";
import type { AdminState, AppNotification, OrgSettings, SessionUser } from "@/types";

export const PORTAL_KEYS = cpmisPortalIds;

export type PortalKey = CpmisPortalId;

type RecordCollection =
  | "projects"
  | "users"
  | "employees"
  | "documents"
  | "activityLogs"
  | "workComments"
  | "tasks"
  | "calendarEvents"
  | "progressMarks"
  | "costReports"
  | "reports"
  | "boq";

/** Which collections each portal database stores. */
const PORTAL_COLLECTIONS: Record<
  PortalKey,
  { records: RecordCollection[]; settings?: boolean; monthlyActivity?: boolean }
> = {
  administrator: {
    records: ["projects", "users", "employees", "documents", "activityLogs", "workComments"],
    settings: true,
    monthlyActivity: true,
  },
  project_manager: {
    records: ["tasks", "calendarEvents", "progressMarks", "costReports"],
  },
  site_engineer: {
    records: ["reports"],
  },
  quantity_surveyor: {
    records: ["boq"],
  },
};

const SEED_DOC = "seed";
const SETTINGS_DOC = "org";
const MONTHLY_DOC = "monthly";

/* -------------------------------------------------------------------------- */
/* Portal action permissions                                                   */
/* -------------------------------------------------------------------------- */

const NOTIFICATION_ACTIONS = ["mark-notification", "mark-all-notifications"] as const;

const PORTAL_ACTIONS: Record<PortalKey, ReadonlySet<AdminAction["type"]>> = {
  administrator: new Set<AdminAction["type"]>([
    "reset",
    "create-project",
    "update-project",
    "delete-project",
    "create-user",
    "update-user",
    "set-user-status",
    "delete-user",
    "create-employee",
    "update-employee",
    "delete-employee",
    "add-calendar-event",
    "delete-calendar-event",
    "create-task",
    "assign-task",
    "set-task-status",
    "delete-task",
    "schedule-task",
    "set-progress",
    "set-task-progress",
    "delete-report",
    "submit-report",
    "open-report-review",
    "decide-report",
    "resubmit-report",
    "create-boq",
    "update-boq",
    "delete-boq",
    "revise-cost-bill",
    "send-cost-report",
    "delete-cost-report",
    "submit-cost-report",
    "register-document",
    "revise-document",
    "issue-revision",
    "set-document-access",
    "add-work-comment",
    "delete-work-comment",
    "mark-notification",
    "mark-all-notifications",
    "update-settings",
    "support-request",
    "vertexa-inquiry",
    "delete-support-note",
  ]),
  project_manager: new Set<AdminAction["type"]>([
    ...NOTIFICATION_ACTIONS,
    "add-calendar-event",
    "delete-calendar-event",
    "create-task",
    "assign-task",
    "set-task-status",
    "delete-task",
    "schedule-task",
    "set-progress",
    "submit-report",
    "open-report-review",
    "decide-report",
    "revise-cost-bill",
    "submit-cost-report",
  ]),
  site_engineer: new Set<AdminAction["type"]>([
    ...NOTIFICATION_ACTIONS,
    "set-task-progress",
    "submit-report",
    "resubmit-report",
  ]),
  quantity_surveyor: new Set<AdminAction["type"]>([
    ...NOTIFICATION_ACTIONS,
    "create-boq",
    "update-boq",
    "delete-boq",
    "send-cost-report",
  ]),
};

export function isPortalKey(value: string): value is PortalKey {
  return (PORTAL_KEYS as readonly string[]).includes(value);
}

/** True when this portal's screens may perform the action. */
export function portalCanApply(portal: PortalKey, action: AdminAction): boolean {
  return PORTAL_ACTIONS[portal].has(action.type);
}

/* -------------------------------------------------------------------------- */
/* Store state                                                                 */
/* -------------------------------------------------------------------------- */

interface StoreGlobal {
  __cpmisPortalState?: AdminState;
  __cpmisPortalReady?: boolean;
  __cpmisPortalInit?: Promise<AdminState>;
  __cpmisPortalQueue?: Promise<unknown>;
}

const store = globalThis as typeof globalThis & StoreGlobal;

/* -------------------------------------------------------------------------- */
/* Document encoding                                                           */
/* -------------------------------------------------------------------------- */

type Identified = { id: string };

/** Documents we write keyed by a string id (seed marker, settings, monthly activity). */
interface StoredDocument extends Document {
  _id: string;
}

function encodedRecords(items: Identified[]): Document[] {
  return items.map((item, index) => ({ ...item, _id: item.id, _seq: index }));
}

function decodedRecords<T>(docs: Document[]): T[] {
  return docs.map((doc) => {
    const record = { ...doc };
    delete record._id;
    delete record._seq;
    return record as T;
  });
}

async function readRecords<T>(db: Db, name: string): Promise<T[]> {
  const docs = await db.collection(name).find().sort({ _seq: 1 }).toArray();
  return decodedRecords<T>(docs);
}

async function syncRecords(db: Db, name: string, before: Identified[], after: Identified[]) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const collection = db.collection(name);
  await collection.deleteMany({});
  if (after.length > 0) await collection.insertMany(encodedRecords(after));
}

async function syncSettings(db: Db, before: OrgSettings | null | undefined, after: OrgSettings) {
  if (before && JSON.stringify(before) === JSON.stringify(after)) return;
  await db.collection<StoredDocument>("settings").replaceOne({ _id: SETTINGS_DOC }, { _id: SETTINGS_DOC, ...after }, { upsert: true });
}

async function syncMonthlyActivity(db: Db, before: unknown, after: unknown) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  await db.collection<StoredDocument>("monthlyActivity").replaceOne({ _id: MONTHLY_DOC }, { _id: MONTHLY_DOC, items: after }, { upsert: true });
}

/* -------------------------------------------------------------------------- */
/* Notification ownership                                                      */
/* -------------------------------------------------------------------------- */

function notificationPortal(item: AppNotification, usersById?: Map<string, { role: string }>): PortalKey {
  if (item.recipientId && usersById) {
    const role = usersById.get(item.recipientId)?.role;
    if (role === "project_manager") return "project_manager";
    if (role === "site_engineer") return "site_engineer";
    if (role === "quantity_surveyor") return "quantity_surveyor";
    if (role === "administrator") return "administrator";
  }
  if (item.recipientId) {
    if (item.recipientId === PREVIEW_PM_ID) return "project_manager";
    if (item.recipientId === PREVIEW_SE_ID) return "site_engineer";
    if (item.recipientId === PREVIEW_QS_ID) return "quantity_surveyor";
    return "administrator";
  }
  if (item.source === "project_manager") return "project_manager";
  if (item.source === "site_engineer") return "site_engineer";
  if (item.source === "quantity_surveyor") return "quantity_surveyor";
  return "administrator";
}

function notificationsFor(items: AppNotification[], portal: PortalKey, usersById?: Map<string, { role: string }>): AppNotification[] {
  return items.filter((item) => notificationPortal(item, usersById) === portal);
}

/* -------------------------------------------------------------------------- */
/* Load / seed                                                                 */
/* -------------------------------------------------------------------------- */

async function markSeeded(db: Db) {
  await db
    .collection<StoredDocument>("meta")
    .replaceOne(
      { _id: SEED_DOC },
      { _id: SEED_DOC, version: 1, seededAt: new Date().toISOString() },
      { upsert: true },
    );
}

async function loadState(runtime: MongoRuntime): Promise<AdminState | null> {
  const admin = runtime.dbs.administrator;
  const marker = await admin.collection<StoredDocument>("meta").findOne({ _id: SEED_DOC });
  if (!marker) return null;

  const [
    projects,
    users,
    employees,
    documents,
    activityLogs,
    workComments,
    tasks,
    calendarEvents,
    progressMarks,
    costReports,
    reports,
    boq,
    settingsDoc,
    monthlyDoc,
  ] = await Promise.all([
    readRecords<AdminState["projects"][number]>(admin, "projects"),
    readRecords<AdminState["users"][number]>(admin, "users"),
    readRecords<AdminState["employees"][number]>(admin, "employees"),
    readRecords<AdminState["documents"][number]>(admin, "documents"),
    readRecords<AdminState["activityLogs"][number]>(admin, "activityLogs"),
    readRecords<AdminState["workComments"][number]>(admin, "workComments"),
    readRecords<AdminState["tasks"][number]>(runtime.dbs.project_manager, "tasks"),
    readRecords<AdminState["calendarEvents"][number]>(runtime.dbs.project_manager, "calendarEvents"),
    readRecords<AdminState["progressMarks"][number]>(runtime.dbs.project_manager, "progressMarks"),
    readRecords<AdminState["costReports"][number]>(runtime.dbs.project_manager, "costReports"),
    readRecords<AdminState["reports"][number]>(runtime.dbs.site_engineer, "reports"),
    readRecords<AdminState["boq"][number]>(runtime.dbs.quantity_surveyor, "boq"),
    admin.collection<StoredDocument>("settings").findOne({ _id: SETTINGS_DOC }),
    admin.collection<StoredDocument>("monthlyActivity").findOne({ _id: MONTHLY_DOC }),
  ]);

  const noticeGroups = await Promise.all(
    PORTAL_KEYS.map((portal) => readRecords<AppNotification>(runtime.dbs[portal], "notifications")),
  );
  const notifications = noticeGroups
    .flat()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const seed = createSeedState();
  const settings = settingsDoc
    ? (decodedRecords<OrgSettings>([settingsDoc])[0] ?? seed.settings)
    : seed.settings;
  const monthlyActivity = Array.isArray(monthlyDoc?.items)
    ? (monthlyDoc.items as AdminState["monthlyActivity"])
    : seed.monthlyActivity;

  return {
    projects,
    users,
    employees,
    documents,
    activityLogs,
    workComments,
    tasks,
    calendarEvents,
    progressMarks,
    costReports,
    reports,
    boq,
    notifications,
    settings,
    monthlyActivity,
  };
}

async function persistState(runtime: MongoRuntime, previous: AdminState | null, next: AdminState) {
  const prevUsers = new Map((previous?.users ?? []).map((u) => [u.id, { role: u.role }]));
  const nextUsers = new Map(next.users.map((u) => [u.id, { role: u.role }]));
  for (const portal of PORTAL_KEYS) {
    const db = runtime.dbs[portal];
    const spec = PORTAL_COLLECTIONS[portal];

    for (const name of spec.records) {
      const before = previous ? (previous[name] as Identified[]) : [];
      const after = next[name] as Identified[];
      await syncRecords(db, name, before, after);
    }

    if (spec.settings) {
      await syncSettings(db, previous?.settings, next.settings);
    }
    if (spec.monthlyActivity) {
      await syncMonthlyActivity(db, previous?.monthlyActivity, next.monthlyActivity);
    }

    const beforeNotices = previous ? notificationsFor(previous.notifications, portal, prevUsers) : [];
    const afterNotices = notificationsFor(next.notifications, portal, nextUsers);
    await syncRecords(db, "notifications", beforeNotices, afterNotices);
  }
}

async function initialize(): Promise<AdminState> {
  const runtime = await getMongoRuntime();
  if (!runtime) {
    store.__cpmisPortalState ??= createSeedState();
    return store.__cpmisPortalState;
  }

  const loaded = await loadState(runtime);
  if (loaded) {
    store.__cpmisPortalState = loaded;
    store.__cpmisPortalReady = true;
    return loaded;
  }

  const seed = createSeedState();
  await persistState(runtime, null, seed);
  await markSeeded(runtime.dbs.administrator);
  store.__cpmisPortalState = seed;
  store.__cpmisPortalReady = true;
  console.info(
    `[portal-store] Seeded ${portalDatabaseName("administrator")}, ${portalDatabaseName("project_manager")}, ` +
      `${portalDatabaseName("site_engineer")}, ${portalDatabaseName("quantity_surveyor")}.`,
  );
  return seed;
}

async function ensureState(): Promise<AdminState> {
  if (store.__cpmisPortalReady && store.__cpmisPortalState) return store.__cpmisPortalState;
  if (!store.__cpmisPortalInit) {
    store.__cpmisPortalInit = initialize().finally(() => {
      store.__cpmisPortalInit = undefined;
    });
  }
  return store.__cpmisPortalInit;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

export async function readState(): Promise<AdminState> {
  return ensureState();
}

function projectIdsForSession(state: AdminState, session: SessionUser): Set<string> | null {
  if (session.role === "administrator") return null; // all
  if (session.role === "project_manager") {
    return new Set(state.projects.filter((p) => p.managerId === session.id).map((p) => p.id));
  }
  // site_engineer / quantity_surveyor: assigned project only
  const projectId = session.projectId;
  return projectId ? new Set([projectId]) : new Set();
}

export function scopeStateForSession(state: AdminState, session: SessionUser): AdminState {
  const ids = projectIdsForSession(state, session);
  if (!ids) return state;

  const projects = state.projects.filter((p) => ids.has(p.id));
  const projectIdSet = new Set(projects.map((p) => p.id));
  const userIds = new Set<string>();
  for (const p of projects) {
    if (p.managerId) userIds.add(p.managerId);
  }
  for (const u of state.users) {
    if (u.projectId && projectIdSet.has(u.projectId)) userIds.add(u.id);
    if (u.id === session.id) userIds.add(u.id);
  }
  // include users referenced by tasks/reports on scoped projects
  // Tasks have assignee as name; user list is already fully included.
  for (const r of state.reports) {
    if (projectIdSet.has(r.projectId)) {
      userIds.add(r.engineerId);
      if (r.reviewerId) userIds.add(r.reviewerId);
    }
  }

  const users = state.users;
  const employees = state.employees.filter((e) => e.projectId && projectIdSet.has(e.projectId));
  const documents = state.documents.filter((d) => projectIdSet.has(d.projectId) && (session.role === "administrator" || d.access.includes(session.role)));
  const scopedActivityLogs = state.activityLogs.filter((l) => userIds.has(l.userId) || projects.some((p) => l.record.includes(p.code) || l.record.includes(p.name)));
  const workComments = state.workComments.filter((c) => projectIdSet.has(c.projectId));
  const tasks = state.tasks.filter((t) => projectIdSet.has(t.projectId));
  const calendarEvents = state.calendarEvents;
  const progressMarks = state.progressMarks.filter((m) => projectIdSet.has(m.projectId));
  const costReports = state.costReports.filter((r) => projectIdSet.has(r.projectId));
  const reports = state.reports.filter((r) => projectIdSet.has(r.projectId));
  const boq = state.boq.filter((b) => projectIdSet.has(b.projectId));
  const notifications = state.notifications.filter((n) => n.recipientId === session.id || (n.projectId && projectIdSet.has(n.projectId)));

  return {
    ...state,
    projects,
    users,
    employees,
    documents,
    activityLogs: scopedActivityLogs,
    workComments,
    tasks,
    calendarEvents,
    progressMarks,
    costReports,
    reports,
    boq,
    notifications,
  };
}

async function applyNow(action: AdminAction): Promise<AdminState> {
  const state = await ensureState();
  const next = action.type === "reset" ? createSeedState() : adminReducer(state, action);

  const runtime = await getMongoRuntime();
  if (runtime) {
    try {
      await persistState(runtime, state, next);
      if (action.type === "reset") await markSeeded(runtime.dbs.administrator);
    } catch (error) {
      console.error("[portal-store] Could not persist the action; keeping it in memory.", error);
    }
  }

  store.__cpmisPortalState = next;
  return next;
}

export function applyAction(action: AdminAction): Promise<AdminState> {
  const previous = store.__cpmisPortalQueue ?? Promise.resolve();
  const run = previous.then(() => applyNow(action));
  store.__cpmisPortalQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Applies an action only when the portal owns that part of the work. */
export async function applyPortalAction(portal: PortalKey, action: AdminAction): Promise<AdminState> {
  if (!portalCanApply(portal, action)) {
    throw new PortalActionError(portal, action.type);
  }
  return applyAction(action);
}

export class PortalActionError extends Error {
  constructor(
    readonly portal: PortalKey,
    readonly action: string,
  ) {
    super(`The ${portal} portal cannot perform "${action}".`);
    this.name = "PortalActionError";
  }
}
