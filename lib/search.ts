import { documentCategoryLabel } from "@/lib/documents";
import { projectStatusLabel, roleLabel } from "@/lib/labels";
import { fullName } from "@/lib/utils";
import type { Employee, Project, ProjectDocument, TaskItem, UserAccount } from "@/types";

export type SearchHit = { key: string; title: string; meta: string; href: string };
export type SearchGroup = { title: string; items: SearchHit[] };

type PageRef = { href: string; label: string; description: string; section: string };
type PortalKind = "administrator" | "project_manager" | "site_engineer" | "quantity_surveyor";

export function searchRecords({
  query,
  pages,
  projects,
  users,
  employees,
  documents,
  tasks,
  projectIds,
  projectBase,
  portal,
  recordLimit,
  idlePages = false,
}: {
  query: string;
  pages: PageRef[];
  projects: Project[];
  users: UserAccount[];
  employees: Employee[];
  documents: ProjectDocument[];
  tasks: TaskItem[];
  projectIds?: string[];
  projectBase?: string;
  portal?: PortalKind | null;
  recordLimit?: number;
  idlePages?: boolean;
}): SearchGroup[] {
  const needle = query.trim().toLowerCase();
  const allowed = projectIds ? new Set(projectIds) : null;
  const matches = (value: string) => value.toLowerCase().includes(needle);
  const inScope = (projectId: string) => !allowed || allowed.has(projectId);
  const take = <T,>(rows: T[]) => (recordLimit ? rows.slice(0, recordLimit) : rows);
  const groups: SearchGroup[] = [];

  const projectHref = (id: string) =>
    projectBase
      ? `${projectBase}/${id}`
      : portal === "site_engineer"
        ? `/se/projects/${id}`
        : portal === "quantity_surveyor"
          ? `/qs/projects/${id}`
          : `/admin/projects/${id}`;

  const taskHref = (projectId: string) =>
    portal === "project_manager"
      ? `/pm/projects/${projectId}#tasks`
      : portal === "site_engineer"
        ? `/se/projects/${projectId}#tasks`
        : `/admin/projects/${projectId}#tasks`;

  if (needle) {
    const projectHits = take(
      projects.filter((project) => {
        const manager = users.find((user) => user.id === project.managerId);
        const text = `${project.name} ${project.code} ${project.client} ${project.location} ${project.description} ${projectStatusLabel[project.status]} ${manager ? fullName(manager) : ""}`;
        return inScope(project.id) && matches(text);
      }),
    ).map((project) => ({ key: project.id, title: project.name, meta: project.code, href: projectHref(project.id) }));
    if (projectHits.length > 0) groups.push({ title: "Projects", items: projectHits });

    const documentHits = take(
      (documents ?? []).filter((item) => {
        const project = projects.find((entry) => entry.id === item.projectId);
        const files = (item.revisions ?? []).map((revision) => `${revision.revision} ${revision.fileName}`).join(" ");
        const text = `${item.number} ${item.title} ${item.discipline} ${documentCategoryLabel[item.category] ?? ""} ${project?.name ?? ""} ${project?.code ?? ""} ${files}`;
        return inScope(item.projectId) && matches(text);
      }),
    ).map((item) => ({
      key: item.id,
      title: item.title,
      meta: item.number,
      href: `/admin/documents?project=${item.projectId}&doc=${item.id}`,
    }));
    if (documentHits.length > 0) groups.push({ title: "Documents", items: documentHits });

    if (portal !== "quantity_surveyor") {
      const taskHits = take(tasks.filter((task) => inScope(task.projectId) && matches(`${task.title} ${task.assignee}`))).map((task) => ({
        key: task.id,
        title: task.title,
        meta: task.assignee,
        href: taskHref(task.projectId),
      }));
      if (taskHits.length > 0) groups.push({ title: "Tasks", items: taskHits });
    }

    const userHits = take(
      users.filter((user) => {
        const managed = projects.some((project) => project.managerId === user.id && inScope(project.id));
        const assigned = Boolean(user.projectId && inScope(user.projectId));
        return (!allowed || managed || assigned) && matches(`${fullName(user)} ${user.email} ${user.phone} ${roleLabel[user.role]}`);
      }),
    ).map((user) => ({ key: user.id, title: fullName(user), meta: user.email, href: `/admin/users/${user.id}` }));
    if (userHits.length > 0) groups.push({ title: "People", items: userHits });

    const employeeHits = take(
      employees.filter((employee) => {
        const assigned = Boolean(employee.projectId && inScope(employee.projectId));
        return (!allowed || assigned) && matches(`${fullName(employee)} ${employee.employeeCode} ${employee.position} ${employee.phone} ${employee.email}`);
      }),
    ).map((employee) => ({
      key: employee.id,
      title: fullName(employee),
      meta: employee.employeeCode,
      href: `/admin/employees/${employee.id}`,
    }));
    if (employeeHits.length > 0) groups.push({ title: "Workforce", items: employeeHits });
  }

  const pageHits = pages
    .filter((item) => !needle || matches(`${item.label} ${item.description}`))
    .slice(0, needle ? 4 : idlePages ? pages.length : 0)
    .map((item) => ({ key: item.href, title: item.label, meta: item.section, href: item.href }));
  if (pageHits.length > 0) groups.push({ title: "Pages", items: pageHits });

  return groups;
}
