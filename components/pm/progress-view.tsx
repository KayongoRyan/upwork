"use client";

import { useSearchParams } from "next/navigation";
import { ManagerNotes } from "@/components/pm/manager-notes";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { usePm } from "@/lib/data/admin-store";

export function PmProgress() {
  const data = usePm();
  const params = useSearchParams();
  const error = params.get("error");
  const saved = params.get("saved");

  return (
    <div>
      <PageHeader
        title="Progress"
        description="Record the progress you are carrying for each project. Saving it marks that percentage on the dashboard chart. Approving an engineer report also raises progress when the site figure is higher."
      />
      {error ? <p className="mb-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">{error}</p> : null}
      {saved ? <p className="mb-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">{saved} saved. The dashboard chart now marks this percentage.</p> : null}
      <div className="grid gap-3">
        {data.projects.map((project) => {
          const locked = project.status === "completed";
          const mark = data.progressMarks.find((item) => item.projectId === project.id);
          return (
            <form key={project.id} id={project.id} className="scroll-mt-28 grid gap-3 rounded-[22px] border border-black/5 bg-card p-4 sm:grid-cols-[1fr_180px] sm:items-end" action="/api/pm/progress" method="post">
              <input type="hidden" name="projectId" value={project.id} />
              <div>
                <p className="text-xs text-black/45">{project.code}</p>
                <h2 className="text-sm font-semibold">{project.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Recorded at {project.progress}%
                  {mark ? ` · last saved ${mark.progress}%` : ""}
                </p>
              </div>
              <Field label="Progress %" htmlFor={`progress-${project.id}`}>
                <Input id={`progress-${project.id}`} name="progress" type="number" min={0} max={100} step={1} required disabled={locked} defaultValue={project.progress} />
              </Field>
              <div className="grid gap-2 sm:col-span-2">
                <Field label="Note" htmlFor={`note-${project.id}`} hint="Stored with the chart mark and sent to the administrator inbox">
                  <Textarea id={`note-${project.id}`} name="note" disabled={locked} defaultValue="" />
                </Field>
                <div className="flex justify-end">
                  <Button type="submit" disabled={locked} className="bg-[#ff5c22] text-white hover:bg-[#e64e18]">
                    {locked ? "Completed" : "Save progress"}
                  </Button>
                </div>
                <ManagerNotes notes={data.comments.filter((item) => item.kind === "progress" && item.projectId === project.id)} />
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}
