"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmploymentBadge, PriorityBadge, ProjectStatusBadge, TaskStatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { lineActual, lineEstimate, lineVariance } from "@/lib/boq";
import { useAdmin } from "@/lib/data/admin-store";
import { documentCategoryLabel, issuedRevision, issueWarning, latestRevision, standing, standingLabel } from "@/lib/documents";
import { portalUrl } from "@/lib/portals";
import { roleLabel } from "@/lib/labels";
import {
  milestoneState,
  plannedProgress,
  workspaceFor,
  type ProjectEquipment,
} from "@/lib/project-workspace";
import { DEMO_TODAY, PREVIEW_PM_ID, PREVIEW_QS_ID, PREVIEW_SE_ID, daysUntil, formatDate, formatDateTime, formatMoney, fullName } from "@/lib/utils";
import type { EngineerReport, EngineerReportStatus } from "@/types";

const sections = [
  ["overview", "Overview"],
  ["schedule", "Schedule"],
  ["tasks", "Tasks"],
  ["progress", "Progress"],
  ["workforce", "Workforce"],
  ["materials", "Materials"],
  ["equipment", "Equipment"],
  ["budget", "Budget"],
  ["documents", "Documents"],
  ["risks", "Risks & Issues"],
  ["reports", "Reports"],
] as const;

const reportStatusLabel: Record<EngineerReportStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

const equipmentLabel: Record<ProjectEquipment["status"], string> = {
  on_site: "On site",
  idle: "Idle",
  off_hire: "Off hire",
};

const milestoneLabel = { done: "Done", due: "Due", overdue: "Overdue", upcoming: "Upcoming" } as const;
const riskKindLabel = { delay: "Delay", issue: "Issue" } as const;
const riskStatusLabel = { open: "Open", mitigating: "Mitigating", closed: "Closed" } as const;
const riskSeverityLabel = { low: "Low", medium: "Medium", high: "High" } as const;

