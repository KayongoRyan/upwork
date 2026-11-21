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

import { MongoClient, type Db, type Document } from "mongodb";
import { adminReducer, type AdminAction } from "@/lib/data/reducer";
import { createSeedState } from "@/lib/mock-data/seed";
import { cpmisPortalIds, type CpmisPortalId } from "@/lib/portals";
import { PREVIEW_PM_ID, PREVIEW_QS_ID, PREVIEW_SE_ID } from "@/lib/utils";
import type { AdminState, AppNotification, OrgSettings } from "@/types";

export const PORTAL_KEYS = cpmisPortalIds;

export type PortalKey = CpmisPortalId;

const DATABASES: Record<PortalKey, { env: string; fallback: string }> = {
  administrator: { env: "MONGODB_DB_ADMIN", fallback: "vertexa_admin" },
  project_manager: { env: "MONGODB_DB_PM", fallback: "vertexa_pm" },
  site_engineer: { env: "MONGODB_DB_SE", fallback: "vertexa_se" },
  quantity_surveyor: { env: "MONGODB_DB_QS", fallback: "vertexa_qs" },
};

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

const DEFAULT_MONGO_URI = "mongodb://127.0.0.1:27017";
const CONNECT_TIMEOUT_MS = 3_000;
const RETRY_AFTER_MS = 15_000;
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
/* Mongo connection                                                            */
/* -------------------------------------------------------------------------- */

interface Runtime {
  client: MongoClient;
  dbs: Record<PortalKey, Db>;
}

interface StoreGlobal {
  __cpmisPortalRuntime?: Runtime | null;
  __cpmisPortalConnecting?: Promise<Runtime | null>;
  __cpmisPortalRetryAt?: number;
  __cpmisPortalWarned?: boolean;
  __cpmisPortalState?: AdminState;
  __cpmisPortalReady?: boolean;
  __cpmisPortalInit?: Promise<AdminState>;
  __cpmisPortalQueue?: Promise<unknown>;
}

const store = globalThis as typeof globalThis & StoreGlobal;

function mongoUri(): string {
  return process.env.MONGODB_URI?.trim() || DEFAULT_MONGO_URI;
}

export function portalDatabaseName(portal: PortalKey): string {
  const spec = DATABASES[portal];
  return process.env[spec.env]?.trim() || spec.fallback;
}

async function openRuntime(): Promise<Runtime | null> {
  const client = new MongoClient(mongoUri(), {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    appName: "cpmis-portal-store",
  });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    return {
      client,
      dbs: {
        administrator: client.db(portalDatabaseName("administrator")),
        project_manager: client.db(portalDatabaseName("project_manager")),
        site_engineer: client.db(portalDatabaseName("site_engineer")),
        quantity_surveyor: client.db(portalDatabaseName("quantity_surveyor")),
      },
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    if (!store.__cpmisPortalWarned) {
      store.__cpmisPortalWarned = true;
      console.warn(
        `[portal-store] MongoDB is not reachable at ${mongoUri()}. ` +
          "The preview will use in-memory state until a database is available.\n" +
          `[portal-store] ${(error as Error).message}`,
      );
    }
    return null;
  }
}

async function getRuntime(): Promise<Runtime | null> {
  if (store.__cpmisPortalRuntime) return store.__cpmisPortalRuntime;
  if (store.__cpmisPortalRetryAt && Date.now() < store.__cpmisPortalRetryAt) return null;
  if (!store.__cpmisPortalConnecting) {
    store.__cpmisPortalConnecting = openRuntime().finally(() => {
      store.__cpmisPortalConnecting = undefined;
    });
  }
  const runtime = await store.__cpmisPortalConnecting;
  store.__cpmisPortalRuntime = runtime;
  if (runtime) {
    store.__cpmisPortalWarned = false;
    store.__cpmisPortalRetryAt = 0;
  } else {
    store.__cpmisPortalRetryAt = Date.now() + RETRY_AFTER_MS;
  }
  return runtime;
}

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

function notificationPortal(item: AppNotification): PortalKey {
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

function notificationsFor(items: AppNotification[], portal: PortalKey): AppNotification[] {
  return items.filter((item) => notificationPortal(item) === portal);
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

async function loadState(runtime: Runtime): Promise<AdminState | null> {
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

async function persistState(runtime: Runtime, previous: AdminState | null, next: AdminState) {
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

    const beforeNotices = previous ? notificationsFor(previous.notifications, portal) : [];
    const afterNotices = notificationsFor(next.notifications, portal);
    await syncRecords(db, "notifications", beforeNotices, afterNotices);
  }
}

async function initialize(): Promise<AdminState> {
  const runtime = await getRuntime();
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

async function applyNow(action: AdminAction): Promise<AdminState> {
  const state = await ensureState();
  const next = action.type === "reset" ? createSeedState() : adminReducer(state, action);

  const runtime = store.__cpmisPortalRuntime;
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
