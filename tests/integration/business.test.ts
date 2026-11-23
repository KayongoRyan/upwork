/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setUserPassword, removeUserCredential } from "../../backend/src/lib/auth-bridge";

const h = vi.hoisted(() => {
  const mockState = {
    users: [{ id: "u1", firstName: "A", lastName: "Admin", email: "a@x.com", role: "administrator", status: "active", projectId: null }],
    employees: [],
    projects: [{ id: "p1", name: "P1", code: "P1", managerId: "pm1", status: "active", progress: 0, budget: 1000, spent: 0, startDate: "2026-01-01", expectedEndDate: "2026-12-31", client: "C", location: "L", description: "Desc long enough" }],
    tasks: [{ id: "t1", projectId: "p1", title: "Task", assignee: "SE One", dueDate: "2026-12-01", priority: "medium", status: "todo", progress: 0 }],
    reports: [{ id: "r1", projectId: "p1", engineerId: "se1", status: "submitted", periodStart: "2026-01-01", periodEnd: "2026-01-01", progress: 10, summary: "Summary long enough", issues: "", photos: [] }],
    boq: [], costReports: [], documents: [], notifications: [], activityLogs: [], workComments: [], progressMarks: [], calendarEvents: [], inquiries: [], settings: {},
  };
  return {
    mockState,
    currentSession: { value: null as any },
    csrfOk: { value: true },
    applyPortalAction: vi.fn(async () => mockState),
    readState: vi.fn(async () => mockState),
  };
});

vi.mock("@/lib/server/portal-store", () => ({
  applyPortalAction: h.applyPortalAction,
}));
vi.mock("@/lib/server/memory", () => ({
  readState: h.readState,
}));
vi.mock("@/lib/server/mongo", () => ({
  PersistenceError: class PersistenceError extends Error { name = "PersistenceError"; },
  getMongoRuntime: vi.fn(async () => null),
  requireCollectionInProduction: <T,>(v: T | null) => v,
}));
vi.mock("../../backend/src/lib/session", () => ({
  requireAnySession: vi.fn(async (_req: any, res: any) => {
    if (!h.currentSession.value) { res.status(401).json({ ok: false, error: "auth-required" }); return null; }
    const s = h.currentSession.value;
    const portal = s.role === "administrator" ? "administrator" : s.role === "project_manager" ? "project_manager" : s.role === "site_engineer" ? "site_engineer" : "quantity_surveyor";
    return { session: s, portal };
  }),
  requireSession: vi.fn(async (_req: any, res: any, portal: string) => {
    if (!h.currentSession.value) { res.status(401).json({ ok: false, error: "auth-required" }); return null; }
    const s = h.currentSession.value;
    const actual = s.role === "administrator" ? "administrator" : s.role === "project_manager" ? "project_manager" : s.role === "site_engineer" ? "site_engineer" : "quantity_surveyor";
    if (actual !== portal) { res.status(403).json({ ok: false, error: "forbidden" }); return null; }
    return { session: s, portal: actual };
  }),
}));
vi.mock("../../backend/src/lib/auth-bridge", () => ({
  verifyCsrfToken: vi.fn(() => (h.csrfOk.value ? null : { status: 403, body: { ok: false, error: "csrf-invalid" } })),
  setUserPassword: vi.fn(async () => {}),
  removeUserCredential: vi.fn(async () => {}),
  destroySessionsForUser: vi.fn(async () => {}),
}));

import { businessRouter } from "../../backend/src/routes/business";

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => { req.requestId = "req-test"; next(); });
  a.use("/api/v1/cpmis/business", businessRouter);
  return a;
}

const adminSession = { id: "admin1", email: "admin@x.com", firstName: "Admin", lastName: "User", role: "administrator", status: "active", projectId: null };
const pmSession = { id: "pm1", email: "pm@x.com", firstName: "PM", lastName: "User", role: "project_manager", status: "active", projectId: null };
const seSession = { id: "se1", email: "se@x.com", firstName: "SE", lastName: "User", role: "site_engineer", status: "active", projectId: "p1" };

