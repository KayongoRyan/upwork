import { describe, expect, it } from "vitest";
import { adminReducer, type AdminAction, type Stamp } from "@/lib/data/reducer";
import { createSeedState } from "@/lib/mock-data/seed";
import type { AdminState } from "@/types";

function stamp(overrides: Partial<Stamp> = {}): Stamp {
  return {
    id: `act-${Math.random().toString(36).slice(2, 8)}`,
    at: "2026-11-25T12:00:00.000Z",
    actorId: "pm1",
    actorName: "PM One",
    actorRole: "project_manager",
    ...overrides,
  };
}

function baseState(): AdminState {
  const s = createSeedState();
  const pm = s.users.find((u) => u.role === "project_manager" && u.status === "active")!;
  const se = s.users.find((u) => u.role === "site_engineer" && u.status === "active")!;
  const qs = s.users.find((u) => u.role === "quantity_surveyor" && u.status === "active")!;
  const proj = s.projects.find((p) => p.managerId === pm.id) ?? s.projects[0];
  proj.managerId = pm.id;
  se.projectId = proj.id;
  qs.projectId = proj.id;
  if (!s.boq.some((b) => b.projectId === proj.id)) {
    s.boq.push({ id: "b-test", projectId: proj.id, code: "B1", description: "Test item", unit: "m2", estimatedQty: 10, actualQty: 5, unitRate: 100 } as any);
  }
  return s;
}

function findManagedProject(s: AdminState) {
  const pm = s.users.find((u) => u.role === "project_manager" && u.status === "active")!;
  const proj = s.projects.find((p) => p.managerId === pm.id)!;
  return { pm, proj };
}

describe("lifecycle transitions", () => {
  it("rejects report decision without rejection reason and records approval history", () => {
    const s = baseState();
    const { pm, proj } = findManagedProject(s);
    const se = s.users.find((u) => u.role === "site_engineer" && u.projectId === proj.id)!;
    const sub = adminReducer(s, {
      type: "submit-report",
      input: { projectId: proj.id, engineerId: se.id, periodStart: "2026-11-01", periodEnd: "2026-11-01", progress: 20, summary: "Work done summary long enough", issues: "", photos: [] },
      stamp: stamp({ actorId: se.id, actorName: "SE", actorRole: "site_engineer" }),
    } as AdminAction);
    const report = sub.reports.find((r) => r.engineerId === se.id && r.projectId === proj.id && r.status === "submitted")!;
    expect(report.reviewHistory?.[0]?.action).toBe("submitted");

    const opened = adminReducer(sub, { type: "open-report-review", id: report.id, stamp: stamp({ actorId: pm.id, actorName: "PM", actorRole: "project_manager" }) } as AdminAction);
    expect(opened.reports.find((r) => r.id === report.id)?.status).toBe("in_review");

    const decidedBad = adminReducer(opened, { type: "decide-report", id: report.id, decision: "rejected", note: "no", stamp: stamp({ actorId: pm.id, actorName: "PM", actorRole: "project_manager" }) } as AdminAction);
    expect(decidedBad).toBe(opened);

    const decided = adminReducer(opened, { type: "decide-report", id: report.id, decision: "rejected", note: "Missing evidence on site", stamp: stamp({ actorId: pm.id, actorName: "PM", actorRole: "project_manager" }) } as AdminAction);
    const r = decided.reports.find((x) => x.id === report.id)!;
    expect(r.status).toBe("rejected");
    expect(r.rejectionNote).toBe("Missing evidence on site");
    expect(r.reviewHistory?.some((h) => h.action === "rejected" && h.note === "Missing evidence on site")).toBe(true);
  });

  it("blocks duplicate engineer report submission for same period unless rejected", () => {
    const s = baseState();
    const { proj } = findManagedProject(s);
    const se = s.users.find((u) => u.role === "site_engineer" && u.projectId === proj.id)!;
    const input = { projectId: proj.id, engineerId: se.id, periodStart: "2026-11-02", periodEnd: "2026-11-02", progress: 30, summary: "Work done summary long enough", issues: "", photos: [] };
    const first = adminReducer(s, { type: "submit-report", input, stamp: stamp({ id: "a1", actorId: se.id, actorRole: "site_engineer" }) } as AdminAction);
    expect(first).not.toBe(s);
    const second = adminReducer(first, { type: "submit-report", input, stamp: stamp({ id: "a2", actorId: se.id, actorRole: "site_engineer" }) } as AdminAction);
    expect(second).toBe(first);
  });

  it("blocks engineer report submission when engineer is not assigned to project", () => {
    const s = baseState();
    const { proj } = findManagedProject(s);
    const se = s.users.find((u) => u.role === "site_engineer")!;
    se.projectId = "some-other-project";
    const next = adminReducer(s, {
      type: "submit-report",
      input: { projectId: proj.id, engineerId: se.id, periodStart: "2026-11-03", periodEnd: "2026-11-03", progress: 10, summary: "Work done summary long enough", issues: "", photos: [] },
      stamp: stamp({ actorId: se.id, actorRole: "site_engineer" }),
    } as AdminAction);
    expect(next).toBe(s);
  });

  it("enforces cost report review lifecycle with rejection reason and approval history", () => {
    const s = baseState();
    const { pm, proj } = findManagedProject(s);
    const qs = s.users.find((u) => u.role === "quantity_surveyor" && u.projectId === proj.id)!;
    const submitted = adminReducer(s, { type: "submit-cost-report", projectId: proj.id, surveyorId: qs.id, stamp: stamp({ actorId: pm.id, actorRole: "project_manager" }) } as AdminAction);
    const cr = (submitted.costReports ?? []).find((r) => r.projectId === proj.id && r.status === "submitted")!;
    expect(cr).toBeTruthy();
    expect(cr.reviewHistory?.[0]?.action).toBe("submitted");

    const opened = adminReducer(submitted, { type: "open-cost-report-review", id: cr.id, stamp: stamp({ id: "o1", actorId: "admin1", actorRole: "administrator", actorName: "Admin" }) } as AdminAction);
    expect((opened.costReports ?? []).find((r) => r.id === cr.id)?.status).toBe("in_review");

    const badReject = adminReducer(opened, { type: "decide-cost-report", id: cr.id, decision: "rejected", note: "no", stamp: stamp({ id: "d1", actorId: "admin1", actorRole: "administrator", actorName: "Admin" }) } as AdminAction);
    expect(badReject).toBe(opened);

    const rejected = adminReducer(opened, { type: "decide-cost-report", id: cr.id, decision: "rejected", note: "Rates do not match contract", stamp: stamp({ id: "d2", actorId: "admin1", actorRole: "administrator", actorName: "Admin" }) } as AdminAction);
    const rej = (rejected.costReports ?? []).find((r) => r.id === cr.id)!;
    expect(rej.status).toBe("rejected");
    expect(rej.rejectionNote).toBe("Rates do not match contract");
    expect(rej.reviewHistory?.some((h) => h.action === "rejected")).toBe(true);
  });
});
