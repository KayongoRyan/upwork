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
  const admin = s.users.find((u) => u.role === "administrator") ?? s.users[0];
  const pm = s.users.find((u) => u.role === "project_manager" && u.status === "active")!;
  const proj = s.projects.find((p) => p.managerId === pm.id) ?? s.projects[0];
  proj.managerId = pm.id;
  // ensure deterministic actors
  admin.id = "admin1";
  pm.id = pm.id || "pm1";
  return s;
}

function ctx(s: AdminState) {
  const pm = s.users.find((u) => u.role === "project_manager")!;
  const proj = s.projects.find((p) => p.managerId === pm.id) ?? s.projects[0];
  return { pm, proj };
}

function createExpense(s: AdminState, overrides: Partial<{ projectId: string; category: "labor" | "material" | "equipment" | "subcontractor" | "service" | "other"; description: string; amount: number; currency: string; vendor: string; incurredDate: string }> = {}) {
  const { pm, proj } = ctx(s);
  const action: AdminAction = {
    type: "create-expense",
    input: {
      projectId: proj.id,
      category: "material",
      description: "Cement bags",
      amount: 1000,
      currency: "RWF",
      vendor: "Supplier",
      incurredDate: "2026-11-20",
      ...overrides,
    },
    stamp: stamp({ actorId: pm.id, actorName: `${pm.firstName} ${pm.lastName}`, actorRole: "project_manager" }),
  } as AdminAction;
  return adminReducer(s, action);
}

