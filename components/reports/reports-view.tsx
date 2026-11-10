"use client";

import { Children, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { MonthlyActivityChart } from "@/components/dashboard/monthly-activity-chart";
import { ProjectStatusChart } from "@/components/dashboard/project-status-chart";
import { WorkforceChart } from "@/components/dashboard/workforce-chart";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectStatusBadge, TaskStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useAdmin } from "@/lib/data/admin-store";
import { budgetTotals, countProjects, overlapsRange } from "@/lib/metrics";
import { formatDate, formatMoney } from "@/lib/utils";

export function ReportsView() {
  const data = useAdmin();
  const params = useSearchParams();
  const from = params.get("from") ?? "2025-01-01";
  const to = params.get("to") ?? "2027-12-31";
  const projectId = params.get("project") ?? "all";
  const invalidRange = from > to;

  const projects = useMemo(() => {
    return data.projects.filter((project) => {
      if (projectId !== "all" && project.id !== projectId) return false;
      if (invalidRange) return false;
      return overlapsRange(project, from, to);
    });
  }, [data.projects, projectId, from, to, invalidRange]);

  const counts = countProjects(projects);
  const money = budgetTotals(projects);
  const delayed = projects.filter((project) => project.status === "delayed");
  const average = projects.length ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length) : 0;
  const chosen = projectId === "all" ? null : data.projectById(projectId);

  function projectHref(id: string) {
    const query = new URLSearchParams();
    if (from !== "2025-01-01") query.set("from", from);
    if (to !== "2027-12-31") query.set("to", to);
    if (id !== "all") query.set("project", id);
    const text = query.toString();
    return text ? `/admin/reports?${text}` : "/admin/reports";
  }

  const exportQuery = new URLSearchParams({ from, to });
  if (projectId !== "all") exportQuery.set("project", projectId);

  return (
    <div>
      <PageHeader
        title="Reports & analytics"
        description="Sample performance, workforce, and budget figures for this preview. Do not treat the amounts as company accounts."
        actions={<Button asChild><a href={`/api/reports?${exportQuery.toString()}`}><Download />Export CSV</a></Button>}
      />
      <div className="mb-4 rounded-[22px] border border-accent/30 bg-[#fff1eb] px-4 py-3 text-sm text-black">
        Demonstration data in RWF. The monthly trend is a fixed sample series. Project counts, progress, and budget bars follow the records currently in this session.
      </div>
      <form action="/admin/reports" method="get" data-report-form className="mb-4 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">From</span>
          <input key={from} name="from" type="date" defaultValue={from} aria-label="From" className="h-10 rounded-lg border border-input bg-white px-3 text-sm" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">To</span>
          <input key={to} name="to" type="date" defaultValue={to} aria-label="To" className="h-10 rounded-lg border border-input bg-white px-3 text-sm" />
        </label>
        <div className="grid gap-1 text-sm">
          <span className="font-medium">Project</span>
          <details className="relative">
            <summary className="flex h-10 cursor-pointer list-none items-center justify-between rounded-full border border-input bg-white px-3 text-sm [&::-webkit-details-marker]:hidden">
              <span>{chosen ? `${chosen.code} — ${chosen.name}` : "All projects"}</span>
              <span aria-hidden className="text-black/45">▾</span>
            </summary>
            <div className="absolute left-0 top-[calc(100%+6px)] z-[80] max-h-80 w-[min(100vw-2rem,22rem)] overflow-auto rounded-2xl border border-black/10 bg-white p-1 shadow-lg">
              <a href={projectHref("all")} className="block rounded-xl px-3 py-2 text-sm hover:bg-[#fff1eb]">All projects</a>
              {data.projects.map((project) => (
                <a key={project.id} href={projectHref(project.id)} className="block rounded-xl px-3 py-2 hover:bg-[#fff1eb]">
                  <span className="block text-sm font-medium">{project.code}</span>
                  <span className="block text-xs text-black/45">{project.name}</span>
                </a>
              ))}
            </div>
          </details>
        </div>
      </form>
      {chosen ? <ProjectRecord project={chosen} manager={data.managerName(chosen)} currency={data.settings.currency} tasks={data.tasks.filter((task) => task.projectId === chosen.id)} people={[...data.users.filter((user) => user.projectId === chosen.id || user.id === chosen.managerId).map((user) => `${user.firstName} ${user.lastName} · ${user.role.replaceAll("_", " ")}`), ...data.employees.filter((employee) => employee.projectId === chosen.id).map((employee) => `${employee.firstName} ${employee.lastName} · ${employee.position}`)]} documents={(data.documents ?? []).filter((item) => item.projectId === chosen.id).map((item) => `${item.number} · ${item.title}`)} reports={data.reports.filter((report) => report.projectId === chosen.id).map((report) => ({ id: report.id, summary: report.summary, status: report.status, at: report.submittedAt }))} /> : null}
      {invalidRange ? <p className="mb-4 text-sm text-destructive">The start of the range must be on or before the end.</p> : null}
      {chosen ? null : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Projects in range" value={String(counts.total)} />
        <Summary label="Average progress" value={`${average}%`} />
        <Summary label="Budget (demo)" value={formatMoney(money.budget, data.settings.currency)} />
        <Summary label="Spent (demo)" value={formatMoney(money.spent, data.settings.currency)} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ProjectStatusChart projects={projects} />
        {chosen ? null : <WorkforceChart users={data.users} />}
        {chosen ? null : <MonthlyActivityChart series={data.monthlyActivity} />}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Budget overview</h2>
          <p className="text-xs text-muted-foreground">Spent against budget. Demonstration figures only.</p>
          <ul className="mt-4 space-y-3">
            {projects.map((project) => {
              const ratio = project.budget === 0 ? 0 : Math.min(100, Math.round((project.spent / project.budget) * 100));
              return (
                <li key={project.id}>
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{project.code}</span>
                    <span className="text-muted-foreground">{formatMoney(project.spent, data.settings.currency)} / {formatMoney(project.budget, data.settings.currency)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-accent" style={{ width: `${ratio}%` }} />
                  </div>
                </li>
              );
            })}
            {projects.length === 0 ? <li className="text-sm text-muted-foreground">No projects in this range.</li> : null}
          </ul>
        </section>
      </div>
      <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Delayed projects</h2>
          <p className="text-xs text-muted-foreground">{delayed.length} in the current filter · completed in filter: {counts.completed}</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Progress</th>
                <th className="px-4 py-2 font-medium">Expected completion</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {delayed.map((project) => (
                <tr key={project.id} className="border-t border-border">
                  <td className="px-4 py-3">{project.name}</td>
                  <td className="px-4 py-3">{project.progress}%</td>
                  <td className="px-4 py-3">{project.expectedEndDate}</td>
                  <td className="px-4 py-3"><ProjectStatusBadge status={project.status} /></td>
                </tr>
              ))}
              {delayed.length === 0 ? <tr><td className="px-4 py-6 text-muted-foreground" colSpan={4}>No delayed projects in this filter.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      </>}
    </div>
  );
}

function ProjectRecord({
  project,
  manager,
  currency,
  tasks,
  people,
  documents,
  reports,
}: {
  project: { code: string; name: string; description: string; client: string; location: string; startDate: string; expectedEndDate: string; budget: number; spent: number; progress: number; status: "planning" | "active" | "on_hold" | "delayed" | "completed" };
  manager: string;
  currency: string;
  tasks: { id: string; title: string; assignee: string; dueDate: string; status: "todo" | "pending" | "done"; progress: number }[];
  people: string[];
  documents: string[];
  reports: { id: string; summary: string; status: string; at: string }[];
}) {
  const facts = [
    ["Client", project.client],
    ["Location", project.location],
    ["Manager", manager],
    ["Start", formatDate(project.startDate)],
    ["Expected completion", formatDate(project.expectedEndDate)],
    ["Budget", formatMoney(project.budget, currency)],
    ["Spent", formatMoney(project.spent, currency)],
    ["Remaining", formatMoney(project.budget - project.spent, currency)],
  ];
  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-black/45">{project.code}</p>
          <h2 className="text-lg font-semibold">{project.name}</h2>
          <p className="mt-2 max-w-2xl text-sm text-black/70">{project.description}</p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-black/45">
          <span>Project progress</span>
          <span className="font-medium text-black">{project.progress}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
          <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} />
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-light-gray px-3 py-2">
            <dt className="text-xs text-black/45">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <RecordList title="Activities" empty="No activities on this project.">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-2xl bg-light-gray px-3 py-2">
              <p className="text-sm font-medium">{task.title}</p>
              <p className="mt-1 text-xs text-black/45">{task.assignee} · due {formatDate(task.dueDate)} · task progress {task.progress}%</p>
              <div className="mt-2"><TaskStatusBadge status={task.status} /></div>
            </li>
          ))}
        </RecordList>
        <RecordList title="People" empty="Nobody is assigned to this project.">
          {people.map((person) => <li key={person} className="rounded-2xl bg-light-gray px-3 py-2 text-sm">{person}</li>)}
        </RecordList>
        <RecordList title="Documents" empty="No documents on this project.">
          {documents.map((item) => <li key={item} className="rounded-2xl bg-light-gray px-3 py-2 text-sm">{item}</li>)}
        </RecordList>
        <RecordList title="Site reports" empty="No site reports on this project.">
          {reports.map((report) => (
            <li key={report.id} className="rounded-2xl bg-light-gray px-3 py-2">
              <p className="text-sm">{report.summary}</p>
              <p className="mt-1 text-xs text-black/45">{report.status} · {formatDate(report.at)}</p>
            </li>
          ))}
        </RecordList>
      </div>
    </section>
  );
}

function RecordList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {Children.count(children) > 0 ? <ul className="mt-2 space-y-2">{children}</ul> : <p className="mt-2 text-sm text-black/55">{empty}</p>}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
