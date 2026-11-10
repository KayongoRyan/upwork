"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { PriorityBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdmin } from "@/lib/data/admin-store";
import { taskPriorities, taskPriorityLabel, taskStatusLabel, taskStatuses } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { taskSchema, type TaskFormValues } from "@/lib/validations/schemas";
import type { TaskStatus } from "@/types";

export function TasksView() {
  const data = useAdmin();
  const requested = useSearchParams().get("project");
  const [seenProject, setSeenProject] = useState(requested);
  const [projectId, setProjectId] = useState(requested ?? "all");
  if (requested !== seenProject) {
    setSeenProject(requested);
    if (requested) setProjectId(requested);
  }
  const [open, setOpen] = useState(false);
  const tasks = data.tasks.filter((task) => projectId === "all" || task.projectId === projectId);

  return (
    <div>
      <PageHeader
        title="Tasks & activities"
        description="Work packages on the demonstration projects. Status changes are stored in this session."
        actions={<Button type="button" onClick={() => setOpen(true)}><Plus />Add task</Button>}
      />
      <select aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mb-4 h-10 rounded-lg border border-input bg-white px-3 text-sm">
        <option value="all">All projects</option>
        {data.projects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}
      </select>
      <div className="grid gap-4 lg:grid-cols-3">
        {taskStatuses.map((status) => (
          <section key={status} className="rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-3 py-2">
              <h2 className="text-sm font-semibold">{taskStatusLabel[status]}</h2>
              <span className="text-xs text-muted-foreground">{tasks.filter((task) => task.status === status).length}</span>
            </header>
            <ul className="space-y-2 p-3">
              {tasks.filter((task) => task.status === status).map((task) => (
                <li key={task.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{task.title}</p>
                    <button type="button" aria-label={`Delete ${task.title}`} className="text-muted-foreground hover:text-destructive" onClick={() => { data.deleteTask(task.id); toast.success("Task removed."); }}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{data.projectById(task.projectId)?.code} · {task.assignee}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={task.priority} />
                    <span className="text-xs text-muted-foreground">Due {formatDate(task.dueDate)}</span>
                  </div>
                  <label className="mt-3 grid gap-1 text-xs text-muted-foreground">
                    Project
                    <select
                      aria-label={`Project for ${task.title}`}
                      value={task.projectId}
                      onChange={(event) => data.assignTask(task.id, event.target.value)}
                      className="h-8 rounded-md border border-input bg-white px-2 text-sm text-foreground"
                    >
                      {data.projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.code} — {project.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-2 grid gap-1 text-xs text-muted-foreground">
                    Move to
                    <select
                      aria-label={`Status for ${task.title}`}
                      value={task.status}
                      onChange={(event) => data.setTaskStatus(task.id, event.target.value as TaskStatus)}
                      className="h-8 rounded-md border border-input bg-white px-2 text-sm text-foreground"
                    >
                      {taskStatuses.map((item) => <option key={item} value={item}>{taskStatusLabel[item]}</option>)}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
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
