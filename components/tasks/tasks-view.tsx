"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { PriorityBadge, ProjectStatusBadge, TaskStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdmin } from "@/lib/data/admin-store";
import { projectStatusLabel, projectStatuses, taskPriorities, taskPriorityLabel, taskStatusLabel, taskStatuses } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { taskSchema, type TaskFormValues } from "@/lib/validations/schemas";
import type { ProjectStatus, TaskItem, TaskStatus } from "@/types";

export function TasksView() {
  const data = useAdmin();
  const params = useSearchParams();
  const requested = params.get("status") ?? (params.get("filter")?.startsWith("status:") ? params.get("filter")!.slice("status:".length) : null);
  const statusFilter = projectStatuses.find((status) => status === requested) ?? null;
  const projectId = params.get("project");
  const taskId = params.get("task");
  const [open, setOpen] = useState(false);
  const listed = data.projects.filter((project) => {
    if (statusFilter) return project.status === statusFilter;
    if (projectId) return project.id === projectId;
    return true;
  });
  const listedIds = new Set(listed.map((project) => project.id));
  const tasks = data.tasks.filter((task) => listedIds.has(task.projectId));
  const selected = tasks.find((task) => task.id === taskId) ?? null;
  const focus = projectId ? data.projectById(projectId) : null;
  const focusTasks = focus ? data.tasks.filter((task) => task.projectId === focus.id) : [];

  function href(nextProject: string, nextTask?: string) {
    const query = new URLSearchParams();
    if (statusFilter) query.set("status", statusFilter);
    else if (nextProject && nextProject !== "all") query.set("project", nextProject);
    if (nextTask) query.set("task", nextTask);
    const text = query.toString();
    return text ? `/admin/tasks?${text}` : "/admin/tasks";
  }

  function openStatus(status: string) {
    window.location.assign(status === "all" ? "/admin/tasks" : `/admin/tasks?status=${status}#activities`);
  }

  return (
    <div>
      <PageHeader
        title="Tasks & activities"
        description="Work packages on the demonstration projects. Status changes are stored in this session."
        actions={<Button type="button" onClick={() => setOpen(true)}><Plus />Add task</Button>}
      />
      <StatusLinks current={statusFilter ?? "all"} />
      <form action="/admin/tasks" method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <select
          key={statusFilter ?? "all"}
          name="status"
          aria-label="Status"
          data-status-go="/admin/tasks"
          defaultValue={statusFilter ?? "all"}
          onChange={(event) => openStatus(event.currentTarget.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-white px-3 text-sm sm:max-w-xs"
        >
          <option value="all">All statuses</option>
          {projectStatuses.map((status) => <option key={status} value={status}>{projectStatusLabel[status]}</option>)}
        </select>
      </form>
      {statusFilter ? <ActivityBoard statusLabel={projectStatusLabel[statusFilter]} tasks={tasks} selectedId={selected?.id ?? null} projectById={data.projectById} href={href} onDelete={(id) => { data.deleteTask(id); toast.success("Task removed."); }} onAssign={data.assignTask} onStatus={data.setTaskStatus} projects={data.projects} /> : focus ? <ProjectStanding project={focus} tasks={focusTasks} selected={selected} /> : <ProjectGroups projects={listed} tasks={data.tasks} openProject={(id) => href(id)} />}
      {statusFilter ? null : <ActivityBoard tasks={tasks} selectedId={selected?.id ?? null} projectById={data.projectById} href={href} onDelete={(id) => { data.deleteTask(id); toast.success("Task removed."); }} onAssign={data.assignTask} onStatus={data.setTaskStatus} projects={data.projects} />}
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <DialogContent title="Add task" description="The task is added to the preview board only." className="sm:max-w-lg">
            <TaskForm
              projects={data.projects.map((project) => ({ id: project.id, label: `${project.code} — ${project.name}` }))}
              onCancel={() => setOpen(false)}
              onSubmit={(values) => {
                data.createTask(values);
                toast.success("Task added.");
                setOpen(false);
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function StatusLinks({ current }: { current: string }) {
  const links = [
    { href: "/admin/tasks", label: "All", on: current === "all" },
    ...projectStatuses.map((status) => ({
      href: `/admin/tasks?status=${status}#activities`,
      label: projectStatusLabel[status],
      on: current === status,
    })),
  ];
  return (
    <nav aria-label="Status" className="mb-4 flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          aria-current={link.on ? "page" : undefined}
          className={link.on ? "inline-flex h-9 items-center rounded-full bg-accent px-3 text-sm font-medium text-white" : "inline-flex h-9 items-center rounded-full border border-black/10 bg-white px-3 text-sm font-medium"}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

function ActivityBoard({
  statusLabel,
  tasks,
  selectedId,
  projectById,
  href,
  onDelete,
  onAssign,
  onStatus,
  projects,
}: {
  statusLabel?: string;
  tasks: TaskItem[];
  selectedId: string | null;
  projectById: (id: string) => { code: string; progress: number } | null | undefined;
  href: (projectId: string, taskId?: string) => string;
  onDelete: (id: string) => void;
  onAssign: (id: string, projectId: string) => void;
  onStatus: (id: string, status: TaskStatus) => void;
  projects: { id: string; code: string; name: string }[];
}) {
  return (
    <div id="activities" className="mb-4">
      {statusLabel ? <h2 className="mb-2 text-sm font-semibold">{statusLabel} activities</h2> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {taskStatuses.map((status) => (
          <section key={status} className="rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-3 py-2">
              <h2 className="text-sm font-semibold">{taskStatusLabel[status]}</h2>
              <span className="text-xs text-muted-foreground">{tasks.filter((task) => task.status === status).length}</span>
            </header>
            <ul className="space-y-2 p-3">
              {tasks.filter((task) => task.status === status).map((task) => {
                const project = projectById(task.projectId);
                const active = task.id === selectedId;
                return (
                  <li key={task.id} className={active ? "rounded-lg border border-accent bg-[#fff1eb] p-3" : "rounded-lg border border-border p-3"}>
                    <div className="flex items-start justify-between gap-2">
                      <a href={href(task.projectId, task.id)} className="text-sm font-medium hover:underline">{task.title}</a>
                      <button type="button" aria-label={`Delete ${task.title}`} className="text-muted-foreground hover:text-destructive" onClick={() => onDelete(task.id)}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{project?.code} · {task.assignee}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <TaskStatusBadge status={task.status} />
                      <PriorityBadge priority={task.priority} />
                      <span className="text-xs text-muted-foreground">Due {formatDate(task.dueDate)}</span>
                    </div>
                    {project ? <p className="mt-2 text-xs text-black/55">Project progress {project.progress}%</p> : null}
                    <label className="mt-3 grid gap-1 text-xs text-muted-foreground">
                      Project
                      <select
                        aria-label={`Project for ${task.title}`}
                        value={task.projectId}
                        onChange={(event) => onAssign(task.id, event.target.value)}
                        className="h-8 rounded-md border border-input bg-white px-2 text-sm text-foreground"
                      >
                        {projects.map((item) => (
                          <option key={item.id} value={item.id}>{item.code} — {item.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-2 grid gap-1 text-xs text-muted-foreground">
                      Move to
                      <select
                        aria-label={`Status for ${task.title}`}
                        value={task.status}
                        onChange={(event) => onStatus(task.id, event.target.value as TaskStatus)}
                        className="h-8 rounded-md border border-input bg-white px-2 text-sm text-foreground"
                      >
                        {taskStatuses.map((item) => <option key={item} value={item}>{taskStatusLabel[item]}</option>)}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function ProjectStanding({
  project,
  tasks,
  selected,
}: {
  project: { id: string; name: string; code: string; progress: number; status: "planning" | "active" | "on_hold" | "delayed" | "completed" };
  tasks: { status: TaskStatus }[];
  selected: { title: string; status: TaskStatus; assignee: string; progress: number } | null;
}) {
  const counts = {
    todo: tasks.filter((task) => task.status === "todo").length,
    pending: tasks.filter((task) => task.status === "pending").length,
    done: tasks.filter((task) => task.status === "done").length,
  };
  return (
    <section className="mb-4 rounded-[22px] border border-black/5 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{project.name}</h2>
          <p className="text-xs text-black/45">{project.code}</p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-black/45">
          <span>Project progress</span>
          <span className="font-medium text-black">{project.progress}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
          <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} />
        </div>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        <Count label="To do" value={counts.todo} />
        <Count label="Pending" value={counts.pending} />
        <Count label="Done" value={counts.done} />
      </dl>
      {selected ? (
        <div className="mt-3 rounded-2xl bg-light-gray px-3 py-3">
          <p className="text-sm font-medium">{selected.title}</p>
          <p className="mt-1 text-xs text-black/45">{selected.assignee} · task progress {selected.progress}%</p>
          <div className="mt-2">
            <TaskStatusBadge status={selected.status} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProjectGroups({
  projects,
  tasks,
  openProject,
}: {
  projects: { id: string; name: string; code: string; progress: number; status: ProjectStatus }[];
  tasks: { projectId: string; status: TaskStatus }[];
  openProject: (id: string) => string;
}) {
  const groups = projectStatuses
    .map((status) => ({ status, projects: projects.filter((project) => project.status === status) }))
    .filter((group) => group.projects.length > 0);
  if (groups.length === 0) return <p className="mb-4 text-sm text-black/55">No projects in this status.</p>;
  return (
    <div className="mb-4 space-y-4">
      {groups.map((group) => (
        <section key={group.status}>
          <a href={`/admin/tasks?status=${group.status}#activities`} className="mb-2 inline-block text-sm font-semibold hover:underline">{projectStatusLabel[group.status]}</a>
          <div className="grid gap-3 md:grid-cols-2">
            {group.projects.map((project) => {
              const mine = tasks.filter((task) => task.projectId === project.id);
              const counts = {
                todo: mine.filter((task) => task.status === "todo").length,
                pending: mine.filter((task) => task.status === "pending").length,
                done: mine.filter((task) => task.status === "done").length,
              };
              return (
                <a key={project.id} href={openProject(project.id)} className="rounded-[22px] border border-black/5 bg-card p-4 hover:border-accent">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{project.name}</h3>
                      <p className="text-xs text-black/45">{project.code}</p>
                    </div>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-black/45">
                      <span>Project progress</span>
                      <span className="font-medium text-black">{project.progress}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
                      <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} />
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <Count label="To do" value={counts.todo} />
                    <Count label="Pending" value={counts.pending} />
                    <Count label="Done" value={counts.done} />
                  </dl>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-light-gray px-3 py-2">
      <dt className="text-xs text-black/45">{label}</dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}

function TaskForm({
  projects,
  onCancel,
  onSubmit,
}: {
  projects: { id: string; label: string }[];
  onCancel: () => void;
  onSubmit: (values: TaskFormValues) => void;
}) {
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: "", projectId: projects[0]?.id ?? "", assignee: "", dueDate: "", priority: "medium", status: "todo" },
  });
  const errors = form.formState.errors;
  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Field label="Title" htmlFor="title" error={errors.title?.message}><Input id="title" {...form.register("title")} /></Field>
      <Field label="Project" error={errors.projectId?.message}>
        <Controller control={form.control} name="projectId" render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger aria-label="Project"><SelectValue /></SelectTrigger>
            <SelectContent>
              {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )} />
      </Field>
      <Field label="Assignee" htmlFor="assignee" error={errors.assignee?.message}><Input id="assignee" {...form.register("assignee")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Due date" htmlFor="dueDate" error={errors.dueDate?.message}><Input id="dueDate" type="date" {...form.register("dueDate")} /></Field>
        <Field label="Priority" error={errors.priority?.message}>
          <Controller control={form.control} name="priority" render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                {taskPriorities.map((priority) => <SelectItem key={priority} value={priority}>{taskPriorityLabel[priority]}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
        </Field>
      </div>
      <Field label="Status" error={errors.status?.message}>
        <Controller control={form.control} name="status" render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger aria-label="Task status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {taskStatuses.map((status) => <SelectItem key={status} value={status}>{taskStatusLabel[status]}</SelectItem>)}
            </SelectContent>
          </Select>
        )} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Add task</Button>
      </div>
    </form>
  );
}
