"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { AccountBadge, ActivityBadge, EmploymentBadge, PriorityBadge, ProjectStatusBadge, TaskStatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { useAdmin } from "@/lib/data/admin-store";
import { documentCategoryLabel, issuedRevision, latestRevision, standing, standingLabel } from "@/lib/documents";
import { roleLabel } from "@/lib/labels";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";
import type { Employee, EngineerReportStatus, UserAccount } from "@/types";

const reportStatusLabel: Record<EngineerReportStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

export function PersonRecord({ kind }: { kind: "user" | "employee" }) {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const data = useAdmin();
  const primaryUser = kind === "user" ? data.users.find((user) => user.id === id) ?? null : null;
  const primaryEmployee = kind === "employee" ? data.employees.find((employee) => employee.id === id) ?? null : null;
  const user = primaryUser ?? (primaryEmployee ? data.users.find((item) => samePerson(item, primaryEmployee)) ?? null : null);
  const employee = primaryEmployee ?? (primaryUser ? data.employees.find((item) => samePerson(item, primaryUser)) ?? null : null);
  const back = kind === "user" ? "/admin/users" : "/admin/employees";

  if (!primaryUser && !primaryEmployee) {
    return (
      <div>
        <PageHeader title="Record not found" description="That person is not in this preview." />
        <Link href={back} className="text-sm font-medium text-accent hover:underline">Back</Link>
      </div>
    );
  }

  const title = fullName((primaryUser ?? primaryEmployee)!);
  const names = new Set([user ? fullName(user) : "", employee ? fullName(employee) : ""].filter(Boolean));
  const managed = user ? data.projects.filter((project) => project.managerId === user.id) : [];
  const assignedIds = new Set([user?.projectId, employee?.projectId].filter((item): item is string => Boolean(item)));
  const projects = data.projects
    .filter((project) => managed.some((item) => item.id === project.id) || assignedIds.has(project.id))
    .map((project) => ({
      project,
      relation: managed.some((item) => item.id === project.id) ? "Manages" : "Assigned",
    }));
  const tasks = data.tasks
    .filter((task) => names.has(task.assignee))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const documents = user ? (data.documents ?? []).filter((item) => item.ownerId === user.id) : [];
  const reports = user
    ? data.reports.filter((report) => report.engineerId === user.id || report.reviewerId === user.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    : [];
  const activity = (user
    ? data.activityLogs.filter((log) => log.userId === user.id)
    : data.activityLogs.filter((log) => names.has(log.userName))
  ).slice(0, 12);
  const notices = data.notifications.filter((item) => names.has(item.senderName)).slice(0, 8);

  return (
    <div>
      <Link href={back} className="mb-3 inline-flex items-center gap-1 text-sm text-black/55 hover:text-black">
        <ArrowLeft className="size-4" />
        {kind === "user" ? "Users" : "Employees"}
      </Link>
      <PageHeader
        title={title}
        description={user && employee ? "Application account and workforce record for the same person." : user ? "Application account, and the work attached to it." : "Workforce record, and the work attached to this name."}
        actions={user ? <AccountBadge status={user.status} /> : employee ? <EmploymentBadge status={employee.status} /> : null}
      />
      <div className="space-y-4">
        {user ? (
          <Section title="Account" hint="Login identity for this preview. It is not an employment contract.">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Fact label="Email" value={user.email} />
              <Fact label="Phone" value={user.phone} />
              <Fact label="Role" value={roleLabel[user.role]} />
              <Fact label="Status" value={<AccountBadge status={user.status} />} />
              <Fact label="Registered" value={formatDate(user.registeredAt)} />
              <Fact label="Assigned project" value={projectLink(data.projectById(user.projectId))} />
            </div>
            {employee && kind === "user" ? (
              <Link href={`/admin/employees/${employee.id}`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                Open the workforce record
              </Link>
            ) : null}
          </Section>
        ) : null}

        {employee ? (
          <Section title="Employment" hint="Company workforce record. It does not sign in by itself.">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Fact label="Employee ID" value={employee.employeeCode} />
              <Fact label="Position" value={employee.position} />
              <Fact label="Department" value={employee.department} />
              <Fact label="Phone" value={employee.phone} />
              <Fact label="Email" value={employee.email} />
              <Fact label="Hired" value={formatDate(employee.hiredAt)} />
              <Fact label="Status" value={<EmploymentBadge status={employee.status} />} />
              <Fact label="Assigned project" value={projectLink(data.projectById(employee.projectId))} />
            </div>
            {user && kind === "employee" ? (
              <Link href={`/admin/users/${user.id}`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                Open the application account
              </Link>
            ) : null}
          </Section>
        ) : null}

        <Section title="Projects" hint="Jobs this person manages or is assigned to.">
          {projects.length === 0 ? <Empty>No project is tied to this person.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-[11px] text-muted-foreground">
                  <tr>{["Project", "Code", "Relation", "Location", "Status", "Progress"].map((label) => <th key={label} className="px-2 py-2 font-medium tracking-wide uppercase">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {projects.map(({ project, relation }) => (
                    <tr key={project.id} className="border-t border-black/5">
                      <td className="px-2 py-2 font-medium"><Link href={`/admin/projects/${project.id}`} className="hover:underline">{project.name}</Link></td>
                      <td className="px-2 py-2">{project.code}</td>
                      <td className="px-2 py-2">{relation}</td>
                      <td className="px-2 py-2">{project.location}</td>
                      <td className="px-2 py-2"><ProjectStatusBadge status={project.status} /></td>
                      <td className="px-2 py-2">{project.progress}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Tasks" hint="Activities whose assignee is this name.">
          {tasks.length === 0 ? <Empty>No tasks are assigned to this name.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-[11px] text-muted-foreground">
                  <tr>{["Activity", "Project", "Due", "Priority", "Status", "Progress"].map((label) => <th key={label} className="px-2 py-2 font-medium tracking-wide uppercase">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const project = data.projectById(task.projectId);
                    return (
                      <tr key={task.id} className="border-t border-black/5">
                        <td className="px-2 py-2 font-medium">{task.title}</td>
                        <td className="px-2 py-2">{project ? <Link href={`/admin/projects/${project.id}#tasks`} className="hover:underline">{project.code}</Link> : "—"}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{formatDate(task.dueDate)}</td>
                        <td className="px-2 py-2"><PriorityBadge priority={task.priority} /></td>
                        <td className="px-2 py-2"><TaskStatusBadge status={task.status} /></td>
                        <td className="px-2 py-2">{task.progress}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Documents" hint="Files this account owns in the register.">
          {documents.length === 0 ? <Empty>No documents are owned by this account.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-[11px] text-muted-foreground">
                  <tr>{["Number", "Document", "Project", "Latest", "Issued"].map((label) => <th key={label} className="px-2 py-2 font-medium tracking-wide uppercase">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {documents.map((item) => {
                    const project = data.projectById(item.projectId);
                    const latest = latestRevision(item);
                    const issued = issuedRevision(item);
                    const state = latest ? standing(item, latest) : "draft";
                    return (
                      <tr key={item.id} className="border-t border-black/5">
                        <td className="px-2 py-2 font-mono text-xs">
                          <Link href={`/admin/documents?project=${item.projectId}&doc=${item.id}`} className="hover:underline">{item.number}</Link>
                        </td>
                        <td className="px-2 py-2">
                          <span className="font-medium">{item.title}</span>
                          <span className="mt-0.5 block text-xs text-black/45">{documentCategoryLabel[item.category]}</span>
                        </td>
                        <td className="px-2 py-2">{project?.code ?? "—"}</td>
                        <td className="px-2 py-2">{latest ? `Rev ${latest.revision} · ${standingLabel[state]}` : "—"}</td>
                        <td className="px-2 py-2">{issued ? `Rev ${issued.revision}` : "Not issued"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Reports" hint="Site reports this account filed or decided.">
          {reports.length === 0 ? <Empty>No site reports are filed or reviewed by this account.</Empty> : (
            <div className="space-y-2">
              {reports.map((report) => {
                const project = data.projectById(report.projectId);
                const filed = user ? report.engineerId === user.id : false;
                return (
                  <article key={report.id} className="rounded-2xl bg-light-gray px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{project?.code ?? "Project"} · {formatDate(report.periodStart)} – {formatDate(report.periodEnd)}</p>
                      <Badge tone={report.status === "rejected" ? "red" : report.status === "approved" ? "green" : "amber"}>{reportStatusLabel[report.status]}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-black/45">{filed ? "Filed" : "Reviewed"} {formatDateTime(report.submittedAt)} · {report.progress}%</p>
                    <p className="mt-2 text-sm">{report.summary}</p>
                    {report.issues ? <p className="mt-1 text-sm text-black/60">{report.issues}</p> : null}
                    {report.decisionNote ? <p className="mt-2 text-xs text-black/45">{report.decisionNote}</p> : null}
                  </article>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Activity" hint="Preview log lines for this person.">
          {activity.length === 0 ? <Empty>No log lines for this person.</Empty> : (
            <ul className="space-y-2">
              {activity.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-light-gray px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{log.action}</span>
                    <span className="block text-xs text-black/45">{log.module} · {log.record}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <ActivityBadge status={log.status} />
                    <span className="text-xs text-black/45">{formatDateTime(log.timestamp)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Notices" hint="Notifications sent under this name.">
          {notices.length === 0 ? <Empty>No notices were sent under this name.</Empty> : (
            <ul className="space-y-2">
              {notices.map((item) => (
                <li key={item.id} className="rounded-2xl bg-light-gray px-3 py-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-sm text-black/60">{item.message}</p>
                  <p className="mt-1 text-xs text-black/45">{formatDateTime(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function samePerson(left: UserAccount | Employee, right: UserAccount | Employee) {
  if (left.email && right.email && left.email.toLowerCase() === right.email.toLowerCase()) return true;
  return fullName(left).toLowerCase() === fullName(right).toLowerCase();
}

function projectLink(project: { id: string; name: string } | null | undefined) {
  if (!project) return "Unassigned";
  return <Link href={`/admin/projects/${project.id}`} className="hover:underline">{project.name}</Link>;
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{hint}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-light-gray px-3 py-3">
      <p className="text-xs text-black/45">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
