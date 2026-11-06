"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { MonthlyActivityChart } from "@/components/dashboard/monthly-activity-chart";
import { ProjectStatusChart } from "@/components/dashboard/project-status-chart";
import { WorkforceChart } from "@/components/dashboard/workforce-chart";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdmin } from "@/lib/data/admin-store";
import { budgetTotals, countProjects, overlapsRange } from "@/lib/metrics";
import { downloadCsv, formatMoney } from "@/lib/utils";

export function ReportsView() {
  const data = useAdmin();
  const [from, setFrom] = useState("2025-01-01");
  const [to, setTo] = useState("2027-12-31");
  const [projectId, setProjectId] = useState("all");
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

  function exportCsv() {
    downloadCsv("cpmis-project-report-demo.csv", projects.map((project) => ({
      Code: project.code,
      Name: project.name,
      Status: project.status,
      Progress: project.progress,
      BudgetUSD_demo: project.budget,
      SpentUSD_demo: project.spent,
      Manager: data.managerName(project),
      Location: project.location,
      Start: project.startDate,
      ExpectedCompletion: project.expectedEndDate,
    })));
    toast.success("Downloaded the filtered demonstration report.");
  }

  return (
    <div>
      <PageHeader
        title="Reports & analytics"
        description="Sample performance, workforce, and budget figures for this preview. Do not treat the amounts as company accounts."
        actions={<Button type="button" onClick={exportCsv} disabled={projects.length === 0}><Download />Export CSV</Button>}
      />
      <div className="mb-4 rounded-[22px] border border-accent/30 bg-[#fff1eb] px-4 py-3 text-sm text-black">
        Demonstration data in USD. The monthly trend is a fixed sample series. Project counts, progress, and budget bars follow the records currently in this session.
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">From</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">To</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Project</span>
          <select aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 rounded-lg border border-input bg-white px-3 text-sm">
            <option value="all">All projects</option>
            {data.projects.map((project) => <option key={project.id} value={project.id}>{project.code}</option>)}
          </select>
        </label>
      </div>
      {invalidRange ? <p className="mb-4 text-sm text-destructive">The start of the range must be on or before the end.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Projects in range" value={String(counts.total)} />
        <Summary label="Average progress" value={`${average}%`} />
        <Summary label="Budget (demo)" value={formatMoney(money.budget)} />
        <Summary label="Spent (demo)" value={formatMoney(money.spent)} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ProjectStatusChart projects={projects} />
        <WorkforceChart users={data.users} />
        <MonthlyActivityChart series={data.monthlyActivity} />
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
                    <span className="text-muted-foreground">{formatMoney(project.spent)} / {formatMoney(project.budget)}</span>
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
