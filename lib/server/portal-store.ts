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

import type { AnyBulkWriteOperation, ClientSession, Db, Document } from "mongodb";
import { adminReducer, type AdminAction } from "@/lib/data/reducer";
import { createSeedState } from "@/lib/mock-data/seed";
import {
  getMongoRuntime,
  isMongoConnectivityError,
  PersistenceError,
  portalDatabaseName,
  requirePersistenceInProduction,
  resetMongoRuntime,
  type MongoRuntime,
} from "@/lib/server/mongo";
import { cpmisPortalIds, type CpmisPortalId } from "@/lib/portals";
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
const SCHEMA_DOC = "schema";
const CURRENT_SCHEMA_VERSION = 1;

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
  /** True while the cached state is the development-only in-memory fallback. */
  __cpmisPortalMemory?: boolean;
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

async function syncRecords(
  db: Db,
  name: string,
  before: Identified[],
  after: Identified[],
  session?: ClientSession,
): Promise<void> {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const collection = db.collection<StoredDocument>(name);
  const afterIds = new Set(after.map((item) => item.id));
  const ops: AnyBulkWriteOperation<StoredDocument>[] = [];

  for (let index = 0; index < after.length; index += 1) {
    const item = after[index] as Identified & Record<string, unknown>;
    ops.push({
      replaceOne: {
        filter: { _id: item.id },
        replacement: { ...item, _id: item.id, _seq: index } as Document,
        upsert: true,
      },
    });
  }

  for (const item of before) {
    if (!afterIds.has(item.id)) {
      ops.push({ deleteOne: { filter: { _id: item.id } } });
    }
  }

  if (ops.length === 0) return;
  await collection.bulkWrite(ops, { ordered: true, ...(session ? { session } : {}) });
}

async function syncSettings(db: Db, before: OrgSettings | null | undefined, after: OrgSettings, session?: ClientSession) {
  if (before && JSON.stringify(before) === JSON.stringify(after)) return;
  await db.collection<StoredDocument>("settings").replaceOne(
    { _id: SETTINGS_DOC },
    { _id: SETTINGS_DOC, ...after },
    { upsert: true, ...(session ? { session } : {}) },
  );
}

async function syncMonthlyActivity(db: Db, before: unknown, after: unknown, session?: ClientSession) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  await db.collection<StoredDocument>("monthlyActivity").replaceOne(
    { _id: MONTHLY_DOC },
    { _id: MONTHLY_DOC, items: after },
    { upsert: true, ...(session ? { session } : {}) },
  );
}

/* -------------------------------------------------------------------------- */
/* Notification ownership                                                      */
/* -------------------------------------------------------------------------- */

