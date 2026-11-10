"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, FolderKanban, ListTodo, Plus, TriangleAlert, Users } from "lucide-react";
import { PmProgressChart } from "@/components/pm/progress-chart";
import { PriorityBadge, ProjectStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { usePm } from "@/lib/data/admin-store";
import { DEMO_TODAY, cn, daysUntil, formatDate, fullName, initials } from "@/lib/utils";
import type { Project, TaskItem, TaskPriority, TaskStatus } from "@/types";

type Period = "today" | "daily" | "weekly" | "monthly";

const periods: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

const columns: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "pending", label: "Pending" },
  { id: "done", label: "Done" },
];

const priorityRank: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PmDashboard() {
  const data = usePm();
  const params = useSearchParams();
  const requested = params.get("period");
  const period = periods.some((item) => item.id === requested) ? (requested as Period) : "monthly";
  const eventOpen = params.get("event") === "1";
  const added = params.get("added");
  const eventError = params.get("error");
  const dayQuery = params.get("day");
  const pickedDay = dayQuery && /^\d{4}-\d{2}-\d{2}$/.test(dayQuery) ? dayQuery : null;
  const selectedDay = pickedDay ?? DEMO_TODAY;
  const showEventForm = eventOpen && pickedDay !== null;
  const [focusId, setFocusId] = useState(data.projects.find((project) => project.status === "delayed")?.id ?? data.projects[0]?.id ?? "");
  const [month, setMonth] = useState(() => monthOf(selectedDay));

  const firstName = data.actor?.firstName ?? "there";
  const visibleTasks = data.tasks.filter((task) => inPeriod(task.dueDate, period));
  const openTasks = data.tasks.filter((task) => task.status !== "done");
  const overdue = openTasks.filter((task) => daysUntil(task.dueDate) < 0);
  const activeInPeriod = visibleTasks.filter((task) => task.status !== "done");
  const team = teamOnPortfolio(data);
  const focus = data.projects.find((project) => project.id === focusId) ?? data.projects[0] ?? null;
  const marks = useMemo(() => deadlineMarks(data.tasks, data.projects, data.events), [data.tasks, data.projects, data.events]);
  const cells = useMemo(() => monthCells(month.year, month.month), [month.year, month.month]);
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(month.year, month.month, 1)),
  );
  const selectedTasks = data.tasks.filter((task) => task.dueDate.slice(0, 10) === selectedDay);
  const selectedProjects = data.projects.filter((project) => project.expectedEndDate.slice(0, 10) === selectedDay);
  const selectedEvents = data.events.filter((event) => event.date === selectedDay);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName}</h1>
          <p className="mt-1 text-sm text-black/45">Here is the work on your projects. Counts follow the period you pick.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-2xl border border-black/5 bg-white p-1">
            {periods.map((item) => (
              <a
                key={item.id}
                href={`/pm?period=${item.id}#tasks`}
                aria-current={period === item.id ? "page" : undefined}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-sm",
                  period === item.id ? "bg-black text-white" : "text-black/55 hover:bg-black/[0.04]",
                )}
              >
                {item.label}
              </a>
            ))}
          </div>
          <Button variant="navy" asChild>
            <Link prefetch={false} href="/pm/tasks">
              <Plus /> Assign task
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat href="/pm/projects" icon={FolderKanban} value={data.projects.length} label="Total projects" />
        <Stat href={`/pm?period=${period}#tasks`} icon={ListTodo} value={activeInPeriod.length} label={`${periods.find((item) => item.id === period)?.label ?? "Monthly"} tasks`} />
        <Stat href="/pm/tasks" icon={TriangleAlert} value={overdue.length} label="Overdue tasks" warn={overdue.length > 0} />
        <Stat href="/pm/people" icon={Users} value={team.length} label="Team members" />
      </div>

      <PmProgressChart projects={data.projects} marks={data.progressMarks} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.85fr)]">
        <div className="space-y-4">
          <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
            <div>
              <h2 className="text-base font-semibold">Projects</h2>
              <p className="mt-0.5 text-xs text-black/45">Your active portfolio. Select a row to open it on the right.</p>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs text-black/40">
                  <tr>
                    <th className="pb-2 font-medium">Project name</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Progress</th>
                    <th className="pb-2 font-medium">Priority</th>
                    <th className="pb-2 font-medium">Deadline</th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((project) => {
                    const hot = hottest(data.tasks.filter((task) => task.projectId === project.id && task.status !== "done"));
                    const selected = focus?.id === project.id;
                    return (
                      <tr
                        key={project.id}
                        onClick={() => setFocusId(project.id)}
                        className={cn("cursor-pointer border-t border-black/5", selected && "bg-[#fff1eb]")}
                      >
                        <td className="py-3 pr-3">
                          <p className="font-medium">{project.name}</p>
                          <p className="text-xs text-black/40">{project.location}</p>
                        </td>
                        <td className="py-3 pr-3">
                          <ProjectStatusBadge status={project.status} />
                        </td>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/10">
                              <div
                                className={cn("h-full rounded-full", project.status === "delayed" ? "bg-accent" : "bg-black")}
                                style={{ width: `${project.progress}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-black/55">{project.progress}%</span>
                          </div>
                        </td>
                        <td className="py-3 pr-3">{hot ? <PriorityBadge priority={hot.priority} /> : <span className="text-xs text-black/35">—</span>}</td>
                        <td className="py-3 pr-3 whitespace-nowrap text-black/70">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="size-3.5 text-black/35" />
                            {shortDate(project.expectedEndDate)}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <Link prefetch={false} href="/pm/progress" className="text-sm font-medium text-black/70 hover:text-black" onClick={(event) => event.stopPropagation()}>
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section id="tasks" className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
            <div>
              <h2 className="text-base font-semibold">Task board</h2>
              <p className="mt-0.5 text-xs text-black/45">{periodCopy(period)}</p>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {columns.map((column) => {
                const items = visibleTasks.filter((task) => task.status === column.id);
                return (
                  <div key={column.id} className="rounded-2xl bg-black/[0.03] p-3">
                    <p className="mb-2 text-sm font-medium">
                      {column.label} <span className="text-black/35">{items.length}</span>
                    </p>
                    <ul className="space-y-2">
                      {items.length === 0 ? <li className="px-1 py-4 text-xs text-black/35">None in this period.</li> : null}
                      {items.map((task) => {
                        const project = data.projectById(task.projectId);
                        return (
                          <li key={task.id} className="rounded-2xl border border-black/5 bg-white p-3">
                            <p className="text-sm font-medium">{task.title}</p>
                            <p className="mt-0.5 text-xs text-black/40">{project?.name}</p>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <PriorityBadge priority={task.priority} />
                              <span className="text-[11px] text-black/45">{shortDate(task.dueDate)}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section id="calendar" className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Calendar</h2>
                <p className="mt-0.5 text-xs text-black/45">Task deadlines, project finish dates, and events you add.</p>
              </div>
              <Button variant="navy" size="sm" asChild>
                <a href={calendarHref(period, { event: "1" })}>
                  <Plus /> Add event
                </a>
              </Button>
            </div>
            {added ? <p className="mt-3 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">{added} is marked on {shortDate(selectedDay)}.</p> : null}
            {eventOpen && !showEventForm ? <p className="mt-3 text-sm text-black/55">Click a date. Then name the meeting or other event.</p> : null}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm font-semibold">{monthLabel}</p>
              <div className="flex gap-1">
                <button type="button" className="grid size-8 place-items-center rounded-xl border border-black/10" aria-label="Previous month" onClick={() => setMonth((current) => shiftMonth(current, -1))}>
                  <ChevronLeft className="size-4" />
                </button>
                <button type="button" className="grid size-8 place-items-center rounded-xl border border-black/10" aria-label="Next month" onClick={() => setMonth((current) => shiftMonth(current, 1))}>
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-black/35">
              {weekday.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((cell, index) => {
                if (!cell.iso || cell.day === null) return <span key={`empty-${index}`} />;
                const marked = marks.has(cell.iso);
                const today = cell.iso === DEMO_TODAY;
                const selected = cell.iso === selectedDay;
                return (
                  <a
                    key={cell.iso}
                    href={calendarHref(period, eventOpen ? { event: "1", day: cell.iso } : { day: cell.iso })}
                    className={cn(
                      "relative grid h-9 place-items-center rounded-xl text-sm",
                      selected ? "bg-black text-white" : "hover:bg-black/[0.04]",
                      today && !selected && "ring-1 ring-accent",
                    )}
                  >
                    {cell.day}
                    {marked ? <span className={cn("absolute bottom-1 size-1 rounded-full", selected ? "bg-white" : "bg-accent")} /> : null}
                  </a>
                );
              })}
            </div>
            {showEventForm && pickedDay ? <EventForm period={period} day={pickedDay} error={eventError} /> : null}
            <ul className="mt-3 space-y-1 text-xs text-black/55">
              {selectedTasks.length === 0 && selectedProjects.length === 0 && selectedEvents.length === 0 ? <li>Nothing is scheduled on {shortDate(selectedDay)}.</li> : null}
              {selectedEvents.map((event) => (
                <li key={event.id}>{event.kind === "meeting" ? "Meeting" : "Event"} · {event.title}</li>
              ))}
              {selectedTasks.map((task) => (
                <li key={task.id}>{task.title}</li>
              ))}
              {selectedProjects.map((project) => (
                <li key={project.id}>{project.code} finishes</li>
              ))}
            </ul>
          </section>

          {focus ? <FocusCard project={focus} tasks={data.tasks.filter((task) => task.projectId === focus.id)} people={peopleFor(focus.id, data)} waiting={data.reports.some((report) => report.projectId === focus.id && (report.status === "submitted" || report.status === "in_review"))} onPick={setFocusId} projects={data.projects} /> : null}
        </div>
      </div>
    </div>
  );
}

function FocusCard({
  project,
  tasks,
  people,
  waiting,
  projects,
  onPick,
}: {
  project: Project;
  tasks: TaskItem[];
  people: string[];
  waiting: boolean;
  projects: Project[];
  onPick: (id: string) => void;
}) {
  const done = tasks.filter((task) => task.status === "done").length;
  const late = tasks.filter((task) => task.status !== "done" && daysUntil(task.dueDate) < 0).length;
  const hot = hottest(tasks.filter((task) => task.status !== "done"));
  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Projects</h2>
          <p className="mt-0.5 text-xs text-black/45">The project selected in the table.</p>
        </div>
        <label className="text-xs text-black/45">
          <span className="sr-only">Focus project</span>
          <select className="rounded-xl border border-black/10 bg-white px-2 py-1.5 text-xs text-black" value={project.id} onChange={(event) => onPick(event.target.value)}>
            {projects.map((item) => (
              <option key={item.id} value={item.id}>{item.code}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 rounded-2xl border border-black/5 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{project.name}</p>
            <p className="mt-0.5 text-xs text-black/40">{project.description}</p>
          </div>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-black/45">
            <span>Progress</span>
            <span className="tabular-nums text-black">{project.progress}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
            <div className={cn("h-full rounded-full", project.status === "delayed" ? "bg-accent" : "bg-black")} style={{ width: `${project.progress}%` }} />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 text-center">
          <Figure value={tasks.length} label="Total" />
          <Figure value={done} label="Completed" />
          <Figure value={late} label="Late" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 text-xs text-black/55">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {formatDate(project.expectedEndDate)}
          </span>
          {hot ? <PriorityBadge priority={hot.priority} /> : null}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex">
            {people.slice(0, 4).map((name, index) => (
              <span key={name} className={cn("grid size-7 place-items-center rounded-full border-2 border-white text-[10px] font-semibold text-white", index === 0 ? "bg-accent" : "bg-black")} style={{ marginLeft: index === 0 ? 0 : -8 }} title={name}>
                {initials(name)}
              </span>
            ))}
          </div>
          <Link prefetch={false} href="/pm/progress" className="text-sm font-medium hover:underline">View details</Link>
        </div>
        {waiting ? (
          <Link prefetch={false} href="/pm/reports" className="mt-3 block rounded-xl bg-[#fff1eb] px-3 py-2 text-xs font-medium">
            An engineer report is waiting on this project.
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function Stat({ href, icon: Icon, value, label, warn = false }: { href: string; icon: typeof FolderKanban; value: number; label: string; warn?: boolean }) {
  return (
    <Link prefetch={false} href={href} className="flex items-center gap-3 rounded-[22px] border border-black/5 bg-card px-4 py-3">
      <span className={cn("grid size-10 place-items-center rounded-2xl", warn ? "bg-accent text-white" : "bg-black/[0.04] text-black")}>
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-xl font-semibold tabular-nums leading-none">{value}</span>
        <span className="mt-1 block text-xs text-black/45">{label}</span>
      </span>
    </Link>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">{String(value).padStart(2, "0")}</p>
      <p className="text-[11px] text-black/40">{label}</p>
    </div>
  );
}

function EventForm({ period, day, error }: { period: Period; day: string; error: string | null }) {
  return (
    <form action="/api/pm/events" method="post" className="mt-3 grid gap-2 rounded-2xl bg-[#fff1eb] p-3">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="date" value={day} />
      <p className="text-sm font-medium">{shortDate(day)}</p>
      {error ? <p className="text-sm">{error}</p> : null}
      <label className="grid gap-1 text-xs text-black/45" htmlFor="event-title">
        Event
        <input id="event-title" name="title" required minLength={3} maxLength={80} placeholder="Site meeting" className="h-10 rounded-xl border border-input bg-white px-3 text-sm text-black" />
      </label>
      <label className="grid gap-1 text-xs text-black/45" htmlFor="event-kind">
        Type
        <select id="event-kind" name="kind" defaultValue="meeting" className="h-10 rounded-xl border border-input bg-white px-3 text-sm text-black">
          <option value="meeting">Meeting</option>
          <option value="other">Other event</option>
        </select>
      </label>
      <div className="flex justify-end gap-2">
        <a href={calendarHref(period, { day })} className="inline-flex h-8 items-center rounded-xl px-2.5 text-[13px] font-medium text-black/60">Cancel</a>
        <Button type="submit" size="sm" className="bg-[#ff5c22] text-white hover:bg-[#e64e18]">Save</Button>
      </div>
    </form>
  );
}

function calendarHref(period: Period, extra: Record<string, string> = {}) {
  const query = new URLSearchParams({ period, ...extra });
  return `/pm?${query.toString()}#calendar`;
}

function monthOf(iso: string) {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 };
}

function periodCopy(period: Period) {
  if (period === "today") return "Tasks due on 6 Nov 2026.";
  if (period === "daily") return "Tasks due on 6 Nov 2026 or the next day.";
  if (period === "weekly") return "Tasks due from 6 Nov 2026 through 13 Nov 2026.";
  return "Every task on your projects.";
}

function inPeriod(due: string, period: Period) {
  if (period === "monthly") return true;
  const days = daysUntil(due);
  if (days < 0) return false;
  const span = period === "today" ? 0 : period === "daily" ? 1 : 7;
  return days <= span;
}

function hottest(tasks: TaskItem[]) {
  return [...tasks].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])[0] ?? null;
}

function deadlineMarks(tasks: TaskItem[], projects: Project[], events: { date: string }[]) {
  const marks = new Set<string>();
  for (const task of tasks) marks.add(task.dueDate.slice(0, 10));
  for (const project of projects) marks.add(project.expectedEndDate.slice(0, 10));
  for (const event of events) marks.add(event.date.slice(0, 10));
  return marks;
}

function monthCells(year: number, month: number) {
  const lead = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: { day: number | null; iso: string | null }[] = [];
  for (let index = 0; index < lead; index += 1) cells.push({ day: null, iso: null });
  for (let day = 1; day <= count; day += 1) {
    cells.push({
      day,
      iso: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }
  return cells;
}

function shiftMonth(current: { year: number; month: number }, delta: number) {
  const next = current.month + delta;
  return { year: current.year + Math.floor(next / 12), month: ((next % 12) + 12) % 12 };
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

function teamOnPortfolio(data: ReturnType<typeof usePm>) {
  const ids = new Set(data.projects.map((project) => project.id));
  const names = new Set<string>();
  for (const employee of data.crew) names.add(fullName(employee));
  for (const user of data.users) {
    if (user.projectId && ids.has(user.projectId) && user.role !== "project_manager" && user.status === "active") names.add(fullName(user));
  }
  return [...names];
}

function peopleFor(projectId: string, data: ReturnType<typeof usePm>) {
  const names = data.crew.filter((employee) => employee.projectId === projectId).map((employee) => fullName(employee));
  for (const user of data.users) {
    if (user.projectId === projectId && user.role !== "project_manager" && user.status === "active") names.push(fullName(user));
  }
  return names;
}