describe("expense/payment lifecycles", () => {
  it("creates expense as draft and records audit history", () => {
    const s = baseState();
    const next = createExpense(s);
    expect(next).not.toBe(s);
    const e = next.expenses[0];
    expect(e.status).toBe("draft");
    expect(e.amount).toBe(1000);
    expect(e.reviewHistory[0]?.action).toBe("created");
  });

  it("enforces expense transitions and rejection reason", () => {
    const s = baseState();
    const created = createExpense(s);
    const e = created.expenses[0];
    const submitted = adminReducer(created, { type: "submit-expense", id: e.id, stamp: stamp({ id: "s1", actorId: "pm1", actorRole: "project_manager" }) } as AdminAction);
    expect(submitted.expenses[0].status).toBe("submitted");

    const badReject = adminReducer(submitted, { type: "decide-expense", id: e.id, decision: "rejected", note: "no", stamp: stamp({ id: "d1" }) } as AdminAction);
    expect(badReject).toBe(submitted);

    const rejected = adminReducer(submitted, { type: "decide-expense", id: e.id, decision: "rejected", note: "Missing receipt", stamp: stamp({ id: "d2" }) } as AdminAction);
    expect(rejected.expenses[0].status).toBe("rejected");
    expect(rejected.expenses[0].rejectionNote).toBe("Missing receipt");
    expect(rejected.expenses[0].reviewHistory.some((h) => h.action === "rejected" && h.note === "Missing receipt")).toBe(true);
  });

  it("blocks payment creation for unapproved expense, currency mismatch, and overpayment", () => {
    const s = baseState();
    const created = createExpense(s);
    const e = created.expenses[0];
    const payDraft = adminReducer(created, { type: "create-payment", input: { projectId: e.projectId, expenseId: e.id, amount: 100, currency: "RWF", method: "cash", reference: "", scheduledFor: null }, stamp: stamp({ id: "p1" }) } as AdminAction);
    expect(payDraft).toBe(created); // expense not approved

    const submitted = adminReducer(created, { type: "submit-expense", id: e.id, stamp: stamp({ id: "s1", actorRole: "project_manager" }) } as AdminAction);
    const approved = adminReducer(submitted, { type: "decide-expense", id: e.id, decision: "approved", note: "OK", stamp: stamp({ id: "a1" }) } as AdminAction);

    const badCurrency = adminReducer(approved, { type: "create-payment", input: { projectId: e.projectId, expenseId: e.id, amount: 100, currency: "USD", method: "cash", reference: "", scheduledFor: null }, stamp: stamp({ id: "p2" }) } as AdminAction);
    expect(badCurrency).toBe(approved);

    const over = adminReducer(approved, { type: "create-payment", input: { projectId: e.projectId, expenseId: e.id, amount: 1200, currency: "RWF", method: "cash", reference: "", scheduledFor: null }, stamp: stamp({ id: "p3" }) } as AdminAction);
    expect(over).toBe(approved);

    const ok = adminReducer(approved, { type: "create-payment", input: { projectId: e.projectId, expenseId: e.id, amount: 600, currency: "RWF", method: "bank_transfer", reference: "REF1", scheduledFor: null }, stamp: stamp({ id: "p4" }) } as AdminAction);
    expect(ok.payments[0].status).toBe("pending");
    const overRemaining = adminReducer(ok, { type: "create-payment", input: { projectId: e.projectId, expenseId: e.id, amount: 500, currency: "RWF", method: "cash", reference: "REF2", scheduledFor: null }, stamp: stamp({ id: "p5" }) } as AdminAction);
    expect(overRemaining).toBe(ok);
  });

  it("enforces payment lifecycle, failure/reversal reasons, and expense cancel guard", () => {
    const s = baseState();
    let state = createExpense(s);
    const e = state.expenses[0];
    state = adminReducer(state, { type: "submit-expense", id: e.id, stamp: stamp({ id: "s1", actorRole: "project_manager" }) } as AdminAction);
    state = adminReducer(state, { type: "decide-expense", id: e.id, decision: "approved", note: "ok", stamp: stamp({ id: "a1" }) } as AdminAction);
    state = adminReducer(state, { type: "create-payment", input: { projectId: e.projectId, expenseId: e.id, amount: 500, currency: "RWF", method: "mobile_money", reference: "MM1", scheduledFor: null }, stamp: stamp({ id: "p1" }) } as AdminAction);
    const p = state.payments[0];

    const cannotCancelExpense = adminReducer(state, { type: "cancel-expense", id: e.id, note: "", stamp: stamp({ id: "c1" }) } as AdminAction);
    expect(cannotCancelExpense).toBe(state); // active payment blocks

    state = adminReducer(state, { type: "approve-payment", id: p.id, note: "ok", stamp: stamp({ id: "ap1" }) } as AdminAction);
    expect(state.payments[0].status).toBe("approved");

    const badFail = adminReducer(state, { type: "fail-payment", id: p.id, note: "no", stamp: stamp({ id: "f1" }) } as AdminAction);
    expect(badFail).toBe(state);
    state = adminReducer(state, { type: "mark-payment-paid", id: p.id, note: "paid", paidAt: "2026-11-25T12:00:00.000Z", stamp: stamp({ id: "pd1" }) } as AdminAction);
    expect(state.payments[0].status).toBe("paid");

    const badReverse = adminReducer(state, { type: "reverse-payment", id: p.id, note: "no", stamp: stamp({ id: "rv0" }) } as AdminAction);
    expect(badReverse).toBe(state);
    state = adminReducer(state, { type: "reverse-payment", id: p.id, note: "Bank reversed", stamp: stamp({ id: "rv1" }) } as AdminAction);
    expect(state.payments[0].status).toBe("reversed");
    expect(state.payments[0].reviewHistory.some((h) => h.action === "reversed")).toBe(true);
  });

  it("prevents duplicate financial transactions", () => {
    let s = baseState();
    s = createExpense(s, { description: "Cement bags", amount: 1000, vendor: "Supplier", incurredDate: "2026-11-20" });
    const duplicateExpense = adminReducer(s, {
      type: "create-expense",
      input: { projectId: s.expenses[0].projectId, category: "material", description: "Cement bags", amount: 1000, currency: "RWF", vendor: "Supplier", incurredDate: "2026-11-20" },
      stamp: stamp({ id: "dup-e1" }),
    } as AdminAction);
    expect(duplicateExpense).toBe(s);

    let state = adminReducer(s, { type: "submit-expense", id: s.expenses[0].id, stamp: stamp({ id: "s1", actorRole: "project_manager" }) } as AdminAction);
    state = adminReducer(state, { type: "decide-expense", id: s.expenses[0].id, decision: "approved", note: "ok", stamp: stamp({ id: "a1" }) } as AdminAction);
    const expense = state.expenses[0];
    state = adminReducer(state, { type: "create-payment", input: { projectId: expense.projectId, expenseId: expense.id, amount: 200, currency: "RWF", method: "cash", reference: "REF-1", scheduledFor: null }, stamp: stamp({ id: "p1" }) } as AdminAction);
    const dupByRef = adminReducer(state, { type: "create-payment", input: { projectId: expense.projectId, expenseId: expense.id, amount: 200, currency: "RWF", method: "cash", reference: "REF-1", scheduledFor: null }, stamp: stamp({ id: "p2" }) } as AdminAction);
    expect(dupByRef).toBe(state);
  });
});
