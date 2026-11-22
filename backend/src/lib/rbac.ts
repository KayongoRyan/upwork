import type { SessionUser, UserRole } from "@/types";
import type { PortalKey } from "@/lib/server/portal-store";

export const PORTAL_ROLE: Record<PortalKey, UserRole> = {
  administrator: "administrator",
  project_manager: "project_manager",
  site_engineer: "site_engineer",
  quantity_surveyor: "quantity_surveyor",
};

export const ROLE_PORTAL: Record<UserRole, PortalKey> = {
  administrator: "administrator",
  project_manager: "project_manager",
  site_engineer: "site_engineer",
  quantity_surveyor: "quantity_surveyor",
};

const ROLE_RANK: Record<UserRole, number> = {
  administrator: 4,
  project_manager: 3,
  site_engineer: 2,
  quantity_surveyor: 1,
};

export function hasRole(session: SessionUser, ...roles: UserRole[]): boolean {
  return roles.includes(session.role);
}

export function isAdmin(session: SessionUser): boolean {
  return session.role === "administrator";
}

export function canAccessProject(session: SessionUser, project: { managerId?: string | null; id: string }): boolean {
  if (session.role === "administrator") return true;
  if (session.role === "project_manager") return project.managerId === session.id;
  if (session.role === "site_engineer" || session.role === "quantity_surveyor") return session.projectId === project.id;
  return false;
}

export function canManageProject(session: SessionUser, project: { managerId?: string | null; id: string }): boolean {
  if (session.role === "administrator") return true;
  if (session.role === "project_manager") return project.managerId === session.id;
  return false;
}

export function assertRole(session: SessionUser, roles: readonly UserRole[]): { ok: true } | { ok: false; status: 403; error: string } {
  if (roles.includes(session.role)) return { ok: true };
  return { ok: false, status: 403, error: "forbidden" };
}

export function roleAtLeast(session: SessionUser, role: UserRole): boolean {
  return ROLE_RANK[session.role] >= ROLE_RANK[role];
}
