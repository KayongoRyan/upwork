"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { usePm } from "@/lib/data/admin-store";

export function PmProgress() {
  const data = usePm();
  const [drafts, setDrafts] = useState<Record<string, { progress: string; note: string }>>({});

  return (
    <div>
      <PageHeader
        title="Progress"
        description="Record the progress you are carrying for each project. Approving an engineer report also raises progress when the site figure is higher."
      />
      <div className="grid gap-3">
        {data.projects.map((project) => {
          const draft = drafts[project.id] ?? { progress: String(project.progress), note: "" };
          const locked = project.status === "completed";
          return (
            <form
              key={project.id}
              className="grid gap-3 rounded-[22px] border border-black/5 bg-card p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                const progress = Number(draft.progress);
                if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
                  toast.error("Progress must be between 0 and 100.");
                  return;
                }
                const result = data.setProgress(project.id, progress, draft.note);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(`${project.code} is now ${Math.round(progress)}%.`);
                setDrafts((current) => ({ ...current, [project.id]: { progress: String(Math.round(progress)), note: "" } }));
              }}
            >
              <div>
                <p className="text-xs text-black/45">{project.code}</p>
                <h2 className="text-sm font-semibold">{project.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">Recorded at {project.progress}%</p>
              </div>
              <Field label="Progress %" htmlFor={`progress-${project.id}`}>
                <Input
                  id={`progress-${project.id}`}
                  type="number"
                  min={0}
                  max={100}
                  disabled={locked}
                  value={draft.progress}
                  onChange={(event) => setDrafts((current) => ({ ...current, [project.id]: { ...draft, progress: event.target.value } }))}
                />
              </Field>
              <div className="grid gap-2 sm:col-span-3">
                <Field label="Note" htmlFor={`note-${project.id}`} hint="Stored on the activity log and sent to the administrator inbox">
                  <Textarea
                    id={`note-${project.id}`}
                    disabled={locked}
                    value={draft.note}
                    onChange={(event) => setDrafts((current) => ({ ...current, [project.id]: { ...draft, note: event.target.value } }))}
                  />
                </Field>
                <div className="flex justify-end">
                  <Button type="submit" disabled={locked}>{locked ? "Completed" : "Save progress"}</Button>
                </div>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}
