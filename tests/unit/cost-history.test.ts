import { describe, expect, it } from "vitest";
import { adminReducer, type AdminAction, type Stamp } from "@/lib/data/reducer";
import { createSeedState } from "@/lib/mock-data/seed";
import type { AdminState } from "@/types";

function stamp(overrides: Partial<Stamp> = {}): Stamp {
  return {
    id: `act-${Math.random().toString(36).slice(2, 8)}`,
    at: "2026-11-25T12:00:00.000Z",
    actorId: "admin1",
    actorName: "Admin One",
    actorRole: "administrator",
    ...overrides,
  };
}

function baseState(): AdminState {
  const s = createSeedState();
  const pm = s.users.find((u) => u.role === "project_manager" && u.status === "active")!;
  const proj = s.projects.find((p) => p.managerId === pm.id) ?? s.projects[0];
  proj.managerId = pm.id;
  return s;
}

describe("historical cost changes", () => {
  it("records project budget and spent changes", () => {
    const s = baseState();
    const proj = s.projects[0];
    const next = adminReducer(s, {
      type: "update-project",
      id: proj.id,
      input: { ...proj, budget: proj.budget + 1000, spent: proj.spent + 500 },
      stamp: stamp({ id: "p1" }),
    } as AdminAction);
    const changes = (next.costChanges ?? []).filter((c) => c.projectId === proj.id && c.sourceType === "project");
    expect(changes.some((c) => c.field === "budget" && c.delta === 1000)).toBe(true);
    expect(changes.some((c) => c.field === "spent" && c.delta === 500)).toBe(true);
  });

  it("records BOQ measurement spent delta and variation approval", () => {
    let s = baseState();
    const pm = s.users.find((u) => u.role === "project_manager" && u.status === "active")!;
    const proj = s.projects.find((p) => p.managerId === pm.id) ?? s.projects[0];
    const qs = s.users.find((u) => u.role === "quantity_surveyor" && u.status === "active")!;
    qs.projectId = proj.id;

    s = adminReducer(s, {
      type: "create-boq",
      surveyorId: qs.id,
      input: { projectId: proj.id, code: "Z1", description: "Test", unit: "m2", estimatedQty: 10, actualQty: 2, unitRate: 100 },
      stamp: stamp({ id: "b1", actorId: qs.id, actorName: "QS", actorRole: "quantity_surveyor" }),
    } as AdminAction);
    expect((s.costChanges ?? []).some((c) => c.sourceType === "boq" && c.field === "project.spent")).toBe(true);

    s = adminReducer(s, {
      type: "create-variation",
      input: { projectId: proj.id, boqItemId: null, reference: "V1", title: "Var", description: "Desc", reason: "Reason", type: "addition", amount: 500, currency: "RWF" },
      stamp: stamp({ id: "v1", actorId: qs.id, actorName: "QS", actorRole: "quantity_surveyor" }),
    } as AdminAction);
    const vid = (s.variations ?? [])[0].id;
    s = adminReducer(s, { type: "submit-variation", id: vid, stamp: stamp({ id: "v2", actorId: qs.id, actorRole: "quantity_surveyor" }) } as AdminAction);
    s = adminReducer(s, { type: "decide-variation", id: vid, decision: "approved", note: "ok", stamp: stamp({ id: "v3", actorId: "admin1", actorRole: "administrator" }) } as AdminAction);
    expect((s.costChanges ?? []).some((c) => c.sourceType === "variation" && c.action === "approve-variation" && c.delta === 500)).toBe(true);
  });
});