describe("business API", () => {
  beforeEach(() => {
    h.currentSession.value = adminSession;
    h.csrfOk.value = true;
    h.applyPortalAction.mockClear();
    h.readState.mockClear();
    h.readState.mockResolvedValue(h.mockState);
    h.applyPortalAction.mockResolvedValue(h.mockState);
    (setUserPassword as any).mockClear();
    (removeUserCredential as any).mockClear();
    (setUserPassword as any).mockResolvedValue(undefined);
    (removeUserCredential as any).mockResolvedValue(undefined);
  });

  it("requires admin session for listing users", async () => {
    h.currentSession.value = pmSession;
    const res = await request(app()).get("/api/v1/cpmis/business/users");
    expect(res.status).toBe(403);
  });

  it("rejects invalid user payload with validation error", async () => {
    const res = await request(app()).post("/api/v1/cpmis/business/users").send({ firstName: "A" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation-failed");
  });

  it("rejects mutation without CSRF", async () => {
    h.csrfOk.value = false;
    const res = await request(app()).post("/api/v1/cpmis/business/projects").send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("csrf-invalid");
  });

  it("creates project with valid admin payload", async () => {
    const res = await request(app()).post("/api/v1/cpmis/business/projects").send({
      name: "New Project", code: "NP-1", description: "A long enough description", client: "Client", location: "Kigali",
      managerId: "pm1", startDate: "2026-01-01", expectedEndDate: "2026-12-31", budget: 1000, spent: 0, progress: 0, status: "active",
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(h.applyPortalAction).toHaveBeenCalled();
    expect((h.applyPortalAction as any).mock.calls[0][0]).toBe("administrator");
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("create-project");
  });

  it("forbids SE from creating tasks outside project scope", async () => {
    h.currentSession.value = seSession;
    const res = await request(app()).post("/api/v1/cpmis/business/tasks").send({
      title: "Bad Task", projectId: "p-other", assignee: "SE One", dueDate: "2026-12-01", priority: "medium", status: "todo",
    });
    expect(res.status).toBe(403);
  });

  it("allows PM to open report review for managed project", async () => {
    h.currentSession.value = pmSession;
    const res = await request(app()).post("/api/v1/cpmis/business/site-reports/r1/open").send({});
    expect(res.status).toBe(200);
    expect(h.applyPortalAction).toHaveBeenCalled();
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("open-report-review");
  });

  it("blocks PM from deciding report in other project", async () => {
    h.currentSession.value = { ...pmSession, id: "pm-other" };
    const res = await request(app()).post("/api/v1/cpmis/business/site-reports/r1/decide").send({ decision: "approved", note: "ok" });
    expect(res.status).toBe(403);
  });

  it("lists projects for authenticated user with project scope", async () => {
    h.currentSession.value = pmSession;
    const res = await request(app()).get("/api/v1/cpmis/business/projects");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe("p1");
  });

  it("scopes project listing for site engineer to assigned project", async () => {
    h.currentSession.value = seSession;
    const res = await request(app()).get("/api/v1/cpmis/business/projects");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe("p1");
  });

  it("rejects project update from non-admin", async () => {
    h.currentSession.value = pmSession;
    const res = await request(app()).patch("/api/v1/cpmis/business/projects/p1").send({ name: "Updated" });
    expect(res.status).toBe(403);
  });

  it("rejects invalid project update payload", async () => {
    const res = await request(app()).patch("/api/v1/cpmis/business/projects/p1").send({ budget: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation-failed");
  });

  it("returns 404 for updating unknown project", async () => {
    const res = await request(app()).patch("/api/v1/cpmis/business/projects/missing").send({ name: "Updated Name" });
    expect(res.status).toBe(404);
  });

  it("allows admin to update project via business API", async () => {
    const res = await request(app()).patch("/api/v1/cpmis/business/projects/p1").send({ name: "Updated Name" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(h.applyPortalAction).toHaveBeenCalled();
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("update-project");
    expect((h.applyPortalAction as any).mock.calls[0][1].id).toBe("p1");
  });

  it("rejects project deletion from non-admin", async () => {
    h.currentSession.value = pmSession;
    const res = await request(app()).delete("/api/v1/cpmis/business/projects/p1");
    expect(res.status).toBe(403);
  });

  it("returns forbidden when delete action is not authorized by portal rules", async () => {
    h.applyPortalAction.mockRejectedValueOnce(Object.assign(new Error("not allowed"), { name: "PortalActionError" }));
    const res = await request(app()).delete("/api/v1/cpmis/business/projects/missing");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("allows admin to delete project via business API", async () => {
    const res = await request(app()).delete("/api/v1/cpmis/business/projects/p1");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(h.applyPortalAction).toHaveBeenCalled();
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("delete-project");
    expect((h.applyPortalAction as any).mock.calls[0][1].id).toBe("p1");
  });

  it("rejects user listing for non-admin", async () => {
    h.currentSession.value = pmSession;
    const res = await request(app()).get("/api/v1/cpmis/business/users");
    expect(res.status).toBe(403);
  });

  it("rejects user creation with invalid payload", async () => {
    const res = await request(app()).post("/api/v1/cpmis/business/users").send({ email: "bad" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation-failed");
  });

  it("rejects duplicate user email on create", async () => {
    const res = await request(app()).post("/api/v1/cpmis/business/users").send({
      firstName: "Alex", lastName: "Brown", email: "a@x.com", phone: "0712345678",
      role: "site_engineer", projectId: "p1", status: "active", password: "Password123!",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");
  });

  it("creates user via business API", async () => {
    const res = await request(app()).post("/api/v1/cpmis/business/users").send({
      firstName: "New", lastName: "User", email: "new@x.com", phone: "0712345678",
      role: "site_engineer", projectId: "p1", status: "active", password: "Password123!",
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(h.applyPortalAction).toHaveBeenCalled();
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("create-user");
  });

  it("rejects user update from non-admin", async () => {
    h.currentSession.value = pmSession;
    const res = await request(app()).patch("/api/v1/cpmis/business/users/u1").send({ firstName: "X" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for updating unknown user", async () => {
    const res = await request(app()).patch("/api/v1/cpmis/business/users/missing").send({ firstName: "Alex" });
    expect(res.status).toBe(404);
  });

  it("rejects invalid user status payload", async () => {
    const res = await request(app()).patch("/api/v1/cpmis/business/users/u1/status").send({ status: "bogus" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation-failed");
  });

  it("updates user status via business API", async () => {
    const res = await request(app()).patch("/api/v1/cpmis/business/users/u1/status").send({ status: "inactive" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(h.applyPortalAction).toHaveBeenCalled();
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("set-user-status");
  });

  it("rejects user deletion from non-admin", async () => {
    h.currentSession.value = pmSession;
    const res = await request(app()).delete("/api/v1/cpmis/business/users/u1");
    expect(res.status).toBe(403);
  });

  it("deletes user via business API", async () => {
    const res = await request(app()).delete("/api/v1/cpmis/business/users/u1");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(h.applyPortalAction).toHaveBeenCalled();
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("delete-user");
  });

  const validEmployee = {
    employeeCode: "EMP-001",
    firstName: "Jane",
    lastName: "Doe",
    position: "Engineer",
    department: "Engineering",
    phone: "0712345678",
    email: "jane@example.com",
    projectId: "p1",
    status: "active",
    hiredAt: "2026-01-10",
  };

  it("rejects employee listing for non-admin", async () => {
    h.currentSession.value = pmSession;
    const res = await request(app()).get("/api/v1/cpmis/business/employees");
    expect(res.status).toBe(403);
  });

  it("rejects employee registration with invalid payload", async () => {
    const res = await request(app()).post("/api/v1/cpmis/business/employees").send({ employeeCode: "E" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation-failed");
  });

  it("rejects duplicate employee code on create", async () => {
    (h.mockState.employees as any[]).push({ id: "e1", ...validEmployee });
    const res = await request(app()).post("/api/v1/cpmis/business/employees").send(validEmployee);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");
    h.mockState.employees = [];
  });

  it("registers employee via business API", async () => {
    const res = await request(app()).post("/api/v1/cpmis/business/employees").send(validEmployee);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(h.applyPortalAction).toHaveBeenCalled();
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("create-employee");
  });

  it("rejects employee update from non-admin", async () => {
    h.currentSession.value = pmSession;
    const res = await request(app()).patch("/api/v1/cpmis/business/employees/e1").send({ firstName: "Janet" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for updating unknown employee", async () => {
    const res = await request(app()).patch("/api/v1/cpmis/business/employees/missing").send({ firstName: "Janet" });
    expect(res.status).toBe(404);
  });

  it("updates employee via business API", async () => {
    (h.mockState.employees as any[]).push({ id: "e1", ...validEmployee });
    const res = await request(app()).patch("/api/v1/cpmis/business/employees/e1").send({ firstName: "Janet" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(h.applyPortalAction).toHaveBeenCalled();
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("update-employee");
    h.mockState.employees = [];
  });

  it("deletes employee via business API", async () => {
    const res = await request(app()).delete("/api/v1/cpmis/business/employees/e1");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(h.applyPortalAction).toHaveBeenCalled();
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("delete-employee");
  });

  it("rolls back user creation when credential persistence fails", async () => {
    (setUserPassword as any).mockRejectedValueOnce(new Error("db down"));
    const res = await request(app()).post("/api/v1/cpmis/business/users").send({
      firstName: "New", lastName: "User", email: "new2@x.com", phone: "0712345678",
      role: "site_engineer", projectId: "p1", status: "active", password: "Password123!",
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("persistence-failed");
    expect(h.applyPortalAction).toHaveBeenCalled();
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("create-user");
    expect((h.applyPortalAction as any).mock.calls.some((c: any[]) => c[1]?.type === "delete-user")).toBe(true);
  });

  it("replays duplicate create-user request with same idempotency key", async () => {
    const payload = {
      firstName: "Idem", lastName: "User", email: "idem@x.com", phone: "0712345678",
      role: "site_engineer", projectId: "p1", status: "active", password: "Password123!",
    };
    const first = await request(app()).post("/api/v1/cpmis/business/users").set("Idempotency-Key", "k-user-1").send(payload);
    expect(first.status).toBe(201);
    const callsAfterFirst = h.applyPortalAction.mock.calls.length;
    const second = await request(app()).post("/api/v1/cpmis/business/users").set("Idempotency-Key", "k-user-1").send(payload);
    expect(second.status).toBe(201);
    expect(second.headers["idempotency-replayed"]).toBe("true");
    expect(h.applyPortalAction.mock.calls.length).toBe(callsAfterFirst);
  });

  it("rejects duplicate email on user patch", async () => {
    h.mockState.users = [
      { id: "u1", firstName: "A", lastName: "One", email: "one@x.com", role: "site_engineer", status: "active", projectId: "p1" },
      { id: "u2", firstName: "B", lastName: "Two", email: "two@x.com", role: "site_engineer", status: "active", projectId: "p1" },
    ] as any;
    const res = await request(app()).patch("/api/v1/cpmis/business/users/u1").send({ email: "two@x.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");
    expect(h.applyPortalAction).not.toHaveBeenCalled();
  });

  it("rejects duplicate employeeCode on employee patch", async () => {
    h.mockState.employees = [
      { id: "e1", employeeCode: "E001", firstName: "A", lastName: "One", discipline: "Civil", projectId: "p1", status: "active" },
      { id: "e2", employeeCode: "E002", firstName: "B", lastName: "Two", discipline: "Civil", projectId: "p1", status: "active" },
    ] as any;
    const res = await request(app()).patch("/api/v1/cpmis/business/employees/e1").send({ employeeCode: "e002" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");
    expect(h.applyPortalAction).not.toHaveBeenCalled();
  });

  it("maps DB duplicate-key persistence errors to 409 conflict", async () => {
    h.applyPortalAction.mockRejectedValueOnce(Object.assign(new Error("E11000 duplicate key"), { name: "PersistenceError", detail: { code: 11000 } }));
    h.mockState.employees = [{ id: "e1", employeeCode: "E001", firstName: "A", lastName: "One", discipline: "Civil", projectId: "p1", status: "active" }] as any;
    const res = await request(app()).patch("/api/v1/cpmis/business/employees/e1").send({ firstName: "Alice" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");
  });
});
