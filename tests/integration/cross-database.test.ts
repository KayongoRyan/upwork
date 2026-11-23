/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => {}, delete: () => {} })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
}));
vi.mock("next/server", () => ({
  NextResponse: class { cookies = { set: () => {} }; static json() { return new Response(); } },
}));

let mongod: MongoMemoryServer;

function resetGlobals() {
  const g = globalThis as any;
  delete g.__cpmisMongoRuntime;
  delete g.__cpmisMongoConnecting;
  delete g.__cpmisMongoRetryAt;
  delete g.__cpmisMongoWarned;
  delete g.__cpmisPortalStore;
  delete g.__cpmisPortalState;
  delete g.__cpmisPortalReady;
  delete g.__cpmisPortalMemory;
  delete g.__cpmisPortalInit;
  delete g.__cpmisPortalQueue;
  delete g.__cpmisAuth;
}

async function closeRuntimeFromGlobal() {
  const g = globalThis as any;
  try { await g.__cpmisMongoRuntime?.client?.close?.(); } catch {}
}

async function loadModules() {
  vi.resetModules();
  resetGlobals();
  const portalStore = await import("../../lib/server/portal-store");
  const auth = await import("../../lib/server/auth");
  const mongo = await import("../../lib/server/mongo");
  return { portalStore, auth, mongo };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  (process.env as any).NODE_ENV = "test";
  process.env.MONGODB_DB_ADMIN = "test_vertexa_admin";
  process.env.MONGODB_DB_PM = "test_vertexa_pm";
  process.env.MONGODB_DB_SE = "test_vertexa_se";
  process.env.MONGODB_DB_QS = "test_vertexa_qs";
}, 180000);

afterAll(async () => {
  await closeRuntimeFromGlobal();
  await mongod?.stop().catch(() => {});
}, 120000);

beforeEach(async () => {
  await closeRuntimeFromGlobal();
  resetGlobals();
  vi.resetModules();
  process.env.MONGODB_URI = mongod.getUri();
  (process.env as any).NODE_ENV = "test";
  process.env.MONGODB_DB_ADMIN = "test_vertexa_admin";
  process.env.MONGODB_DB_PM = "test_vertexa_pm";
  process.env.MONGODB_DB_SE = "test_vertexa_se";
  process.env.MONGODB_DB_QS = "test_vertexa_qs";
  const { getMongoRuntime } = await import("../../lib/server/mongo");
  const rt = await getMongoRuntime();
  if (rt) await Promise.all(Object.values(rt.dbs).map((db: any) => db.dropDatabase().catch(() => {})));
  try { await (rt as any)?.client?.close?.(); } catch {}
  resetGlobals();
  vi.resetModules();
}, 180000);

