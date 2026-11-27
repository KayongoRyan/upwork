/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => {}, delete: () => {} })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
}));
vi.mock("next/server", () => ({
  NextResponse: class { cookies = { set: () => {} }; static json() { return new Response(); } },
}));

function resetGlobals() {
  const g = globalThis as any;
  delete g.__cpmisMongoRuntime;
  delete g.__cpmisMongoConnecting;
  delete g.__cpmisMongoRetryAt;
  delete g.__cpmisMongoWarned;
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

async function loadApp() {
  vi.resetModules();
  resetGlobals();
  const { requestContext } = await import("../../backend/src/middleware/requestContext.js");
  const { cpmisRouter } = await import("../../backend/src/routes/cpmis.js");
  const { businessRouter } = await import("../../backend/src/routes/business.js");
  const { getMongoRuntime } = await import("../../lib/server/mongo");
  const auth = await import("../../lib/server/auth");
  const portalStore = await import("../../lib/server/portal-store");

  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use("/api/v1/cpmis", cpmisRouter);
  app.use("/api/v1/cpmis/business", businessRouter);
  return { app, getMongoRuntime, auth, portalStore };
}

beforeEach(async () => {
  await closeRuntimeFromGlobal();
  resetGlobals();
  vi.resetModules();
  process.env.MONGODB_URI = "mongodb://127.0.0.1:1"; // unreachable; dev/test falls back to in-memory where supported
  (process.env as any).NODE_ENV = "test";
  process.env.MONGODB_DB_ADMIN = "test_vertexa_admin";
  process.env.MONGODB_DB_PM = "test_vertexa_pm";
  process.env.MONGODB_DB_SE = "test_vertexa_se";
  process.env.MONGODB_DB_QS = "test_vertexa_qs";
  delete process.env.OTP_DEMO_FALLBACK;
}, 180000);

describe("real session cookie auth", () => {
  it("signs in, sets session cookie, and authenticates protected requests", async () => {
    const { app, portalStore, auth } = await loadApp();
    const state = await portalStore.readState();
    const pm = state.users.find(
      (u: any) =>
        u.role === "project_manager" &&
        u.status === "active" &&
        state.projects.some((p: any) => p.managerId === u.id),
    );
    expect(pm).toBeTruthy();
    if (!pm) throw new Error("missing pm");
    const managedProject = state.projects.find((p: any) => p.managerId === pm.id);
    expect(managedProject).toBeTruthy();
    if (!managedProject) throw new Error("missing managed project");
    const assignee = state.users.find(
      (u: any) =>
        u.role === "site_engineer" &&
        u.status === "active" &&
        u.projectId === managedProject.id,
    );
    expect(assignee).toBeTruthy();
    if (!assignee) throw new Error("missing project site engineer");

    // Seed known password for the real credential record.
    await auth.setUserPassword(pm.id, pm.email, "Password123!");

    const agent = request.agent(app);
    const signIn = await agent
      .post("/api/v1/cpmis/auth/sign-in")
      .set("Origin", "http://localhost:3030")
      .set("Host", "localhost:3030")
      .send({ portal: "project_manager", email: pm.email, password: "Password123!" });

    expect(signIn.status).toBe(200);
    expect(signIn.body.ok).toBe(true);
    expect(signIn.body.redirectTo).toBe("/pm");
    const setCookie = signIn.headers["set-cookie"];
    expect(setCookie).toBeTruthy();
    const cookieHeader = ([] as string[]).concat(setCookie ?? []).join("; ");
    expect(cookieHeader).toContain("cpmis_session_pm=");

    const sessionRes = await agent
      .get("/api/v1/cpmis/auth/session/project_manager")
      .set("Origin", "http://localhost:3030")
      .set("Host", "localhost:3030");
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.ok).toBe(true);
    expect(sessionRes.body.user.email.toLowerCase()).toBe(pm.email.toLowerCase());
    expect(sessionRes.body.user.role).toBe("project_manager");

    // Protected business endpoint should accept the real session cookie.
    const projectsRes = await agent
      .get("/api/v1/cpmis/business/projects")
      .set("Origin", "http://localhost:3030")
      .set("Host", "localhost:3030");
    expect(projectsRes.status).toBe(200);
    expect(projectsRes.body.ok).toBe(true);
    expect(Array.isArray(projectsRes.body.items)).toBe(true);

    // CSRF-protected mutation should succeed with token from session.
    const csrfToken = sessionRes.body.user.csrfToken;
    const createTask = await agent
      .post("/api/v1/cpmis/business/tasks")
      .set("Origin", "http://localhost:3030")
      .set("Host", "localhost:3030")
      .set("x-csrf-token", csrfToken)
      .send({
        projectId: managedProject.id,
        title: "Cookie Auth Task",
        assignee: `${assignee.firstName} ${assignee.lastName}`,
        dueDate: "2026-12-01",
        priority: "medium",
        status: "todo",
      });
    expect([200, 201]).toContain(createTask.status);
    expect(createTask.body.ok).toBe(true);
  }, 180000);

  it("rejects protected request without session cookie and rejects bad CSRF", async () => {
    const { app, portalStore, auth } = await loadApp();
    const state = await portalStore.readState();
    const pm = state.users.find((u: any) => u.role === "project_manager");
    if (!pm) throw new Error("missing pm");
    await auth.setUserPassword(pm.id, pm.email, "Password123!");

    const noCookie = await request(app).get("/api/v1/cpmis/auth/session/project_manager");
    expect([401, 403]).toContain(noCookie.status);

    const agent = request.agent(app);
    const signIn = await agent
      .post("/api/v1/cpmis/auth/sign-in")
      .set("Origin", "http://localhost:3030")
      .set("Host", "localhost:3030")
      .send({ portal: "project_manager", email: pm.email, password: "Password123!" });
    expect(signIn.status).toBe(200);

    const badCsrf = await agent
      .post("/api/v1/cpmis/business/tasks")
      .set("Origin", "http://localhost:3030")
      .set("Host", "localhost:3030")
      .set("x-csrf-token", "bad-token")
      .send({
        projectId: state.projects.find((p: any) => p.managerId === pm.id)?.id ?? state.projects[0].id,
        title: "Should Fail",
        assignee: "SE One",
        dueDate: "2026-12-01",
        priority: "medium",
        status: "todo",
      });
    expect(badCsrf.status).toBe(403);
  }, 180000);
});
