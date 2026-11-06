"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { PriorityBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { useSiteEngineer } from "@/lib/data/admin-store";
import { taskStatusLabel, taskStatuses } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import type { TaskItem, TaskStatus } from "@/types";

const selectClass = "mt-1 h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

export function SeTasks() {
  const data = useSiteEngineer();
  const tasks = [...data.tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div>
      <PageHeader
        title="Assigned tasks"
        description={`Only work assigned to you on ${data.project?.code ?? "your project"}.`}
      />
      {tasks.length === 0 ? <p className="text-sm text-black/45">Nothing is assigned.</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onSave={data.updateTask} />
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task, onSave }: { task: TaskItem; onSave: (id: string, progress: number, status: TaskStatus) => { ok: true } | { ok: false; error: string } }) {
  const [progress, setProgress] = useState(task.progress);
  const [status, setStatus] = useState<TaskStatus>(task.status);

  return (
    <form
      className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const result = onSave(task.id, progress, status);
        if (!result.ok) toast.error(result.error);
        else toast.success("Progress saved.");
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{task.title}</p>
          <p className="mt-1 text-xs text-black/45">Due {formatDate(task.dueDate)} · {taskStatusLabel[task.status]}</p>
        </div>
        <PriorityBadge priority={task.priority} />
      </div>
      <Label className="mt-4 block">
        Progress {progress}%
        <input
          className="mt-2 h-10 w-full accent-[#ff5c22]"
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={(event) => {
            const next = Number(event.target.value);
            setProgress(next);
            if (next >= 100) setStatus("done");
            else if (status === "done") setStatus("pending");
          }}
        />
      </Label>
      <Label className="mt-3 block">
        Status
        <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
          {taskStatuses.map((item) => (
            <option key={item} value={item}>{taskStatusLabel[item]}</option>
          ))}
        </select>
      </Label>
      <Button type="submit" variant="navy" className="mt-4">Save progress</Button>
    </form>
  );
}
