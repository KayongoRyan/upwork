"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectStatusBadge } from "@/components/shared/status-badge";
import { useAdmin } from "@/lib/data/admin-store";
import { projectStatusLabel, projectStatuses } from "@/lib/labels";
import { formatMoney } from "@/lib/utils";

export function OverviewView() {
  const data = useAdmin();
  const [status, setStatus] = useState("all");
  const projects = data.projects.filter((project) => status === "all" || project.status === status);

  return (
    <div>
      <PageHeader
        title="Project overview"
        description="A portfolio view of progress and budget use. Open a card to edit the record."
        actions={
          <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-input bg-white px-3 text-sm">
            <option value="all">All statuses</option>
            {projectStatuses.map((item) => <option key={item} value={item}>{projectStatusLabel[item]}</option>)}
          </select>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => {
          const ratio = project.budget === 0 ? 0 : Math.min(100, Math.round((project.spent / project.budget) * 100));
          return (
            <article key={project.id} className="flex flex-col rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{project.code}</p>
                  <h2 className="mt-1 text-base font-semibold">{project.name}</h2>
                </div>
                <ProjectStatusBadge status={project.status} />
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Manager</dt>
                  <dd>{data.managerName(project)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Location</dt>
                  <dd>{project.location}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>{project.progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-info" style={{ width: `${project.progress}%` }} />
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Spent / budget (demo)</span>
                  <span>{ratio}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-black" style={{ width: `${ratio}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatMoney(project.spent)} of {formatMoney(project.budget)}</p>
              </div>
              <Link href={`/admin/projects?focus=${project.id}`} className="mt-4 text-sm font-medium text-info hover:underline">
                Open record
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