function stamp(n: number, actor: any = { id: "admin-seed", firstName: "Admin", lastName: "User", role: "administrator" }) {
  return {
    id: `act-xdb-${n}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date(Date.now() + n).toISOString(),
    notificationId: `ntf-xdb-${n}-${Math.random().toString(36).slice(2, 8)}`,
    actorId: actor.id,
    actorName: `${actor.firstName} ${actor.lastName}`,
    actorRole: actor.role,
  };
}

async function seedBase(portalStore: any) {
  let state = await portalStore.readState();
  const admin = state.users.find((u: any) => u.role === "administrator");
  const pm = state.users.find((u: any) => u.role === "project_manager");
  const project = state.projects.find((p: any) => p.managerId === pm?.id) ?? state.projects[0];
  let se = state.users.find((u: any) => u.role === "site_engineer" && u.projectId === project.id)
    ?? state.users.find((u: any) => u.role === "site_engineer");
  let qs = state.users.find((u: any) => u.role === "quantity_surveyor" && u.projectId === project.id)
    ?? state.users.find((u: any) => u.role === "quantity_surveyor");
  if (se && se.projectId !== project.id) {
    await portalStore.applyPortalAction("administrator", { type: "update-user", id: se.id, input: { ...se, projectId: project.id }, stamp: stamp(9001, admin) } as any, { ...admin, role: "administrator" });
  }
  if (qs && qs.projectId !== project.id) {
    await portalStore.applyPortalAction("administrator", { type: "update-user", id: qs.id, input: { ...qs, projectId: project.id }, stamp: stamp(9002, admin) } as any, { ...admin, role: "administrator" });
  }
  state = await portalStore.readState();
  se = state.users.find((u: any) => u.id === se?.id) ?? se;
  qs = state.users.find((u: any) => u.id === qs?.id) ?? qs;
  return { state, admin, pm, se, qs, project };
}

describe("cross-database workflows", () => {
  it("persists portal entities to their owning databases and readState assembles them", async () => {
    const { portalStore, mongo } = await loadModules();
    const { project, pm, se, qs } = await seedBase(portalStore);

    await portalStore.applyPortalAction("project_manager", {
      type: "create-task",
      input: { title: "XDB Task", projectId: project.id, assignee: "SE One", dueDate: "2026-12-01", priority: "medium", status: "todo" },
      stamp: stamp(1, pm),
    } as any, { ...pm, role: "project_manager" });

    await portalStore.applyPortalAction("site_engineer", {
      type: "submit-report",
      input: { projectId: project.id, engineerId: se.id, periodStart: "2026-01-01", periodEnd: "2026-01-02", progress: 10, summary: "Cross-db report summary", issues: "", photos: [] },
      photos: [],
      stamp: stamp(2, se),
    } as any, { ...se, role: "site_engineer", projectId: project.id });

    await portalStore.applyPortalAction("quantity_surveyor", {
      type: "create-boq",
      surveyorId: qs.id,
      input: { projectId: project.id, code: "XDB-BOQ-1", description: "Cross DB item", unit: "m3", estimatedQty: 5, actualQty: 4, unitRate: 100 },
      stamp: stamp(3, qs),
    } as any, { ...qs, role: "quantity_surveyor", projectId: project.id });

    const rt = await mongo.getMongoRuntime();
    expect(rt).toBeTruthy();
    const taskInPm = await rt!.dbs.project_manager.collection("tasks").findOne({ title: "XDB Task" });
    const reportInSe = await rt!.dbs.site_engineer.collection("reports").findOne({ "summary": "Cross-db report summary" });
    const boqInQs = await rt!.dbs.quantity_surveyor.collection("boq").findOne({ code: "XDB-BOQ-1" });

    expect(taskInPm).toBeTruthy();
    expect(reportInSe).toBeTruthy();
    expect(boqInQs).toBeTruthy();
    // Ensure they are not duplicated into admin DB record collections
    expect(await rt!.dbs.administrator.collection("tasks").countDocuments({ title: "XDB Task" })).toBe(0);
    expect(await rt!.dbs.administrator.collection("reports").countDocuments({ summary: "Cross-db report summary" })).toBe(0);
    expect(await rt!.dbs.administrator.collection("boq").countDocuments({ code: "XDB-BOQ-1" })).toBe(0);

    const assembled = await portalStore.readState();
    expect(assembled.tasks.some((t: any) => t.title === "XDB Task")).toBe(true);
    expect(assembled.reports.some((r: any) => r.summary === "Cross-db report summary")).toBe(true);
    expect(assembled.boq.some((b: any) => b.code === "XDB-BOQ-1")).toBe(true);
  }, 180000);

  it("runs an end-to-end workflow across admin, pm, se, and qs databases", async () => {
    const { portalStore, mongo } = await loadModules();
    const { admin, pm, se, qs, project } = await seedBase(portalStore);

    // Admin updates project (admin DB)
    await portalStore.applyPortalAction("administrator", {
      type: "update-project",
      id: project.id,
      input: { ...project, description: "Updated cross-db workflow description", expectedEndDate: project.expectedEndDate ?? project.endDate ?? "2026-12-31" },
      stamp: stamp(10, admin),
    } as any, { ...admin, role: "administrator" });

    // PM creates task (pm DB)
    await portalStore.applyPortalAction("project_manager", {
      type: "create-task",
      input: { title: "Workflow Task", projectId: project.id, assignee: `${se.firstName} ${se.lastName}`, dueDate: "2026-12-01", priority: "high", status: "todo" },
      stamp: stamp(11, pm),
    } as any, { ...pm, role: "project_manager" });

    // SE submits report (se DB)
    await portalStore.applyPortalAction("site_engineer", {
      type: "submit-report",
      input: { projectId: project.id, engineerId: se.id, periodStart: "2026-02-01", periodEnd: "2026-02-07", progress: 25, summary: "Workflow report summary text", issues: "", photos: [] },
      photos: [],
      stamp: stamp(12, se),
    } as any, { ...se, role: "site_engineer", projectId: project.id });

    const afterReport = await portalStore.readState();
    const report = afterReport.reports.find((r: any) => r.summary === "Workflow report summary text");
    expect(report).toBeTruthy();
    if (!report) throw new Error("missing report");

    // PM reviews report (se DB record updated via portal store state write)
    await portalStore.applyPortalAction("project_manager", {
      type: "open-report-review",
      id: report.id,
      stamp: stamp(13, pm),
    } as any, { ...pm, role: "project_manager" });
    await portalStore.applyPortalAction("project_manager", {
      type: "decide-report",
      id: report.id,
      decision: "approved",
      note: "Approved in cross-db workflow",
      stamp: stamp(14, pm),
    } as any, { ...pm, role: "project_manager" });

    // QS creates BOQ and sends cost report (qs DB / pm DB costReports)
    await portalStore.applyPortalAction("quantity_surveyor", {
      type: "create-boq",
      surveyorId: qs.id,
      input: { projectId: project.id, code: "WF-BOQ", description: "Workflow BOQ", unit: "m2", estimatedQty: 10, actualQty: 10, unitRate: 50 },
      stamp: stamp(15, qs),
    } as any, { ...qs, role: "quantity_surveyor", projectId: project.id });
    await portalStore.applyPortalAction("quantity_surveyor", {
      type: "send-cost-report",
      surveyorId: qs.id,
      stamp: stamp(16, qs),
    } as any, { ...qs, role: "quantity_surveyor", projectId: project.id });

    const final = await portalStore.readState();
    expect(final.projects.find((p: any) => p.id === project.id)?.description).toContain("Updated cross-db workflow");
    expect(final.tasks.some((t: any) => t.title === "Workflow Task")).toBe(true);
    expect(final.reports.find((r: any) => r.id === report.id)?.status).toBe("approved");
    expect(final.boq.some((b: any) => b.code === "WF-BOQ")).toBe(true);
    expect(final.costReports.some((c: any) => c.projectId === project.id && c.surveyorId === qs.id)).toBe(true);

    const rt = await mongo.getMongoRuntime();
    expect(await rt!.dbs.administrator.collection("projects").findOne({ id: project.id })).toBeTruthy();
    expect(await rt!.dbs.project_manager.collection("tasks").findOne({ title: "Workflow Task" })).toBeTruthy();
    expect(await rt!.dbs.site_engineer.collection("reports").findOne({ id: report.id })).toMatchObject({ status: "approved" });
    expect(await rt!.dbs.quantity_surveyor.collection("boq").findOne({ code: "WF-BOQ" })).toBeTruthy();
  }, 180000);

  it("manages credentials in admin DB and invalidates sessions across all portal DBs", async () => {
    const { portalStore, auth, mongo } = await loadModules();
    const state = await portalStore.readState();
    const pm = state.users.find((u: any) => u.role === "project_manager");
    const se = state.users.find((u: any) => u.role === "site_engineer");
    expect(pm).toBeTruthy();
    expect(se).toBeTruthy();
    if (!pm || !se) throw new Error("missing seed users");

    await auth.setUserPassword(pm.id, pm.email, "Password123!");
    const cred = await (await mongo.getMongoRuntime())!.dbs.administrator.collection("credentials").findOne({ userId: pm.id });
    expect(cred).toBeTruthy();
    if (!cred) throw new Error("missing credential");
    expect((cred as any).email).toBe(pm.email.toLowerCase());

    // Create sessions in multiple portal DBs for the same user
    const pmSession = await auth.createSessionForUser("project_manager", pm);
    const sePortalSession = await auth.createSessionForUser("site_engineer", { ...pm, role: "site_engineer" } as any);
    expect(pmSession.token).toBeTruthy();

    const rt = await mongo.getMongoRuntime();
    expect(await rt!.dbs.project_manager.collection("sessions").countDocuments({ userId: pm.id })).toBe(1);
    expect(await rt!.dbs.site_engineer.collection("sessions").countDocuments({ userId: pm.id })).toBe(1);

    await auth.destroySessionsForUser(pm.id);
    expect(await rt!.dbs.project_manager.collection("sessions").countDocuments({ userId: pm.id })).toBe(0);
    expect(await rt!.dbs.site_engineer.collection("sessions").countDocuments({ userId: pm.id })).toBe(0);

    // setUserPassword should also invalidate sessions
    const pmSession2 = await auth.createSessionForUser("project_manager", pm);
    expect(await rt!.dbs.project_manager.collection("sessions").countDocuments({ userId: pm.id })).toBe(1);
    await auth.setUserPassword(pm.id, pm.email, "NewPassword123!");
    expect(await rt!.dbs.project_manager.collection("sessions").countDocuments({ userId: pm.id })).toBe(0);
    expect(pmSession2.token).toBeTruthy();

    // removeUserCredential should remove credential and invalidate sessions
    const pmSession3 = await auth.createSessionForUser("project_manager", pm);
    expect(await rt!.dbs.project_manager.collection("sessions").countDocuments({ userId: pm.id })).toBe(1);
    await auth.removeUserCredential(pm.id);
    expect(await rt!.dbs.administrator.collection("credentials").countDocuments({ userId: pm.id })).toBe(0);
    expect(await rt!.dbs.project_manager.collection("sessions").countDocuments({ userId: pm.id })).toBe(0);
    expect(pmSession3.token).toBeTruthy();
    void sePortalSession;
  }, 180000);

  it("stores notifications in recipient portal databases", async () => {
    const { portalStore, mongo } = await loadModules();
    const { admin, pm, se, project } = await seedBase(portalStore);

    // SE submits report - should generate notifications for PM/admin depending on reducer rules
    await portalStore.applyPortalAction("site_engineer", {
      type: "submit-report",
      input: { projectId: project.id, engineerId: se.id, periodStart: "2026-03-01", periodEnd: "2026-03-07", progress: 30, summary: "Notification routing summary text", issues: "", photos: [] },
      photos: [],
      stamp: stamp(30, se),
    } as any, { ...se, role: "site_engineer", projectId: project.id });

    const final = await portalStore.readState();
    const rt = await mongo.getMongoRuntime();
    const adminNotifs = await rt!.dbs.administrator.collection("notifications").find({}).toArray();
    const pmNotifs = await rt!.dbs.project_manager.collection("notifications").find({}).toArray();
    const seNotifs = await rt!.dbs.site_engineer.collection("notifications").find({}).toArray();
    const qsNotifs = await rt!.dbs.quantity_surveyor.collection("notifications").find({}).toArray();

    // All assembled notifications must exist in some portal notification collection
    const dbNotifIds = new Set([...adminNotifs, ...pmNotifs, ...seNotifs, ...qsNotifs].map((n: any) => n.id));
    for (const n of final.notifications) {
      expect(dbNotifIds.has(n.id)).toBe(true);
    }

    // Notifications for a PM recipient should be stored in PM DB
    const pmRecipientNotifs = final.notifications.filter((n: any) => n.recipientId === pm?.id);
    for (const n of pmRecipientNotifs) {
      expect(pmNotifs.some((d: any) => d.id === n.id)).toBe(true);
    }
    // Notifications for admin recipient should be in admin DB
    const adminRecipientNotifs = final.notifications.filter((n: any) => n.recipientId === admin?.id);
    for (const n of adminRecipientNotifs) {
      expect(adminNotifs.some((d: any) => d.id === n.id)).toBe(true);
    }
  }, 180000);

  it("rolls back user creation consistently across state and credential stores", async () => {
    const { portalStore, auth, mongo } = await loadModules();
    const { admin } = await seedBase(portalStore);

    const input = {
      firstName: "Rollback", lastName: "User", email: "rollback@x.com", phone: "0712345678",
      role: "site_engineer", projectId: "unassigned", status: "active",
    };
    const st = stamp(40, admin);
    await portalStore.applyPortalAction("administrator", { type: "create-user", input, stamp: st } as any, { ...admin, role: "administrator" });

    let state = await portalStore.readState();
    expect(state.users.some((u: any) => u.email === "rollback@x.com")).toBe(true);

    // Simulate credential persistence failure compensation: remove credential, rollback user
    await auth.removeUserCredential(st.id).catch(() => {});
    await portalStore.applyPortalAction("administrator", { type: "delete-user", id: st.id, stamp: stamp(41, admin) } as any, { ...admin, role: "administrator" });

    state = await portalStore.readState();
    expect(state.users.some((u: any) => u.id === st.id)).toBe(false);
    const rt = await mongo.getMongoRuntime();
    expect(await rt!.dbs.administrator.collection("users").countDocuments({ id: st.id })).toBe(0);
    expect(await rt!.dbs.administrator.collection("credentials").countDocuments({ userId: st.id })).toBe(0);
  }, 180000);
});
