import { describe, expect, it } from "vitest";
import { adminReducer, type AdminAction, type Stamp } from "@/lib/data/reducer";
import { createSeedState } from "@/lib/mock-data/seed";
import type { AdminState } from "@/types";

function stamp(overrides: Partial<Stamp> = {}): Stamp {
  return {
    id: `act-${Math.random().toString(36).slice(2, 8)}`,
    at: "2026-11-25T12:00:00.000Z",
    actorId: "qs1",
    actorName: "QS One",
    actorRole: "quantity_surveyor",
    ...overrides,
  };
}

function baseState(): AdminState {
  const s = createSeedState();
  const pm = s.users.find((u) => u.role === "project_manager" && u.status === "active")!;
  const qs = s.users.find((u) => u.role === "quantity_surveyor" && u.status === "active") ?? s.users[0];
  const proj = s.projects.find((p) => p.managerId === pm.id) ?? s.projects[0];
  proj.managerId = pm.id;
  qs.projectId = proj.id;
  qs.role = "quantity_surveyor";
  return s;
}

describe("variation lifecycle", () => {
  it("creates, submits, reviews, and approves variation with history", () => {
    let s = baseState();
    const proj = s.projects[0];
    s = adminReducer(s, {
      type: "create-variation",
      input: { projectId: proj.id, boqItemId: null, reference: "VAR-001", title: "Extra excavation", description: "Additional excavation required", reason: "Unforeseen ground condition", type: "addition", amount: 250000, currency: "RWF" },
      stamp: stamp({ id: "v1" }),
    } as AdminAction);
    const v = (s.variations ?? [])[0];
    expect(v.status).toBe("draft");
    expect(v.reviewHistory[0]?.action).toBe("created");

    s = adminReducer(s, { type: "submit-variation", id: v.id, stamp: stamp({ id: "v2" }) } as AdminAction);
    expect((s.variations ?? [])[0].status).toBe("submitted");

    s = adminReducer(s, { type: "open-variation-review", id: v.id, stamp: stamp({ id: "v3", actorId: "admin1", actorName: "Admin", actorRole: "administrator" }) } as AdminAction);
    expect((s.variations ?? [])[0].status).toBe("in_review");

    const badReject = adminReducer(s, { type: "decide-variation", id: v.id, decision: "rejected", note: "no", stamp: stamp({ id: "v4", actorId: "admin1", actorName: "Admin", actorRole: "administrator" }) } as AdminAction);
    expect(badReject).toBe(s);

    s = adminReducer(s, { type: "decide-variation", id: v.id, decision: "approved", note: "Supported by site instruction", stamp: stamp({ id: "v5", actorId: "admin1", actorName: "Admin", actorRole: "administrator" }) } as AdminAction);
    const approved = (s.variations ?? [])[0];
    expect(approved.status).toBe("approved");
    expect(approved.reviewHistory.some((h) => h.action === "approved")).toBe(true);
  });

  it("blocks cancelling an approved variation", () => {
    let s = baseState();
    const proj = s.projects[0];
    s = adminReducer(s, { type: "create-variation", input: { projectId: proj.id, boqItemId: null, reference: "VAR-002", title: "Omission", description: "Remove item", reason: "Scope reduced", type: "omission", amount: 50000, currency: "RWF" }, stamp: stamp({ id: "c1" }) } as AdminAction);
    const id = (s.variations ?? [])[0].id;
    s = adminReducer(s, { type: "submit-variation", id, stamp: stamp({ id: "c2" }) } as AdminAction);
    s = adminReducer(s, { type: "decide-variation", id, decision: "approved", note: "ok", stamp: stamp({ id: "c3", actorId: "admin1", actorRole: "administrator", actorName: "Admin" }) } as AdminAction);
    const afterCancel = adminReducer(s, { type: "cancel-variation", id, note: "mistake", stamp: stamp({ id: "c4", actorId: "admin1", actorRole: "administrator", actorName: "Admin" }) } as AdminAction);
    expect(afterCancel).toBe(s);
    expect((s.variations ?? [])[0].status).toBe("approved");
  });
});
