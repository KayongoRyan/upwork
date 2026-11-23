/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    users: [
      { id: "admin1", firstName: "A", lastName: "Admin", email: "a@x.com", role: "administrator", status: "active", projectId: null },
      { id: "pm1", firstName: "P", lastName: "M", email: "pm@x.com", role: "project_manager", status: "active", projectId: null },
      { id: "se1", firstName: "S", lastName: "E", email: "se@x.com", role: "site_engineer", status: "active", projectId: "p1" },
      { id: "qs1", firstName: "Q", lastName: "S", email: "qs@x.com", role: "quantity_surveyor", status: "active", projectId: "p1" },
    ],
    employees: [],
    projects: [
      { id: "p1", name: "P1", code: "P1", managerId: "pm1", status: "active", progress: 0, budget: 1000, spent: 0, startDate: "2026-01-01", expectedEndDate: "2026-12-31", client: "C", location: "L", description: "Desc long enough" },
      { id: "p2", name: "P2", code: "P2", managerId: "pm2", status: "active", progress: 0, budget: 1000, spent: 0, startDate: "2026-01-01", expectedEndDate: "2026-12-31", client: "C", location: "L", description: "Desc long enough" },
    ],
    tasks: [{ id: "t1", projectId: "p1", title: "Task", assignee: "SE One", dueDate: "2026-12-01", priority: "medium", status: "todo", progress: 0 }],
    reports: [{ id: "r1", projectId: "p1", engineerId: "se1", status: "submitted", periodStart: "2026-01-01", periodEnd: "2026-01-01", progress: 10, summary: "Summary long enough", issues: "", photos: [] }],
    boq: [{ id: "b1", projectId: "p1", code: "B-1", description: "Concrete", unit: "m3", estimatedQty: 10, actualQty: 8, unitRate: 100 }],
    costReports: [{ id: "cr1", projectId: "p1", surveyorId: "qs1", status: "pending", lines: [], submittedAt: null, submittedBy: null }],
    documents: [], notifications: [], activityLogs: [], workComments: [], progressMarks: [], calendarEvents: [], inquiries: [], settings: {},
  };
  return {
    state,
    currentSession: { value: null as any },
    csrfOk: { value: true },
    applyPortalAction: vi.fn(async () => state),
    readState: vi.fn(async () => state),
  };
});

vi.mock("@/lib/server/portal-store", () => ({ applyPortalAction: h.applyPortalAction }));
vi.mock("@/lib/server/memory", () => ({ readState: h.readState }));
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

const admin = { id: "admin1", email: "a@x.com", firstName: "A", lastName: "Admin", role: "administrator", status: "active", projectId: null };
const pm = { id: "pm1", email: "pm@x.com", firstName: "P", lastName: "M", role: "project_manager", status: "active", projectId: null };
const pmOther = { id: "pm2", email: "pm2@x.com", firstName: "P", lastName: "M2", role: "project_manager", status: "active", projectId: null };
const se = { id: "se1", email: "se@x.com", firstName: "S", lastName: "E", role: "site_engineer", status: "active", projectId: "p1" };
const qs = { id: "qs1", email: "qs@x.com", firstName: "Q", lastName: "S", role: "quantity_surveyor", status: "active", projectId: "p1" };