function qty(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export function ProjectWorkspace({ portal }: { portal: "admin" | "pm" | "se" | "qs" }) {
  const params = useParams<{ id: string }>();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const data = useAdmin();
  const project = data.projects.find((item) => item.id === projectId) ?? null;
  const back = portal === "admin" ? "/admin/projects" : portal === "pm" ? "/pm/projects" : portal === "se" ? "/se" : "/qs";
  const scopedId = portal === "se" ? PREVIEW_SE_ID : portal === "qs" ? PREVIEW_QS_ID : null;
  const scopedProjectId = scopedId ? data.users.find((user) => user.id === scopedId)?.projectId : null;
  const allowed = portal === "admin" || (portal === "pm" && project?.managerId === PREVIEW_PM_ID) || (scopedProjectId != null && scopedProjectId === project?.id);

  if (!project || !allowed) {
    return (
      <div>
        <PageHeader title="Project not found" description="That record is not on this portal." />
        <Link href={back} className="text-sm font-medium text-accent hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  const pack = workspaceFor(project.id);
  const currency = data.settings.currency;
  const manager = data.users.find((user) => user.id === project.managerId) ?? null;
  const tasks = data.tasks.filter((task) => task.projectId === project.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const reports = data.reports.filter((report) => report.projectId === project.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const bill = data.boq.filter((item) => item.projectId === project.id).sort((a, b) => a.code.localeCompare(b.code));
  const filed = (data.costReports ?? [])
    .filter((report) => report.projectId === project.id && report.status === "submitted")
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))[0];
  const accounts = data.users.filter((user) => user.projectId === project.id);
  const crew = data.employees.filter((employee) => employee.projectId === project.id);
  const planned = plannedProgress(project.startDate, project.expectedEndDate);
  const slip = project.progress - planned;
  const variance = project.spent - project.budget;
  const remaining = project.budget - project.spent;
  const days = daysUntil(project.expectedEndDate);

  return (
    <div>
      <Link href={back} className="mb-3 inline-flex items-center gap-1 text-sm text-black/55 hover:text-black">
        <ArrowLeft className="size-4" />
        Projects
      </Link>
      <PageHeader
        title={project.name}
        description={`${project.code} · ${project.client} · ${project.location}`}
        actions={<ProjectStatusBadge status={project.status} />}
      />
      <div className="lg:grid lg:grid-cols-[196px_minmax(0,1fr)] lg:items-start lg:gap-4">
        <nav className="mb-4 flex gap-1 overflow-x-auto lg:sticky lg:top-28 lg:mb-0 lg:flex-col lg:overflow-visible">
          {sections.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="shrink-0 rounded-xl px-3 py-2 text-xs font-medium text-black/70 hover:bg-white">
              {label}
            </a>
          ))}
        </nav>
        <div className="space-y-4">
          <Section id="overview" title="Overview" hint="Identity of the job, who it is for, and who is running it.">
            <p className="text-sm leading-6">{project.description}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Fact label="Client" value={project.client} />
              <Fact label="Location" value={project.location} />
              <Fact label="Manager" value={manager ? fullName(manager) : "Unassigned"} />
              <Fact label="Manager email" value={manager?.email ?? "—"} />
              <Fact label="Code" value={project.code} />
              <Fact label="Registered" value={formatDate(project.createdAt)} />
            </div>
          </Section>

          <Section id="schedule" title="Schedule" hint="Contract dates and the milestone register.">
            <div className="grid gap-2 sm:grid-cols-3">
              <Fact label="Start" value={formatDate(project.startDate)} />
              <Fact label="Expected completion" value={formatDate(project.expectedEndDate)} />
              <Fact label="Against 6 Nov 2026" value={days < 0 ? `${Math.abs(days)} days past the date` : `${days} days left`} />
            </div>
            {portal === "pm" ? (
              <Link href={`/pm/schedule?project=${project.id}`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                Open the programme
              </Link>
            ) : null}
            <Table
              className="mt-4"
              empty="No milestones on this project."
              head={["Milestone", "Planned", "Actual", "Status"]}
              rows={pack.milestones.map((item) => {
                const state = milestoneState(item);
                return [
                  item.name,
                  formatDate(item.plannedDate),
                  item.actualDate ? formatDate(item.actualDate) : "—",
                  <Badge key={item.id} tone={state === "overdue" ? "red" : state === "done" ? "green" : state === "due" ? "amber" : "slate"}>
                    {milestoneLabel[state]}
                  </Badge>,
                ];
              })}
            />
          </Section>

          <Section id="tasks" title="Tasks" hint="Activities assigned on this project.">
            <Table
              empty="No tasks on this project."
              head={["Activity", "Assignee", "Due", "Priority", "Status", "Progress"]}
              rows={tasks.map((task) => [
                task.title,
                task.assignee,
                formatDate(task.dueDate),
                <PriorityBadge key={`${task.id}-p`} priority={task.priority} />,
                <TaskStatusBadge key={`${task.id}-s`} status={task.status} />,
                `${task.progress}%`,
              ])}
            />
          </Section>

          <Section id="progress" title="Progress" hint={`Planned progress is the share of calendar time from the start date to ${formatDate(DEMO_TODAY)}. Actual progress is the figure on the project.`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Meter label="Planned" value={`${planned}%`} width={planned} tone="black" />
              <Meter label="Actual" value={`${project.progress}%`} width={project.progress} tone="accent" />
              <Fact label="Variance" value={<span className={slip < 0 ? "text-accent" : undefined}>{slip > 0 ? "+" : ""}{slip} pts</span>} />
            </div>
          </Section>

          <Section id="workforce" title="Workforce" hint="Accounts and employees assigned here, plus the labour gangs on the programme.">
            <Table
              empty="No named people are assigned."
              head={["Person", "Role", "Kind", "Status"]}
              rows={[
                ...(manager ? [[fullName(manager), "Project manager", "Account", <Badge key="mgr" tone="green">Active</Badge>]] : []),
                ...accounts
                  .filter((user) => user.id !== project.managerId)
                  .map((user) => [fullName(user), roleLabel[user.role], "Account", <Badge key={user.id} tone={user.status === "active" ? "green" : "slate"}>{user.status === "active" ? "Active" : "Inactive"}</Badge>]),
                ...crew.map((employee) => [fullName(employee), employee.position, employee.department, <EmploymentBadge key={employee.id} status={employee.status} />]),
              ]}
            />
            <h3 className="mt-4 text-sm font-semibold">Labour</h3>
            <Table
              className="mt-2"
              empty="No labour gangs recorded."
              head={["Trade", "Planned", "On site", "Short"]}
              rows={pack.labour.map((gang) => {
                const short = gang.planned - gang.onSite;
                return [gang.trade, String(gang.planned), String(gang.onSite), <span key={gang.id} className={short > 0 ? "text-accent" : undefined}>{short}</span>];
              })}
            />
          </Section>

          <Section id="materials" title="Materials" hint="Required on the programme, received into the store, and consumed on site.">
            <Table
              empty="No material register for this project."
              head={["Material", "Unit", "Required", "Received", "Consumed", "Balance", "Still to receive"]}
              rows={pack.materials.map((item) => {
                const gap = item.required - item.received;
                return [
                  item.name,
                  item.unit,
                  qty(item.required),
                  qty(item.received),
                  qty(item.consumed),
                  qty(item.received - item.consumed),
                  <span key={item.id} className={gap > 0 ? "text-accent" : undefined}>{qty(gap)}</span>,
                ];
              })}
            />
          </Section>

          <Section id="equipment" title="Equipment" hint="Plant assigned to the project.">
            <Table
              empty="No equipment assigned."
              head={["Item", "Code", "Status", "Operator", "Assigned"]}
              rows={pack.equipment.map((item) => [
                item.name,
                item.code,
                <Badge key={item.id} tone={item.status === "on_site" ? "green" : item.status === "idle" ? "amber" : "slate"}>{equipmentLabel[item.status]}</Badge>,
                item.operator,
                formatDate(item.assignedOn),
              ])}
            />
          </Section>

          <Section id="budget" title="Budget" hint="Contract budget against recorded expenditure. Figures are demonstration data in RWF.">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Fact label="Budget" value={formatMoney(project.budget, currency)} />
              <Fact label="Expenditure" value={formatMoney(project.spent, currency)} />
              <Fact label="Remaining" value={<span className={remaining < 0 ? "text-accent" : undefined}>{formatMoney(remaining, currency)}</span>} />
              <Fact label="Variance" value={<span className={variance > 0 ? "text-accent" : undefined}>{formatMoney(variance, currency)}</span>} />
            </div>
            <p className="mt-3 text-xs text-black/45">
              {filed?.submittedAt ? `Cost report submitted ${formatDateTime(filed.submittedAt)}.` : "No cost report submitted."}
            </p>
            {bill.length > 0 ? (
              <Table
                className="mt-4"
                empty=""
                head={["Code", "Description", "Estimate", "Measured", "Variance"]}
                rows={bill.map((item) => {
                  const line = lineVariance(item);
                  return [
                    item.code,
                    item.description,
                    formatMoney(lineEstimate(item), currency),
                    formatMoney(lineActual(item), currency),
                    <span key={item.id} className={line > 0 ? "text-accent" : undefined}>{formatMoney(line, currency)}</span>,
                  ];
                })}
              />
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No measured bill on this project.</p>
            )}
          </Section>

          <Section id="documents" title="Documents" hint="Controlled revisions for this project. Build from the issued revision only.">
            <a
              href={portal === "admin" ? `/admin/documents?project=${project.id}` : portalUrl("administrator", `/admin/documents?project=${project.id}`)}
              className="mb-3 inline-block text-sm font-medium text-accent hover:underline"
            >
              Open the register
            </a>
            <Table
              empty="No documents filed."
              head={["Number", "Document", "Category", "Latest", "Issued"]}
              rows={(data.documents ?? [])
                .filter((item) => item.projectId === project.id)
                .map((item) => {
                  const latest = latestRevision(item);
                  const issued = issuedRevision(item);
                  const state = latest ? standing(item, latest) : "draft";
                  return [
                    item.number,
                    item.title,
                    documentCategoryLabel[item.category],
                    latest ? `Rev ${latest.revision} · ${standingLabel[state]}` : "—",
                    issued ? `Rev ${issued.revision}` : issueWarning(item) ? "Not issued" : "—",
                  ];
                })}
            />
          </Section>

          <Section id="risks" title="Risks & issues" hint="Delays and site issues, with the mitigation that is on record.">
            <div className="space-y-2">
              {pack.risks.length === 0 ? <p className="text-sm text-muted-foreground">No open or closed items.</p> : null}
              {pack.risks.map((item) => (
                <article key={item.id} className="rounded-2xl bg-light-gray px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <Badge tone="slate">{riskKindLabel[item.kind]}</Badge>
                    <Badge tone={item.severity === "high" ? "red" : item.severity === "medium" ? "amber" : "slate"}>{riskSeverityLabel[item.severity]}</Badge>
                    <Badge tone={item.status === "closed" ? "green" : item.status === "mitigating" ? "amber" : "red"}>{riskStatusLabel[item.status]}</Badge>
                  </div>
                  <p className="mt-2 text-sm">{item.impact}</p>
                  <p className="mt-1 text-sm text-black/60">{item.mitigation}</p>
                  <p className="mt-2 text-xs text-black/45">Owner · {item.owner}</p>
                </article>
              ))}
            </div>
          </Section>

          <Section
            id="reports"
            title="Reports"
            hint="Daily and period site reports, with the approval decision when one has been made."
          >
            {portal === "pm" ? (
              <Link href="/pm/reports" className="mb-3 inline-block text-sm font-medium text-accent hover:underline">
                Open the report queue
              </Link>
            ) : null}
            <div className="space-y-2">
              {reports.length === 0 ? <p className="text-sm text-muted-foreground">No site reports filed.</p> : null}
              {reports.map((report) => (
                <ReportCard key={report.id} report={report} engineer={data.users.find((user) => user.id === report.engineerId)} reviewer={data.users.find((user) => user.id === report.reviewerId)} />
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function ReportCard({
  report,
  engineer,
  reviewer,
}: {
  report: EngineerReport;
  engineer: { firstName: string; lastName: string } | undefined;
  reviewer: { firstName: string; lastName: string } | undefined;
}) {
  return (
    <article className="rounded-2xl bg-light-gray px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {formatDate(report.periodStart)} – {formatDate(report.periodEnd)}
        </p>
        <Badge tone={report.status === "rejected" ? "red" : report.status === "approved" ? "green" : "amber"}>{reportStatusLabel[report.status]}</Badge>
      </div>
      <p className="mt-1 text-xs text-black/45">
        {engineer ? fullName(engineer) : "Site engineer"} · filed {formatDateTime(report.submittedAt)} · {report.progress}%
      </p>
      <p className="mt-2 text-sm">{report.summary}</p>
      {report.issues ? <p className="mt-1 text-sm text-black/60">{report.issues}</p> : null}
      {report.reviewedAt ? (
        <p className="mt-2 text-xs text-black/45">
          {reportStatusLabel[report.status]} {formatDateTime(report.reviewedAt)}
          {reviewer ? ` by ${fullName(reviewer)}` : ""}
          {report.decisionNote ? ` — ${report.decisionNote}` : ""}
        </p>
      ) : (
        <p className="mt-2 text-xs text-black/45">Waiting for a decision.</p>
      )}
    </article>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-light-gray px-3 py-3">
      <p className="text-xs text-black/45">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function Meter({ label, value, width, tone }: { label: string; value: string; width: number; tone: "black" | "accent" }) {
  return (
    <div className="rounded-2xl bg-light-gray px-3 py-3">
      <div className="flex items-center justify-between gap-2 text-xs text-black/45">
        <span>{label}</span>
        <span className="font-medium text-black">{value}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
        <div className={tone === "accent" ? "h-full bg-accent" : "h-full bg-black"} style={{ width: `${Math.max(0, Math.min(100, width))}%` }} />
      </div>
    </div>
  );
}

function Table({
  head,
  rows,
  empty,
  className,
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
  className?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className={`overflow-x-auto ${className ?? ""}`}>
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-[11px] text-muted-foreground">
          <tr>
            {head.map((label) => (
              <th key={label} className="px-2 py-2 font-medium tracking-wide uppercase">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-black/5">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-2 py-2 align-middle">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