function notificationPortal(item: AppNotification, usersById?: Map<string, { role: string }>): PortalKey {
  if (item.recipientId) {
    const role = usersById?.get(item.recipientId)?.role;
    if (role === "project_manager") return "project_manager";
    if (role === "site_engineer") return "site_engineer";
    if (role === "quantity_surveyor") return "quantity_surveyor";
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
/* Collection-level validation                                                 */
/* -------------------------------------------------------------------------- */

type JsonSchema = Record<string, unknown>;

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = ["id"]): JsonSchema {
  return {
    bsonType: "object",
    required,
    additionalProperties: true,
    properties: {
      _id: {},
      _seq: { bsonType: ["int", "long", "double"] },
      id: { bsonType: "string", minLength: 1 },
      ...properties,
    },
  };
}

const COLLECTION_VALIDATORS: Partial<Record<RecordCollection | "notifications", JsonSchema>> = {
  projects: objectSchema({
    name: { bsonType: "string", minLength: 1 },
    code: { bsonType: "string", minLength: 1 },
    description: { bsonType: "string" },
    client: { bsonType: "string" },
    location: { bsonType: "string" },
    managerId: { bsonType: "string" },
    startDate: { bsonType: "string" },
    expectedEndDate: { bsonType: "string" },
    budget: { bsonType: ["int", "long", "double", "decimal"] },
    spent: { bsonType: ["int", "long", "double", "decimal"] },
    progress: { bsonType: ["int", "long", "double", "decimal"] },
    status: { bsonType: "string" },
    createdAt: { bsonType: "string" },
  }, ["id", "name", "code", "managerId", "status"]),
  users: objectSchema({
    firstName: { bsonType: "string", minLength: 1 },
    lastName: { bsonType: "string", minLength: 1 },
    email: { bsonType: "string", minLength: 3 },
    phone: { bsonType: "string" },
    role: { enum: ["administrator", "project_manager", "site_engineer", "quantity_surveyor"] },
    projectId: { bsonType: ["string", "null"] },
    status: { enum: ["active", "inactive"] },
    registeredAt: { bsonType: "string" },
  }, ["id", "firstName", "lastName", "email", "role", "status"]),
  employees: objectSchema({
    employeeCode: { bsonType: "string", minLength: 1 },
    firstName: { bsonType: "string", minLength: 1 },
    lastName: { bsonType: "string", minLength: 1 },
    position: { bsonType: "string" },
    department: { bsonType: "string" },
    phone: { bsonType: "string" },
    email: { bsonType: "string" },
    projectId: { bsonType: ["string", "null"] },
    status: { bsonType: "string" },
    hiredAt: { bsonType: "string" },
  }, ["id", "employeeCode", "firstName", "lastName"]),
  tasks: objectSchema({
    title: { bsonType: "string", minLength: 1 },
    projectId: { bsonType: "string", minLength: 1 },
    assignee: { bsonType: "string" },
    dueDate: { bsonType: "string" },
    priority: { bsonType: "string" },
    status: { bsonType: "string" },
    progress: { bsonType: ["int", "long", "double", "decimal"] },
  }, ["id", "title", "projectId"]),
  reports: objectSchema({
    projectId: { bsonType: "string", minLength: 1 },
    engineerId: { bsonType: "string", minLength: 1 },
    periodStart: { bsonType: "string" },
    periodEnd: { bsonType: "string" },
    progress: { bsonType: ["int", "long", "double", "decimal"] },
    summary: { bsonType: "string" },
    issues: { bsonType: "string" },
    photos: { bsonType: "array" },
    status: { bsonType: "string" },
    submittedAt: { bsonType: "string" },
    reviewedAt: { bsonType: ["string", "null"] },
  }, ["id", "projectId", "engineerId"]),
  boq: objectSchema({
    projectId: { bsonType: "string", minLength: 1 },
    code: { bsonType: "string" },
    description: { bsonType: "string" },
    unit: { bsonType: "string" },
    estimatedQty: { bsonType: ["int", "long", "double", "decimal"] },
    actualQty: { bsonType: ["int", "long", "double", "decimal"] },
    unitRate: { bsonType: ["int", "long", "double", "decimal"] },
  }, ["id", "projectId"]),
  notifications: objectSchema({
    recipientId: { bsonType: "string", minLength: 1 },
    actorId: { bsonType: "string" },
    actorName: { bsonType: "string" },
    kind: { bsonType: "string" },
    title: { bsonType: "string" },
    message: { bsonType: "string" },
    href: { bsonType: "string" },
    createdAt: { bsonType: "string" },
    read: { bsonType: "bool" },
  }, ["id", "recipientId"]),
};

const FILES_VALIDATOR = objectSchema({
  key: { bsonType: "string", minLength: 1 },
  fileName: { bsonType: "string", minLength: 1 },
  contentType: { bsonType: "string" },
  size: { bsonType: ["int", "long", "double", "decimal"] },
  sha256: { bsonType: "string" },
  storageDriver: { bsonType: "string" },
  uploadedBy: { bsonType: "string" },
  uploadedAt: { bsonType: "string" },
  projectId: { bsonType: "string" },
  documentId: { bsonType: "string" },
  revisionId: { bsonType: "string" },
  source: { bsonType: "string" },
}, ["_id", "key", "fileName", "contentType", "size", "storageDriver", "uploadedBy", "uploadedAt", "source"]);

const UNIQUE_INDEXES: Array<{ portal: PortalKey; collection: string; keys: Record<string, 1>; name: string; collation?: { locale: string; strength: number } }> = [
  { portal: "administrator", collection: "users", keys: { email: 1 }, name: "uniq_users_email", collation: { locale: "en", strength: 2 } },
  { portal: "administrator", collection: "employees", keys: { employeeCode: 1 }, name: "uniq_employees_code" },
  { portal: "administrator", collection: "projects", keys: { code: 1 }, name: "uniq_projects_code" },
];

const RELATIONSHIP_INDEXES: Array<{ portal: PortalKey; collection: string; keys: Record<string, 1>; name: string }> = [
  { portal: "administrator", collection: "projects", keys: { managerId: 1 }, name: "rel_projects_managerId" },
  { portal: "administrator", collection: "users", keys: { projectId: 1 }, name: "rel_users_projectId" },
  { portal: "administrator", collection: "users", keys: { role: 1 }, name: "rel_users_role" },
  { portal: "administrator", collection: "employees", keys: { projectId: 1 }, name: "rel_employees_projectId" },
  { portal: "administrator", collection: "documents", keys: { projectId: 1 }, name: "rel_documents_projectId" },
  { portal: "administrator", collection: "activityLogs", keys: { userId: 1 }, name: "rel_activityLogs_userId" },
  { portal: "administrator", collection: "workComments", keys: { projectId: 1 }, name: "rel_workComments_projectId" },
  { portal: "project_manager", collection: "tasks", keys: { projectId: 1 }, name: "rel_tasks_projectId" },
  { portal: "project_manager", collection: "progressMarks", keys: { projectId: 1 }, name: "rel_progressMarks_projectId" },
  { portal: "project_manager", collection: "costReports", keys: { projectId: 1 }, name: "rel_costReports_projectId" },
  { portal: "site_engineer", collection: "reports", keys: { projectId: 1 }, name: "rel_reports_projectId" },
  { portal: "site_engineer", collection: "reports", keys: { engineerId: 1 }, name: "rel_reports_engineerId" },
  { portal: "quantity_surveyor", collection: "boq", keys: { projectId: 1 }, name: "rel_boq_projectId" },
  { portal: "administrator", collection: "notifications", keys: { recipientId: 1 }, name: "rel_notifications_recipientId" },
  { portal: "project_manager", collection: "notifications", keys: { recipientId: 1 }, name: "rel_notifications_recipientId" },
  { portal: "site_engineer", collection: "notifications", keys: { recipientId: 1 }, name: "rel_notifications_recipientId" },
  { portal: "quantity_surveyor", collection: "notifications", keys: { recipientId: 1 }, name: "rel_notifications_recipientId" },
  { portal: "administrator", collection: "files", keys: { projectId: 1 }, name: "rel_files_projectId" },
  { portal: "administrator", collection: "files", keys: { documentId: 1 }, name: "rel_files_documentId" },
  { portal: "administrator", collection: "files", keys: { uploadedBy: 1 }, name: "rel_files_uploadedBy" },
];

async function applyCollectionValidation(db: Db, collection: string, schema: JsonSchema): Promise<void> {
  const validator = { $jsonSchema: schema };
  try {
    await db.command({ collMod: collection, validator, validationLevel: "strict", validationAction: "error" });
  } catch (error) {
    const code = (error as { code?: number })?.code;
    // NamespaceNotFound: create collection with validator.
    if (code === 26) {
      await db.createCollection(collection, { validator, validationLevel: "strict", validationAction: "error" });
      return;
    }
    throw error;
  }
}

async function ensurePortalValidation(runtime: MongoRuntime): Promise<void> {
  for (const portal of PORTAL_KEYS) {
    const db = runtime.dbs[portal];
    const spec = PORTAL_COLLECTIONS[portal];
    for (const name of spec.records) {
      const schema = COLLECTION_VALIDATORS[name];
      if (schema) await applyCollectionValidation(db, name, schema);
    }
    await applyCollectionValidation(db, "notifications", COLLECTION_VALIDATORS.notifications!);

    if (spec.settings) {
      await applyCollectionValidation(db, "settings", objectSchema({}, ["_id"]));
    }
    if (spec.monthlyActivity) {
      await applyCollectionValidation(db, "monthlyActivity", objectSchema({ items: { bsonType: "array" } }, ["_id"]));
    }
  }

  await applyCollectionValidation(runtime.dbs.administrator, "files", FILES_VALIDATOR);

  for (const index of UNIQUE_INDEXES) {
    const collection = runtime.dbs[index.portal].collection(index.collection);
    try {
      await collection.createIndex(index.keys, {
        unique: true,
        name: index.name,
        ...(index.collation ? { collation: index.collation } : {}),
      });
    } catch (error) {
      const code = (error as { code?: number })?.code;
      // IndexOptionsConflict/IndexKeySpecsConflict - existing index differs; leave as-is.
      if (code === 85 || code === 86) continue;
      throw error;
    }
  }

  for (const index of RELATIONSHIP_INDEXES) {
    const collection = runtime.dbs[index.portal].collection(index.collection);
    try {
      await collection.createIndex(index.keys, { name: index.name });
    } catch (error) {
      const code = (error as { code?: number })?.code;
      if (code === 85 || code === 86) continue;
      throw error;
    }
  }
}

function assertStateIntegrity(state: AdminState): void {
  const projectIds = new Set(state.projects.map((p) => p.id));
  const userIds = new Set(state.users.map((u) => u.id));

  for (const project of state.projects) {
    if (project.managerId && !userIds.has(project.managerId)) {
      throw new PersistenceError(`Project ${project.id} references missing manager ${project.managerId}.`);
    }
  }

  for (const user of state.users) {
    if (user.projectId && !projectIds.has(user.projectId)) {
      throw new PersistenceError(`User ${user.id} references missing project ${user.projectId}.`);
    }
  }

  for (const employee of state.employees) {
    if (employee.projectId && !projectIds.has(employee.projectId)) {
      throw new PersistenceError(`Employee ${employee.id} references missing project ${employee.projectId}.`);
    }
  }

  for (const task of state.tasks) {
    if (!projectIds.has(task.projectId)) {
      throw new PersistenceError(`Task ${task.id} references missing project ${task.projectId}.`);
    }
  }

  for (const report of state.reports) {
    if (!projectIds.has(report.projectId)) {
      throw new PersistenceError(`Report ${report.id} references missing project ${report.projectId}.`);
    }
    if (!userIds.has(report.engineerId)) {
      throw new PersistenceError(`Report ${report.id} references missing engineer ${report.engineerId}.`);
    }
  }

  for (const item of state.boq) {
    if (!projectIds.has(item.projectId)) {
      throw new PersistenceError(`BOQ ${item.id} references missing project ${item.projectId}.`);
    }
  }

  for (const document of state.documents) {
    if (!projectIds.has(document.projectId)) {
      throw new PersistenceError(`Document ${document.id} references missing project ${document.projectId}.`);
    }
  }

  for (const comment of state.workComments) {
    if (!projectIds.has(comment.projectId)) {
      throw new PersistenceError(`Work comment ${comment.id} references missing project ${comment.projectId}.`);
    }
  }

  for (const mark of state.progressMarks) {
    if (!projectIds.has(mark.projectId)) {
      throw new PersistenceError(`Progress mark ${mark.id} references missing project ${mark.projectId}.`);
    }
  }

  for (const report of state.costReports) {
    if (!projectIds.has(report.projectId)) {
      throw new PersistenceError(`Cost report ${report.id} references missing project ${report.projectId}.`);
    }
  }
}

const STATUS_TRANSITIONS: Record<string, Record<string, ReadonlySet<string>>> = {
  project: {
    planning: new Set(["planning", "active", "on_hold", "delayed", "completed"]),
    active: new Set(["active", "on_hold", "delayed", "completed"]),
    on_hold: new Set(["on_hold", "planning", "active", "delayed", "completed"]),
    delayed: new Set(["delayed", "active", "on_hold", "completed"]),
    completed: new Set(["completed", "active"]),
  },
  task: {
    todo: new Set(["todo", "pending", "done"]),
    pending: new Set(["pending", "todo", "done"]),
    done: new Set(["done", "todo", "pending"]),
  },
  report: {
    submitted: new Set(["submitted", "in_review", "approved", "rejected"]),
    in_review: new Set(["in_review", "approved", "rejected"]),
    approved: new Set(["approved"]),
    rejected: new Set(["rejected", "submitted"]),
  },
  costReport: {
    pending: new Set(["pending", "submitted"]),
    submitted: new Set(["submitted"]),
  },
  account: {
    active: new Set(["active", "inactive"]),
    inactive: new Set(["inactive", "active"]),
  },
  employment: {
    active: new Set(["active", "on_leave", "contract", "inactive"]),
    on_leave: new Set(["on_leave", "active", "contract", "inactive"]),
    contract: new Set(["contract", "active", "on_leave", "inactive"]),
    inactive: new Set(["inactive", "active", "on_leave", "contract"]),
  },
  revision: {
    draft: new Set(["draft", "in_review", "approved"]),
    in_review: new Set(["in_review", "approved"]),
    approved: new Set(["approved"]),
  },
  inquiry: {
    received: new Set(["received", "assigned", "closed"]),
    assigned: new Set(["assigned", "closed"]),
    closed: new Set(["closed"]),
  },
};

function assertTransition(kind: string, id: string, before: string, after: string): void {
  if (before === after) return;
  const allowed = STATUS_TRANSITIONS[kind]?.[before];
  if (!allowed || !allowed.has(after)) {
    throw new PersistenceError(`Invalid ${kind} status transition for ${id}: ${before} -> ${after}.`);
  }
}

function assertStatusTransitions(previous: AdminState | null, next: AdminState): void {
  if (!previous) return;

  const prevProjects = new Map(previous.projects.map((item) => [item.id, item]));
  for (const item of next.projects) {
    const prev = prevProjects.get(item.id);
    if (prev) assertTransition("project", item.id, prev.status, item.status);
  }

  const prevTasks = new Map(previous.tasks.map((item) => [item.id, item]));
  for (const item of next.tasks) {
    const prev = prevTasks.get(item.id);
    if (prev) assertTransition("task", item.id, prev.status, item.status);
  }

  const prevReports = new Map(previous.reports.map((item) => [item.id, item]));
  for (const item of next.reports) {
    const prev = prevReports.get(item.id);
    if (prev) assertTransition("report", item.id, prev.status, item.status);
  }

  const prevCostReports = new Map(previous.costReports.map((item) => [item.id, item]));
  for (const item of next.costReports) {
    const prev = prevCostReports.get(item.id);
    if (prev) assertTransition("costReport", item.id, prev.status, item.status);
  }

  const prevUsers = new Map(previous.users.map((item) => [item.id, item]));
  for (const item of next.users) {
    const prev = prevUsers.get(item.id);
    if (prev) assertTransition("account", item.id, prev.status, item.status);
  }

  const prevEmployees = new Map(previous.employees.map((item) => [item.id, item]));
  for (const item of next.employees) {
    const prev = prevEmployees.get(item.id);
    if (prev) assertTransition("employment", item.id, prev.status, item.status);
  }

  const prevDocs = new Map(previous.documents.map((item) => [item.id, item]));
  for (const item of next.documents) {
    const prev = prevDocs.get(item.id);
    if (!prev) continue;
    const prevRevisions = new Map(prev.revisions.map((rev) => [rev.id, rev]));
    for (const rev of item.revisions) {
      const prevRev = prevRevisions.get(rev.id);
      if (prevRev) assertTransition("revision", `${item.id}/${rev.id}`, prevRev.status, rev.status);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Schema versioning and migrations                                            */
/* -------------------------------------------------------------------------- */

type Migration = {
  version: number;
  name: string;
  up: (runtime: MongoRuntime) => Promise<void>;
};

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "baseline-schema-version",
    up: async () => {
      // Baseline: validators/indexes are ensured by ensurePortalValidation().
    },
  },
];

async function readSchemaVersion(runtime: MongoRuntime): Promise<number> {
  const doc = await runtime.dbs.administrator.collection<StoredDocument>("meta").findOne({ _id: SCHEMA_DOC });
  const version = doc?.version;
  return typeof version === "number" && Number.isFinite(version) ? version : 0;
}

async function writeSchemaVersion(runtime: MongoRuntime, version: number, session?: ClientSession): Promise<void> {
  await runtime.dbs.administrator.collection<StoredDocument>("meta").replaceOne(
    { _id: SCHEMA_DOC },
    { _id: SCHEMA_DOC, version, updatedAt: new Date().toISOString() },
    { upsert: true, ...(session ? { session } : {}) },
  );
}

async function runMigrations(runtime: MongoRuntime): Promise<void> {
  const current = await readSchemaVersion(runtime);
  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    if (migration.version > CURRENT_SCHEMA_VERSION) break;
    console.info(`[portal-store] Running migration ${migration.version}: ${migration.name}`);
    await migration.up(runtime);
    await writeSchemaVersion(runtime, migration.version);
  }
  if (current < CURRENT_SCHEMA_VERSION && pending.length === 0) {
    await writeSchemaVersion(runtime, CURRENT_SCHEMA_VERSION);
  }
}

/* -------------------------------------------------------------------------- */
/* Load / seed                                                                 */
/* -------------------------------------------------------------------------- */

async function markSeeded(db: Db, session?: ClientSession) {
  await db.collection<StoredDocument>("meta").replaceOne(
    { _id: SEED_DOC },
    { _id: SEED_DOC, version: 1, seededAt: new Date().toISOString() },
    { upsert: true, ...(session ? { session } : {}) },
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

function isTransactionUnsupported(error: unknown): boolean {
  const code = (error as { code?: number; codeName?: string })?.code;
  const codeName = String((error as { codeName?: string })?.codeName ?? "");
  const message = String((error as { message?: string })?.message ?? "");
  return (
    code === 20 ||
    codeName === "IllegalOperation" ||
    /Transaction numbers are only allowed|replica set|does not support transactions|Transaction support/i.test(message)
  );
}

async function persistState(runtime: MongoRuntime, previous: AdminState | null, next: AdminState, session?: ClientSession) {
  const prevUsers = new Map((previous?.users ?? []).map((u) => [u.id, { role: u.role }]));
  const nextUsers = new Map(next.users.map((u) => [u.id, { role: u.role }]));
  for (const portal of PORTAL_KEYS) {
    const db = runtime.dbs[portal];
    const spec = PORTAL_COLLECTIONS[portal];

    for (const name of spec.records) {
      const before = previous ? (previous[name] as Identified[]) : [];
      const after = next[name] as Identified[];
      await syncRecords(db, name, before, after, session);
    }

    if (spec.settings) {
      await syncSettings(db, previous?.settings, next.settings, session);
    }
    if (spec.monthlyActivity) {
      await syncMonthlyActivity(db, previous?.monthlyActivity, next.monthlyActivity, session);
    }

    const beforeNotices = previous ? notificationsFor(previous.notifications, portal, prevUsers) : [];
    const afterNotices = notificationsFor(next.notifications, portal, nextUsers);
    await syncRecords(db, "notifications", beforeNotices, afterNotices, session);
  }
}

async function persistStateAtomically(
  runtime: MongoRuntime,
  previous: AdminState | null,
  next: AdminState,
  options?: { seedMarker?: boolean },
): Promise<void> {
  const seedMarker = options?.seedMarker ?? false;
  const session = runtime.client.startSession();
  try {
    let unsupported = false;
    try {
      await session.withTransaction(async () => {
        await persistState(runtime, previous, next, session);
        if (seedMarker) await markSeeded(runtime.dbs.administrator, session);
      });
    } catch (error) {
      if (!isTransactionUnsupported(error)) throw error;
      unsupported = true;
    }
    if (unsupported) {
      // Standalone MongoDB does not support multi-document transactions.
      // Fall back to ordered bulk writes, which are atomic per operation and
      // avoid the delete-all/insert-all window of the previous implementation.
      await persistState(runtime, previous, next);
      if (seedMarker) await markSeeded(runtime.dbs.administrator);
    }
  } finally {
    await session.endSession().catch(() => undefined);
  }
}

async function initialize(): Promise<AdminState> {
  const runtime = await getMongoRuntime();
  if (!runtime) {
    store.__cpmisPortalState ??= createSeedState();
    store.__cpmisPortalMemory = true;
    return store.__cpmisPortalState;
  }

  await ensurePortalValidation(runtime);
  await runMigrations(runtime);

  const loaded = await loadState(runtime);
  if (loaded) {
    store.__cpmisPortalState = loaded;
    store.__cpmisPortalReady = true;
    store.__cpmisPortalMemory = false;
    return loaded;
  }

  const seed = createSeedState();
  await persistStateAtomically(runtime, null, seed, { seedMarker: true });
  await writeSchemaVersion(runtime, CURRENT_SCHEMA_VERSION);
  store.__cpmisPortalState = seed;
  store.__cpmisPortalReady = true;
  store.__cpmisPortalMemory = false;
  console.info(
    `[portal-store] Seeded ${portalDatabaseName("administrator")}, ${portalDatabaseName("project_manager")}, ` +
      `${portalDatabaseName("site_engineer")}, ${portalDatabaseName("quantity_surveyor")}.`,
  );
  return seed;
}

async function ensureState(): Promise<AdminState> {
  if (store.__cpmisPortalReady && store.__cpmisPortalState) {
    if (!store.__cpmisPortalMemory) return store.__cpmisPortalState;
    // A development fallback was seeded before MongoDB became reachable.
    // Reload from the database so a later write cannot overwrite persisted data
    // with the stale in-memory copy.
    const runtime = await getMongoRuntime();
    if (!runtime) return store.__cpmisPortalState;
    store.__cpmisPortalReady = false;
    store.__cpmisPortalState = undefined;
    store.__cpmisPortalMemory = false;
  }
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

  for (const t of state.tasks) {
    if (projectIdSet.has(t.projectId)) {
      const assignee = state.users.find((u) => `${u.firstName} ${u.lastName}` === t.assignee);
      if (assignee) userIds.add(assignee.id);
    }
  }
  const users = state.users.filter((u) => userIds.has(u.id));
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
  const notifications = state.notifications.filter((n) => n.recipientId === session.id);

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
  let state: AdminState;
  try {
    state = await ensureState();
  } catch (error) {
    console.error("[portal-store] Could not load the workspace before the action.", error);
    if (isMongoConnectivityError(error)) await resetMongoRuntime(error);
    throw new PersistenceError(error);
  }
  const next = action.type === "reset" ? createSeedState() : adminReducer(state, action);
  assertStateIntegrity(next);
  if (action.type !== "reset") assertStatusTransitions(state, next);

  // In production a missing database is a failed write, not a preview fallback.
  const runtime = requirePersistenceInProduction(await getMongoRuntime());
  if (runtime) {
    const seedMarker = action.type === "reset";
    try {
      await persistStateAtomically(runtime, state, next, { seedMarker });
    } catch (error) {
      console.error("[portal-store] Could not persist the action.", error);
      if (isMongoConnectivityError(error)) {
        await resetMongoRuntime(error);
        const recovered = requirePersistenceInProduction(await getMongoRuntime());
        if (recovered) {
          try {
            await persistStateAtomically(recovered, state, next, { seedMarker });
            store.__cpmisPortalState = next;
            return next;
          } catch (retryError) {
            console.error("[portal-store] Retry after reconnect failed.", retryError);
            if (isMongoConnectivityError(retryError)) await resetMongoRuntime(retryError);
            store.__cpmisPortalReady = false;
            store.__cpmisPortalState = undefined;
            store.__cpmisPortalMemory = false;
            throw new PersistenceError(retryError);
          }
        }
      }
      // Drop the cached state so the next read reflects what the database
      // actually holds instead of a change that was never committed.
      store.__cpmisPortalReady = false;
      store.__cpmisPortalState = undefined;
      store.__cpmisPortalMemory = false;
      throw new PersistenceError(error);
    }
  }

  // Only publish the new state after it has been persisted (or the preview is
  // intentionally running without MongoDB in development).
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
