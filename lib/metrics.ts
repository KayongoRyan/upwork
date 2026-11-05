import type { Employee, Project, UserAccount, UserRole } from "@/types";
import { daysUntil } from "@/lib/utils";

export const previousMonthSnapshot = {
  projects: 6,
  active: 3,
  completed: 1,
  delayed: 1,
  employees: 12,
  engineers: 3,
  managers: 2,
  surveyors: 2,
};

export function countProjects(projects: Project[]) {
  return {
    total: projects.length,
    active: projects.filter((project) => project.status === "active").length,
    completed: projects.filter((project) => project.status === "completed").length,
    delayed: projects.filter((project) => project.status === "delayed").length,
    onHold: projects.filter((project) => project.status === "on_hold").length,
    planning: projects.filter((project) => project.status === "planning").length,
  };
}

export function countRoles(users: UserAccount[]) {
  const count = (role: UserRole) => users.filter((user) => user.role === role).length;
  return {
    administrator: count("administrator"),
    project_manager: count("project_manager"),
    site_engineer: count("site_engineer"),
    quantity_surveyor: count("quantity_surveyor"),
    active: users.filter((user) => user.status === "active").length,
    inactive: users.filter((user) => user.status === "inactive").length,
    total: users.length,
  };
}

export function countEmployees(employees: Employee[]) {
  return {
    total: employees.length,
    active: employees.filter((employee) => employee.status === "active").length,
    onLeave: employees.filter((employee) => employee.status === "on_leave").length,
    contract: employees.filter((employee) => employee.status === "contract").length,
  };
}

export function attentionFor(project: Project) {
  const reasons: string[] = [];
  const days = daysUntil(project.expectedEndDate);
  if (project.status === "delayed") reasons.push("Delayed");
  if ((project.status === "active" || project.status === "planning") && project.progress < 40) {
    reasons.push("Low progress");
  }
  if (project.status !== "completed" && days < 0) reasons.push("Past due");
  else if (project.status !== "completed" && days <= 21) reasons.push("Deadline within 21 days");
  if (project.status === "on_hold") reasons.push("On hold");
  return reasons;
}

export function projectsNeedingAttention(projects: Project[]) {
  return projects
    .map((project) => ({ project, reasons: attentionFor(project) }))
    .filter((entry) => entry.reasons.length > 0)
    .sort((a, b) => {
      const rank = (reasons: string[]) => (reasons.includes("Delayed") || reasons.includes("Past due") ? 0 : 1);
      return rank(a.reasons) - rank(b.reasons);
    });
}

export function budgetTotals(projects: Project[]) {
  const budget = projects.reduce((sum, project) => sum + project.budget, 0);
  const spent = projects.reduce((sum, project) => sum + project.spent, 0);
  return { budget, spent, remaining: budget - spent };
}

export function overlapsRange(project: Project, from: string, to: string) {
  return project.startDate <= to && project.expectedEndDate >= from;
}
