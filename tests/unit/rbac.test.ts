import { describe, expect, it } from "vitest";
import { canAccessProject, canManageProject, hasRole, isAdmin, roleAtLeast } from "../../backend/src/lib/rbac";
import type { SessionUser } from "../../types";

function session(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: "u1",
    email: "u@example.com",
    firstName: "Test",
    lastName: "User",
    role: "administrator",
    status: "active",
    projectId: null,
    ...overrides,
  } as SessionUser;
}

describe("rbac helpers", () => {
  it("identifies admin", () => {
    expect(isAdmin(session({ role: "administrator" }))).toBe(true);
    expect(isAdmin(session({ role: "project_manager" }))).toBe(false);
  });

  it("checks roles", () => {
    const pm = session({ role: "project_manager" });
    expect(hasRole(pm, "project_manager", "administrator")).toBe(true);
    expect(hasRole(pm, "site_engineer")).toBe(false);
  });

  it("enforces project access by role", () => {
    const project = { id: "p1", managerId: "pm1" };
    expect(canAccessProject(session({ role: "administrator" }), project)).toBe(true);
    expect(canAccessProject(session({ role: "project_manager", id: "pm1" }), project)).toBe(true);
    expect(canAccessProject(session({ role: "project_manager", id: "pm2" }), project)).toBe(false);
    expect(canAccessProject(session({ role: "site_engineer", projectId: "p1" }), project)).toBe(true);
    expect(canAccessProject(session({ role: "site_engineer", projectId: "p2" }), project)).toBe(false);
    expect(canAccessProject(session({ role: "quantity_surveyor", projectId: "p1" }), project)).toBe(true);
  });

  it("enforces project management rights", () => {
    const project = { id: "p1", managerId: "pm1" };
    expect(canManageProject(session({ role: "administrator" }), project)).toBe(true);
    expect(canManageProject(session({ role: "project_manager", id: "pm1" }), project)).toBe(true);
    expect(canManageProject(session({ role: "project_manager", id: "pm2" }), project)).toBe(false);
    expect(canManageProject(session({ role: "site_engineer", projectId: "p1" }), project)).toBe(false);
  });

  it("compares role rank", () => {
    expect(roleAtLeast(session({ role: "administrator" }), "site_engineer")).toBe(true);
    expect(roleAtLeast(session({ role: "quantity_surveyor" }), "project_manager")).toBe(false);
  });
});
