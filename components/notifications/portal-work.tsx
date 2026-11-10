"use client";

import { useSearchParams } from "next/navigation";
import { PmProgressChart } from "@/components/pm/progress-chart";
import { Button } from "@/components/ui/button";
import { expenditureFor, formatPercent, lineActual } from "@/lib/boq";
import { useAdmin } from "@/lib/data/admin-store";
import { accountStatusLabel, projectStatusLabel, roleLabel, taskStatusLabel } from "@/lib/labels";
import { formatDate, formatDateTime, formatMoney, fullName, PREVIEW_PM_ID } from "@/lib/utils";
import type { UserAccount, UserRole, WorkComment, WorkKind } from "@/types";

const reportStatus = { submitted: "Submitted", in_review: "In review", approved: "Approved", rejected: "Rejected" } as const;

type Portal = Extract<UserRole, "project_manager" | "site_engineer" | "quantity_surveyor">;

export function PortalWork({ portal, type }: { portal: Portal; type: string }) {
  const data = useAdmin();
  const params = useSearchParams();
  const comments = data.workComments ?? [];
  const people = data.users
    .filter((user) => user.role === portal)
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || fullName(a).localeCompare(fullName(b)));
  const events = portal === "project_manager" ? (data.calendarEvents ?? []) : [];
  const calendarManager = data.users.find((user) => user.id === PREVIEW_PM_ID);

  return (
    <div className="mb-8 space-y-4">
      {params.get("error") ? <p className="rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">{params.get("error")}</p> : null}
      {params.get("commented") === "1" ? (
        <p className="rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">Comment sent. Only the project manager of that work can see it.</p>
      ) : null}
      <p className="text-sm text-black/55">
        {roleLabel[portal]} dashboard and the work filed on that portal. A comment is delivered only to the project manager of that work.
      </p>
      {people.map((person) => (
        <Person key={person.id} person={person} portal={portal} type={type} comments={comments} />
      ))}
      {events.length > 0 ? (
        <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Calendar</h2>
          <ul className="mt-2 divide-y divide-black/5">
            {events.map((event) => (
              <WorkRow
                key={event.id}
                id={event.id}
                kind="event"
                portal={portal}
                type={type}
                title={`${event.kind === "meeting" ? "Meeting" : "Event"} · ${event.title}`}
                meta={formatDate(event.date)}
                manager={calendarManager ? fullName(calendarManager) : "the project manager"}
                comments={comments.filter((item) => item.kind === "event" && item.workId === event.id)}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Person({ person, portal, type, comments }: { person: UserAccount; portal: Portal; type: string; comments: WorkComment[] }) {
  const data = useAdmin();
  const name = fullName(person);
  const project = data.projects.find((item) => item.id === person.projectId) ?? null;
  const managed = data.projects.filter((item) => item.managerId === person.id);
  const managedIds = new Set(managed.map((item) => item.id));
  const tasks = data.tasks.filter((task) => (
    portal === "project_manager" ? managedIds.has(task.projectId) : task.assignee === name
  ));
  const reports = data.reports.filter((report) => (
    portal === "project_manager" ? managedIds.has(report.projectId) : report.engineerId === person.id
  ));
  const costs = (data.costReports ?? []).filter((report) => (
    portal === "project_manager" ? managedIds.has(report.projectId) : report.submittedBy === person.id
  ));
  const marks = (data.progressMarks ?? []).filter((mark) => managedIds.has(mark.projectId));
  const lines = data.boq.filter((line) => line.projectId === project?.id);
  const expenditure = project ? expenditureFor(lines, project.id) : 0;
  const openTasks = tasks.filter((task) => task.status !== "done").length;

  const groups = portal === "project_manager"
    ? [
        group("Projects", managed.map((item) => ({
          id: item.id,
          kind: "project" as const,
          title: `${item.code} · ${item.name}`,
          meta: `${projectStatusLabel[item.status]} · ${item.progress}% · ${formatMoney(item.spent)} of ${formatMoney(item.budget)} · ${item.location}`,
          projectId: item.id,
        }))),
        group("Tasks", tasks.map((task) => ({
          id: task.id,
          kind: "task" as const,
          title: task.title,
          meta: `${task.assignee} · ${task.progress}% · ${taskStatusLabel[task.status]} · due ${formatDate(task.dueDate)}`,
          projectId: task.projectId,
        }))),
        group("Engineer reports", reports.map((report) => ({
          id: report.id,
          kind: "report" as const,
          title: report.summary,
          meta: `${nameOf(data, report.engineerId)} · ${reportStatus[report.status]} · ${report.progress}% · ${formatDate(report.submittedAt)}`,
          projectId: report.projectId,
        }))),
        group("Cost statements", costs.map((report) => ({
          id: report.id,
          kind: "cost" as const,
          title: report.status === "pending" ? "Statement with the project manager" : "Statement submitted to the administrator",
          meta: `${report.submittedAt ? formatDateTime(report.submittedAt) : "Undated"} · ${report.lines.length} lines`,
          projectId: report.projectId,
        }))),
        group("Progress marks", marks.map((mark) => ({
          id: mark.id,
          kind: "progress" as const,
          title: `${data.projects.find((item) => item.id === mark.projectId)?.code ?? "Project"} marked at ${mark.progress}%`,
          meta: `From ${mark.previous}%${mark.note ? ` · ${mark.note}` : ""} · ${formatDateTime(mark.recordedAt)}`,
          projectId: mark.projectId,
        }))),
      ]
    : portal === "site_engineer"
      ? [
          group("Site", project ? [{
            id: project.id,
            kind: "project" as const,
            title: `${project.code} · ${project.name}`,
            meta: `${projectStatusLabel[project.status]} · ${project.progress}% · ${project.location}`,
            projectId: project.id,
          }] : []),
          group("Assigned tasks", tasks.map((task) => ({
            id: task.id,
            kind: "task" as const,
            title: task.title,
            meta: `${task.progress}% · ${taskStatusLabel[task.status]} · due ${formatDate(task.dueDate)}`,
            projectId: task.projectId,
          }))),
          group("Daily reports", reports.map((report) => ({
            id: report.id,
            kind: "report" as const,
            title: report.summary,
            meta: `${reportStatus[report.status]} · ${report.progress}% · ${formatDate(report.periodStart)} · ${formatDateTime(report.submittedAt)}`,
            projectId: report.projectId,
          }))),
        ]
      : [
          group("Project", project ? [{
            id: project.id,
            kind: "project" as const,
            title: `${project.code} · ${project.name}`,
            meta: `Budget ${formatMoney(project.budget)} · measured ${formatMoney(expenditure)} · ${formatPercent(project.budget, expenditure)} used`,
            projectId: project.id,
          }] : []),
          group("Bill of quantities", lines.map((line) => ({
            id: line.id,
            kind: "boq" as const,
            title: `${line.code} · ${line.description}`,
            meta: `${line.actualQty} / ${line.estimatedQty} ${line.unit} · ${formatMoney(lineActual(line))} measured`,
            projectId: line.projectId,
          }))),
          group("Statements sent", costs.map((report) => ({
            id: report.id,
            kind: "cost" as const,
            title: report.status === "pending" ? "Sent to the project manager" : "Submitted onward",
            meta: `${report.submittedAt ? formatDateTime(report.submittedAt) : "Undated"} · ${report.lines.length} lines`,
            projectId: report.projectId,
          }))),
        ];

  return (
    <section id={person.id} className="scroll-mt-28 rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-black/45">{roleLabel[person.role]} · {accountStatusLabel[person.status]}</p>
          <h2 className="text-base font-semibold">{name}</h2>
          <p className="mt-1 text-sm text-black/55">{person.email}{project ? ` · ${project.code}` : ""}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {portal === "project_manager" ? (
          <>
            <Stat label="Projects" value={managed.length} />
            <Stat label="Open tasks" value={openTasks} />
            <Stat label="Engineer reports" value={reports.length} />
            <Stat label="Cost statements" value={costs.length} />
          </>
        ) : portal === "site_engineer" ? (
          <>
            <Stat label="Site progress" value={project ? `${project.progress}%` : "—"} />
            <Stat label="Open tasks" value={openTasks} />
            <Stat label="Reports filed" value={reports.length} />
            <Stat label="Sent back" value={reports.filter((report) => report.status === "rejected").length} />
          </>
        ) : (
          <>
            <Stat label="Budget" value={project ? formatMoney(project.budget) : "—"} />
            <Stat label="Expenditure" value={project ? formatMoney(expenditure) : "—"} />
            <Stat label="Budget use" value={project ? formatPercent(project.budget, expenditure) : "—"} />
            <Stat label="Bill lines" value={lines.length} />
          </>
        )}
      </div>
      {portal === "site_engineer" && project ? (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-black/45">
            <span>{project.code} recorded progress</span>
            <span className="tabular-nums text-black">{project.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-accent" style={{ width: `${project.progress}%` }} />
          </div>
        </div>
      ) : null}
      {portal === "project_manager" && managed.length > 0 ? (
        <div className="mt-4">
          <PmProgressChart projects={managed} marks={marks} />
        </div>
      ) : null}
      <div className="mt-4 space-y-4">
        {groups.map((entry) => (
          <div key={entry.title}>
            <h3 className="text-sm font-semibold">{entry.title}</h3>
            {entry.rows.length === 0 ? <p className="mt-1 text-sm text-black/45">Nothing on this list.</p> : (
              <ul className="mt-1 divide-y divide-black/5">
                {entry.rows.map((row) => (
                  <WorkRow
                    key={`${row.kind}-${row.id}`}
                    {...row}
                    portal={portal}
                    type={type}
                    manager={managerName(data, row.projectId)}
                    comments={comments.filter((item) => item.kind === row.kind && item.workId === row.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function group<T>(title: string, rows: T[]) {
  return { title, rows };
}

function nameOf(data: ReturnType<typeof useAdmin>, id: string) {
  const user = data.users.find((item) => item.id === id);
  return user ? fullName(user) : "Site engineer";
}

function managerName(data: ReturnType<typeof useAdmin>, projectId: string) {
  const project = data.projects.find((item) => item.id === projectId);
  const manager = data.users.find((user) => user.id === project?.managerId);
  return manager ? fullName(manager) : "the project manager";
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-light-gray px-3 py-3">
      <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-black/45">{label}</p>
    </div>
  );
}

function WorkRow({
  id,
  kind,
  title,
  meta,
  portal,
  type,
  manager,
  comments,
}: {
  id: string;
  kind: WorkKind;
  title: string;
  meta: string;
  portal: Portal;
  type: string;
  manager: string;
  comments: WorkComment[];
}) {
  return (
    <li id={id} className="scroll-mt-28 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-black/45">{meta}</p>
        </div>
      </div>
      {comments.map((comment) => (
        <p key={comment.id} className="mt-2 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">
          Sent to {manager}: {comment.body}
          <span className="ml-2 text-xs text-black/45">{formatDateTime(comment.createdAt)} · only they can see it</span>
        </p>
      ))}
      <form action="/api/admin/comments" method="post" className="mt-2 flex flex-wrap gap-2">
        <input type="hidden" name="portal" value={portal} />
        {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="workId" value={id} />
        <input
          name="body"
          required
          minLength={3}
          maxLength={500}
          placeholder={`Comment for ${manager}`}
          aria-label={`Comment for ${manager} on ${title}`}
          className="h-10 min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <Button type="submit" size="sm">Comment</Button>
      </form>
    </li>
  );
}
