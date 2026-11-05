import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ProjectStatusBadge } from "@/components/shared/status-badge";
import { projectsNeedingAttention } from "@/lib/metrics";
import { daysUntil, formatDate } from "@/lib/utils";
import type { Project } from "@/types";

export function AttentionProjects({
  projects,
  managerName,
}: {
  projects: Project[];
  managerName: (project: Project) => string;
}) {
  const items = projectsNeedingAttention(projects);
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Projects requiring attention</h2>
        <p className="text-xs text-muted-foreground">Delayed work, low progress, holds, and deadlines inside 21 days of 6 Nov 2026.</p>
      </header>
      <ul className="divide-y divide-border">
        {items.map(({ project, reasons }) => {
          const days = daysUntil(project.expectedEndDate);
          return (
            <li key={project.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/projects?focus=${project.id}`} className="font-medium hover:underline">
                    {project.name}
                  </Link>
                  <ProjectStatusBadge status={project.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {project.code} · {managerName(project)} · {project.progress}% · due {formatDate(project.expectedEndDate)}
                  {days < 0 ? ` · ${Math.abs(days)} days past due` : ` · ${days} days left`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {reasons.map((reason) => (
                    <Badge key={reason} tone={reason === "Delayed" || reason === "Past due" ? "red" : reason === "On hold" ? "amber" : "slate"}>
                      {reason}
                    </Badge>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
        {items.length === 0 ? <li className="px-4 py-8 text-sm text-muted-foreground">Nothing in the portfolio currently needs attention.</li> : null}
      </ul>
    </section>
  );
}
