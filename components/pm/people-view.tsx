"use client";

import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { billLines, linesActual } from "@/lib/boq";
import { usePm } from "@/lib/data/admin-store";
import { roleLabel, taskStatusLabel } from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney, fullName } from "@/lib/utils";
import type { EngineerReport, EngineerReportStatus, UserAccount } from "@/types";

const reportLabel: Record<EngineerReportStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

export function PmPeople() {
  const data = usePm();
  const params = useSearchParams();
  const selectedId = params.get("person");
  const projectIds = new Set(data.projects.map((project) => project.id));
  const engineers = data.users.filter(
    (user) =>
      user.role === "site_engineer" &&
      user.status === "active" &&
      ((user.projectId && projectIds.has(user.projectId)) ||
        data.reports.some((report) => report.engineerId === user.id) ||
        data.tasks.some((task) => task.assignee === fullName(user))),
  );
  const surveyors = data.surveyors;
  const people = [...engineers, ...surveyors];
  const selected = people.find((user) => user.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader
        title="Team review"
        description="Site engineers and quantity surveyors on your projects. Open a person to review the tasks assigned to them and the reports they sent."
      />
      <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Roster title="Site engineers" people={engineers} selectedId={selectedId} data={data} />
          <Roster title="Quantity surveyors" people={surveyors} selectedId={selectedId} data={data} />
        </div>
        {selected ? <PersonReview person={selected} data={data} /> : (
          <p className="rounded-[22px] border border-black/5 bg-card p-5 text-sm text-black/55">Select a site engineer or quantity surveyor.</p>
        )}
      </div>
    </div>
  );
}

function Roster({
  title,
  people,
  selectedId,
  data,
}: {
  title: string;
  people: UserAccount[];
  selectedId: string | null;
  data: ReturnType<typeof usePm>;
}) {
  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-3">
      <h2 className="px-2 py-1 text-sm font-semibold">{title}</h2>
      {people.length === 0 ? <p className="px-2 py-2 text-sm text-muted-foreground">None on your projects.</p> : (
        <ul>
          {people.map((person) => {
            const tasks = tasksFor(person, data).length;
            const reports = person.role === "quantity_surveyor" ? costCount(person, data) : engineerReports(person, data).length;
            const active = person.id === selectedId;
            return (
              <li key={person.id}>
                <a
                  href={`/pm/people?person=${person.id}`}
                  className={active ? "block rounded-2xl bg-[#fff1eb] px-3 py-2" : "block rounded-2xl px-3 py-2 hover:bg-[#e6e6e6]"}
                >
                  <span className="block text-sm font-medium">{fullName(person)}</span>
                  <span className="block text-xs text-black/45">{count(tasks, "task")} · {count(reports, "report")}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PersonReview({ person, data }: { person: UserAccount; data: ReturnType<typeof usePm> }) {
  const project = data.projectById(person.projectId);
  const tasks = tasksFor(person, data);
  const reports = engineerReports(person, data);
  const costs = person.role === "quantity_surveyor" ? data.costReports.filter((report) => report.projectId === person.projectId) : [];
  const bill = person.role === "quantity_surveyor" && person.projectId ? billLines(data.boq, person.projectId) : [];

  return (
    <div className="space-y-4">
      <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{fullName(person)}</h2>
          <Badge tone="amber">{roleLabel[person.role]}</Badge>
        </div>
        <p className="mt-1 text-sm text-black/55">
          {project ? `${project.code} · ${project.name}` : "No project assigned"} · {person.email}
        </p>
      </section>

      <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Assigned tasks</h2>
        {tasks.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No tasks assigned.</p> : (
          <ul className="mt-3 divide-y divide-black/5">
            {tasks.map((task) => {
              const taskProject = data.projectById(task.projectId);
              return (
                <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-black/45">{taskProject?.code} · due {formatDate(task.dueDate)} · {task.progress}%</p>
                  </div>
                  <span className="text-xs font-medium">{taskStatusLabel[task.status]}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{person.role === "quantity_surveyor" ? "Cost reports" : "Site reports"}</h2>
          <a href={person.role === "quantity_surveyor" ? "/pm/costs" : "/pm/reports"} className="text-sm font-medium text-accent">
            {person.role === "quantity_surveyor" ? "Open cost reports" : "Open engineer reports"}
          </a>
        </div>
        {person.role === "site_engineer" ? (
          reports.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No reports filed.</p> : (
            <ul className="mt-3 space-y-3">
              {reports.map((report) => <EngineerReportRow key={report.id} report={report} data={data} />)}
            </ul>
          )
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-black/55">
              {bill.length} measured lines · {formatMoney(linesActual(bill))} actual
            </p>
            {costs.length === 0 ? <p className="text-sm text-muted-foreground">No cost report submitted yet.</p> : costs.map((report) => (
              <p key={report.id} className="text-sm">
                Submitted {report.submittedAt ? formatDateTime(report.submittedAt) : "—"} · {report.lines.length} lines
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EngineerReportRow({ report, data }: { report: EngineerReport; data: ReturnType<typeof usePm> }) {
  const project = data.projectById(report.projectId);
  return (
    <li className="rounded-2xl bg-[#e6e6e6]/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{project?.code}</p>
        <Badge tone={report.status === "rejected" ? "red" : report.status === "approved" ? "green" : "amber"}>{reportLabel[report.status]}</Badge>
        <a href={`/pm/reports#${report.id}`} className="ml-auto text-sm font-medium text-accent">Review</a>
      </div>
      <p className="mt-1 text-sm">{report.summary}</p>
      <p className="mt-1 text-xs text-black/45">{formatDate(report.periodStart)} – {formatDate(report.periodEnd)} · {report.progress}%</p>
      {report.decisionNote ? <p className="mt-1 text-xs text-black/55">Your comment: {report.decisionNote}</p> : null}
    </li>
  );
}

function tasksFor(person: UserAccount, data: ReturnType<typeof usePm>) {
  const name = fullName(person);
  return data.tasks.filter((task) => task.assignee === name).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function count(value: number, word: string) {
  return `${value} ${word}${value === 1 ? "" : "s"}`;
}

function engineerReports(person: UserAccount, data: ReturnType<typeof usePm>) {
  return data.reports.filter((report) => report.engineerId === person.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

function costCount(person: UserAccount, data: ReturnType<typeof usePm>) {
  const filed = data.costReports.filter((report) => report.projectId === person.projectId).length;
  if (filed > 0) return filed;
  return person.projectId && billLines(data.boq, person.projectId).length > 0 ? 1 : 0;
}
