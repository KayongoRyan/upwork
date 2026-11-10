"use client";

import Link from "next/link";
import { ManagerNotes } from "@/components/pm/manager-notes";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectStatusBadge } from "@/components/shared/status-badge";
import { usePm } from "@/lib/data/admin-store";
import { daysUntil, formatDate, formatMoney } from "@/lib/utils";

export function PmProjects() {
  const data = usePm();
  const { projects } = data;
  return (
    <div>
      <PageHeader
        title="My projects"
        description="Monitoring view for the projects assigned to you. Budget figures are demonstration data in RWF."
      />
      <div className="grid gap-3">
        {projects.map((project) => {
          const days = daysUntil(project.expectedEndDate);
          const ratio = project.budget === 0 ? 0 : Math.min(100, Math.round((project.spent / project.budget) * 100));
          return (
            <article key={project.id} id={project.id} className="scroll-mt-28 rounded-[22px] border border-black/5 bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-black/45">{project.code}</p>
                  <h2 className="text-base font-semibold">
                    <Link href={`/pm/projects/${project.id}`} className="hover:underline">{project.name}</Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{project.location} · {project.client}</p>
                </div>
                <ProjectStatusBadge status={project.status} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Meter label="Progress" value={`${project.progress}%`} width={project.progress} />
                <Meter label="Spent / budget" value={`${formatMoney(project.spent)} / ${formatMoney(project.budget)}`} width={ratio} />
                <div>
                  <p className="text-xs text-muted-foreground">Completion</p>
                  <p className="mt-1 text-sm font-medium">{formatDate(project.expectedEndDate)}</p>
                  <p className="text-xs text-muted-foreground">{days < 0 ? `${Math.abs(days)} days past the date` : `${days} days left`}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-4">
                <Link href={`/pm/projects/${project.id}`} className="text-sm font-medium text-accent hover:underline">Open workspace</Link>
                <Link href="/pm/progress" className="text-sm font-medium text-black/55 hover:underline">Update progress</Link>
              </div>
              <ManagerNotes notes={data.comments.filter((item) => item.kind === "project" && item.workId === project.id)} />
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Meter({ label, value, width }: { label: string; value: string; width: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
      </div>
      <p className="mb-1 text-sm font-medium">{value}</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
        <div className="h-full bg-accent" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
