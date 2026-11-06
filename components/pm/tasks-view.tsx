"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { usePm } from "@/lib/data/admin-store";
import { taskPriorities, taskPriorityLabel, taskStatusLabel, taskStatuses } from "@/lib/labels";
import { formatDate, fullName } from "@/lib/utils";
import { taskSchema, type TaskFormValues } from "@/lib/validations/schemas";
import type { TaskItem, TaskPriority, TaskStatus } from "@/types";

const selectClass = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

export function PmTasks() {
  const data = usePm();
  const people = [...new Set([...data.engineers.map(fullName), ...data.crew.map(fullName)])];
  const tasks = [...data.tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div>
      <PageHeader
        title="Schedule & tasks"
        description="Assign work on your projects and set the due date. Assignees are the site engineers and crew already on those projects."
      />
      <AssignForm projects={data.projects} people={people} onCreate={data.createTask} />
      <ul className="mt-4 space-y-2">
        {tasks.map((task) => (
          <ScheduleRow key={task.id} task={task} projects={data.projects} people={people} onSave={data.scheduleTask} onStatus={data.setTaskStatus} />
        ))}
      </ul>
    </div>
  );
}

function AssignForm({
  projects,
  people,
  onCreate,
}: {
  projects: { id: string; code: string; name: string }[];
  people: string[];
  onCreate: (input: TaskFormValues) => { ok: true } | { ok: false; error: string };
}) {
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      projectId: projects[0]?.id ?? "",
      assignee: people[0] ?? "",
      dueDate: "",
      priority: "medium",
      status: "todo",
    },
  });
  const errors = form.formState.errors;
  return (
    <form
      className="grid gap-3 rounded-[22px] border border-black/5 bg-card p-4 md:grid-cols-2"
      onSubmit={form.handleSubmit((values) => {
        const result = onCreate(values);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Task assigned.");
        form.reset({ ...values, title: "", dueDate: "" });
      })}
    >
      <Field label="Task" htmlFor="title" error={errors.title?.message}><Input id="title" {...form.register("title")} /></Field>
      <Field label="Due date" htmlFor="dueDate" error={errors.dueDate?.message}><Input id="dueDate" type="date" {...form.register("dueDate")} /></Field>
      <Field label="Project" htmlFor="projectId" error={errors.projectId?.message}>
        <select id="projectId" className={selectClass} {...form.register("projectId")}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.code} — {project.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Assignee" htmlFor="assignee" error={errors.assignee?.message}>
        <select id="assignee" className={selectClass} {...form.register("assignee")}>
          {people.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </Field>
      <Field label="Priority" htmlFor="priority" error={errors.priority?.message}>
        <select id="priority" className={selectClass} defaultValue="medium" {...form.register("priority")}>
          {taskPriorities.map((priority) => (
            <option key={priority} value={priority}>{taskPriorityLabel[priority]}</option>
          ))}
        </select>
      </Field>
      <div className="flex items-end justify-end">
        <Button type="submit">Assign task</Button>
      </div>
    </form>
  );
}

function ScheduleRow({
  task,
  projects,
  people,
  onSave,
  onStatus,
}: {
  task: TaskItem;
  projects: { id: string; code: string }[];
  people: string[];
  onSave: (id: string, input: { projectId: string; assignee: string; dueDate: string; priority: TaskPriority }) => { ok: true } | { ok: false; error: string };
  onStatus: (id: string, status: TaskStatus) => void;
}) {
  const [projectId, setProjectId] = useState(task.projectId);
  const [assignee, setAssignee] = useState(task.assignee);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const options = people.includes(assignee) ? people : [assignee, ...people];
  return (
    <li className="grid gap-2 rounded-[22px] border border-black/5 bg-card p-3 lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))_auto] lg:items-end">
      <div>
        <p className="text-sm font-medium">{task.title}</p>
        <p className="text-xs text-muted-foreground">{taskStatusLabel[task.status]} · due {formatDate(task.dueDate)}</p>
      </div>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Project
        <select className="h-9 rounded-xl border border-input bg-white px-2 text-sm text-foreground" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.code}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Assignee
        <select className="h-9 rounded-xl border border-input bg-white px-2 text-sm text-foreground" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
          {options.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Due
        <input className="h-9 rounded-xl border border-input bg-white px-2 text-sm" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Move to
        <select className="h-9 rounded-xl border border-input bg-white px-2 text-sm text-foreground" value={task.status} onChange={(event) => onStatus(task.id, event.target.value as TaskStatus)}>
          {taskStatuses.map((status) => <option key={status} value={status}>{taskStatusLabel[status]}</option>)}
        </select>
      </label>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          const result = onSave(task.id, { projectId, assignee, dueDate, priority });
          if (!result.ok) toast.error(result.error);
          else toast.success("Schedule saved.");
        }}
      >
        Save
      </Button>
      <label className="grid gap-1 text-xs text-muted-foreground lg:col-span-1">
        Priority
        <select className="h-9 rounded-xl border border-input bg-white px-2 text-sm text-foreground" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
          {taskPriorities.map((item) => <option key={item} value={item}>{taskPriorityLabel[item]}</option>)}
        </select>
      </label>
    </li>
  );
}