describe("authorization and workflow", () => {
  beforeEach(() => {
    h.currentSession.value = admin;
    h.csrfOk.value = true;
    h.applyPortalAction.mockClear();
    h.readState.mockClear();
    h.readState.mockResolvedValue(h.state);
    h.applyPortalAction.mockResolvedValue(h.state);
  });

  it("blocks cross-project PM task scheduling", async () => {
    h.currentSession.value = pmOther;
    const res = await request(app()).post("/api/v1/cpmis/business/tasks/t1/schedule").send({
      projectId: "p1", assignee: "SE One", dueDate: "2026-12-01", priority: "high",
    });
    expect(res.status).toBe(403);
    expect(h.applyPortalAction).not.toHaveBeenCalled();
  });

  it("allows managed PM to schedule task in own project", async () => {
    h.currentSession.value = pm;
    const res = await request(app()).post("/api/v1/cpmis/business/tasks/t1/schedule").send({
      projectId: "p1", assignee: "SE One", dueDate: "2026-12-01", priority: "high",
    });
    expect(res.status).toBe(200);
    expect((h.applyPortalAction as any).mock.calls[0][1]).toMatchObject({ type: "schedule-task", id: "t1", projectId: "p1" });
  });

  it("enforces report approval workflow: PM opens then decides", async () => {
    h.currentSession.value = pm;
    const a = app();
    const open = await request(a).post("/api/v1/cpmis/business/site-reports/r1/open").send({});
    expect(open.status).toBe(200);
    expect((h.applyPortalAction as any).mock.calls[0][1].type).toBe("open-report-review");

    h.applyPortalAction.mockClear();
    const decide = await request(a).post("/api/v1/cpmis/business/site-reports/r1/decide").send({ decision: "approved", note: "Looks good" });
    expect(decide.status).toBe(200);
    expect((h.applyPortalAction as any).mock.calls[0][1]).toMatchObject({ type: "decide-report", id: "r1", decision: "approved" });
  });

  it("blocks SE from report approval actions", async () => {
    h.currentSession.value = se;
    const open = await request(app()).post("/api/v1/cpmis/business/site-reports/r1/open").send({});
    expect(open.status).toBe(403);
    const decide = await request(app()).post("/api/v1/cpmis/business/site-reports/r1/decide").send({ decision: "approved", note: "" });
    expect(decide.status).toBe(403);
  });

  it("allows SE to resubmit own project report with validation", async () => {
    h.currentSession.value = se;
    const bad = await request(app()).patch("/api/v1/cpmis/business/site-reports/r1/resubmit").send({ progress: 20, summary: "short" });
    expect(bad.status).toBe(400);

    const ok = await request(app()).patch("/api/v1/cpmis/business/site-reports/r1/resubmit").send({ progress: 20, summary: "Long enough summary for resubmission", issues: "" });
    expect(ok.status).toBe(200);
    expect((h.applyPortalAction as any).mock.calls.at(-1)?.[1].type).toBe("resubmit-report");
  });

  it("restricts BOQ mutations to quantity surveyor", async () => {
    h.currentSession.value = pm;
    const res = await request(app()).post("/api/v1/cpmis/business/boq").send({
      projectId: "p1", code: "B-2", description: "Steel", unit: "t", estimatedQty: 1, actualQty: 1, unitRate: 100,
    });
    expect(res.status).toBe(403);
  });

  it("allows QS to create BOQ line for assigned project", async () => {
    h.currentSession.value = qs;
    const res = await request(app()).post("/api/v1/cpmis/business/boq").send({
      projectId: "p1", code: "B-2", description: "Steel", unit: "t", estimatedQty: 1, actualQty: 1, unitRate: 100,
    });
    expect(res.status).toBe(201);
    expect((h.applyPortalAction as any).mock.calls[0][1]).toMatchObject({ type: "create-boq", surveyorId: "qs1" });
  });

  it("enforces cost report workflow permissions", async () => {
    h.currentSession.value = qs;
    const send = await request(app()).post("/api/v1/cpmis/business/cost-reports/send").send({});
    expect(send.status).toBe(201);
    expect((h.applyPortalAction as any).mock.calls.at(-1)?.[1].type).toBe("send-cost-report");

    h.currentSession.value = pm;
    h.applyPortalAction.mockClear();
    const submit = await request(app()).post("/api/v1/cpmis/business/cost-reports/submit").send({ projectId: "p1", surveyorId: "qs1" });
    expect(submit.status).toBe(201);
    expect((h.applyPortalAction as any).mock.calls[0][1]).toMatchObject({ type: "submit-cost-report", projectId: "p1", surveyorId: "qs1" });

    h.currentSession.value = se;
    const bad = await request(app()).post("/api/v1/cpmis/business/cost-reports/send").send({});
    expect(bad.status).toBe(403);
  });

  it("blocks PM cost revision for unmanaged project", async () => {
    h.currentSession.value = pmOther;
    const res = await request(app()).patch("/api/v1/cpmis/business/cost-reports/revise-bill").send({
      projectId: "p1", lines: [{ id: "b1", estimatedQty: 10, actualQty: 9, unitRate: 100 }],
    });
    expect(res.status).toBe(403);
  });
});
