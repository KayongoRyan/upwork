import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(h.applyPortalAction.mock.calls[0][0]).toBe("administrator");
    expect(h.applyPortalAction.mock.calls[0][1].type).toBe("create-project");
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
    expect(h.applyPortalAction.mock.calls[0][1].type).toBe("open-report-review");
  });

  it("blocks PM from deciding report in other project", async () => {
    h.currentSession.value = { ...pmSession, id: "pm-other" };
    const res = await request(app()).post("/api/v1/cpmis/business/site-reports/r1/decide").send({ decision: "approved", note: "ok" });
    expect(res.status).toBe(403);
  });
});
