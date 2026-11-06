"use client";

import Link from "next/link";
import { Camera, ClipboardCheck, ListTodo, TriangleAlert } from "lucide-react";
import { ProjectStatusBadge, TaskStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useSiteEngineer } from "@/lib/data/admin-store";
import { DEMO_TODAY, cn, daysUntil, formatDate } from "@/lib/utils";

export function SeToday() {
  const data = useSiteEngineer();
  const project = data.project;
  const open = data.tasks.filter((task) => task.status !== "done").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const rejected = data.reports.filter((report) => report.status === "rejected");
  const firstName = data.actor?.firstName ?? "there";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName}</h1>
          <p className="mt-1 text-sm text-black/45">{formatDate(DEMO_TODAY)}. File the shift before you leave the gate.</p>
        </div>
        <Button asChild>
          <Link href="/se/report">
            <Camera /> File today’s report
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat href="/se/tasks" icon={ListTodo} value={open.length} label="Open tasks" />
        <Stat href="/se/history" icon={TriangleAlert} value={rejected.length} label="Sent back" warn={rejected.length > 0} />
        <Stat href="/se" icon={ClipboardCheck} value={data.reports.length} label="Reports filed" />
        <Stat href="/se" icon={Camera} value={project ? `${project.progress}%` : "—"} label="Site progress" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.85fr)]">
        <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
          {project ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-black/45">{project.code}</p>
                  <h2 className="text-base font-semibold">{project.name}</h2>
                  <p className="mt-1 text-sm text-black/55">{project.location}</p>
                </div>
                <ProjectStatusBadge status={project.status} />
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-black/45">
                  <span>Recorded progress</span>
                  <span className="tabular-nums text-black">{project.progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${project.progress}%` }} />
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm">No project is assigned to this account.</p>
          )}

          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Your open tasks</h3>
            <Link href="/se/tasks" className="text-sm font-medium text-accent">Update</Link>
          </div>
          <ul className="mt-3 divide-y divide-black/5">
            {open.length === 0 ? <li className="py-3 text-sm text-black/45">Nothing is still open.</li> : null}
            {open.map((task) => {
              const days = daysUntil(task.dueDate);
              return (
                <li key={task.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="mt-0.5 text-xs text-black/45">
                      {task.progress}% · due {formatDate(task.dueDate)} · {days < 0 ? `${Math.abs(days)}d late` : `${days}d`}
                    </p>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-3">
          {rejected.map((report) => (
            <Link key={report.id} href={`/se/history#${report.id}`} className="block rounded-[22px] bg-[#fff1eb] p-4">
              <p className="text-sm font-semibold">Report sent back</p>
              <p className="mt-1 text-sm">{report.rejectionNote || report.decisionNote}</p>
              <p className="mt-3 text-xs font-medium">Open it and resubmit</p>
            </Link>
          ))}
          {rejected.length === 0 ? (
            <div className="rounded-[22px] border border-black/5 bg-card p-4">
              <p className="text-sm font-semibold">Nothing waiting on you</p>
              <p className="mt-1 text-sm text-black/55">Rejected reports show up here with the project manager’s note.</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Stat({ href, icon: Icon, value, label, warn }: { href: string; icon: typeof ListTodo; value: number | string; label: string; warn?: boolean }) {
  return (
    <Link href={href} className="rounded-[22px] border border-black/5 bg-card p-4">
      <span className={cn("grid size-9 place-items-center rounded-2xl", warn ? "bg-[#fff1eb] text-accent" : "bg-black/[0.04] text-black")}>
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-black/45">{label}</p>
    </Link>
  );
}
