/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer;

function resetGlobals() {
  const g = globalThis as any;
  delete g.__cpmisMongoRuntime;
  delete g.__cpmisMongoConnecting;
  delete g.__cpmisMongoRetryAt;
  delete g.__cpmisMongoWarned;
  delete g.__cpmisPortalStore;
  delete g.__cpmisAuth;
}

async function closeRuntimeFromGlobal() {
  const g = globalThis as any;
  try { await g.__cpmisMongoRuntime?.client?.close?.(); } catch {}
}

async function loadStore() {
  vi.resetModules();
  resetGlobals();
  const portalStore = await import("../../lib/server/portal-store");
  return { portalStore };
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

describe("database concurrency", () => {
  it("serializes concurrent portal actions without losing updates", async () => {
    const { portalStore } = await loadStore();
    const state = await portalStore.readState();
    const project = state.projects[0];
    const pm = state.users.find((u: any) => u.role === "project_manager");

    const stamp = (n: number) => ({
      id: `act-concurrent-${n}`,
      at: new Date(Date.now() + n).toISOString(),
      notificationId: `ntf-concurrent-${n}`,
      actorId: pm?.id ?? "admin",
      actorName: "Test PM",
      actorRole: "project_manager" as const,
    });

    const actions = Array.from({ length: 6 }, (_, i) => ({
      type: "create-task" as const,
      input: {
        title: `Concurrent Task ${i}`,
        projectId: project.id,
        assignee: "SE One",
        dueDate: "2026-12-01",
        priority: "medium" as const,
        status: "todo" as const,
      },
      stamp: stamp(i),
    }));

    await Promise.all(actions.map((a) => portalStore.applyAction(a as any)));
    const final = await portalStore.readState();
    for (let i = 0; i < 6; i++) {
      expect(final.tasks.some((t: any) => t.title === `Concurrent Task ${i}`)).toBe(true);
    }
  }, 180000);

  it("keeps project progress updates consistent under concurrent writes", async () => {
    const { portalStore } = await loadStore();
    const state = await portalStore.readState();
    const project = state.projects.find((p: any) => p.status !== "completed") ?? state.projects[0];
    const pm = state.users.find((u: any) => u.role === "project_manager" && u.id === project.managerId) ?? state.users.find((u: any) => u.role === "project_manager");

    const stamp = (n: number) => ({
      id: `act-progress-${n}`,
      at: new Date(Date.now() + n).toISOString(),
      notificationId: `ntf-progress-${n}`,
      actorId: pm?.id,
      actorName: "Test PM",
      actorRole: "project_manager" as const,
    });

    await Promise.all([
      portalStore.applyAction({ type: "set-progress", id: project.id, progress: 10, note: "a", stamp: stamp(1) } as any),
      portalStore.applyAction({ type: "set-progress", id: project.id, progress: 20, note: "b", stamp: stamp(2) } as any),
      portalStore.applyAction({ type: "set-progress", id: project.id, progress: 30, note: "c", stamp: stamp(3) } as any),
    ]);

    const final = await portalStore.readState();
    const updated = final.projects.find((p: any) => p.id === project.id);
    expect([10, 20, 30]).toContain(updated?.progress);
    const marks = (final.progressMarks ?? []).filter((m: any) => m.projectId === project.id);
    expect(marks.length).toBeGreaterThanOrEqual(3);
  }, 180000);

  it("enforces project authorization during concurrent authorized/unauthorized actions", async () => {
    const { portalStore } = await loadStore();
    const state = await portalStore.readState();
    const project = state.projects[0];
    const pm = state.users.find((u: any) => u.role === "project_manager" && u.id === project.managerId) ?? state.users.find((u: any) => u.role === "project_manager");
    const otherPm = { id: "pm-other", email: "x@x.com", firstName: "Other", lastName: "PM", role: "project_manager", status: "active", projectId: null } as any;

    const stamp = (id: string) => ({ id, at: new Date().toISOString(), notificationId: `ntf-${id}`, actorId: pm?.id, actorName: "PM", actorRole: "project_manager" as const });

    const [ok, bad] = await Promise.allSettled([
      portalStore.applyPortalAction("project_manager", { type: "set-progress", id: project.id, progress: 15, note: "ok", stamp: stamp("act-ok") } as any, { ...pm, role: "project_manager" } as any),
      portalStore.applyPortalAction("project_manager", { type: "set-progress", id: project.id, progress: 99, note: "bad", stamp: stamp("act-bad") } as any, otherPm),
    ]);

    expect(ok.status).toBe("fulfilled");
    expect(bad.status).toBe("rejected");

    const final = await portalStore.readState();
    const updated = final.projects.find((p: any) => p.id === project.id);
    expect(updated?.progress).toBe(15);
  }, 180000);
});
