"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ProjectForm } from "@/components/projects/project-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SortButton } from "@/components/shared/sort-button";
import { ProjectStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAdmin } from "@/lib/data/admin-store";
import { projectStatusLabel, projectStatuses } from "@/lib/labels";
import { usePagedRows } from "@/lib/use-paged-rows";
import { formatDate, formatMoney } from "@/lib/utils";
import type { Project } from "@/types";
import type { ProjectFormValues } from "@/lib/validations/schemas";

export function ProjectsView() {
  const data = useAdmin();
  const focus = useSearchParams().get("focus");
  const [seenFocus, setSeenFocus] = useState(focus);
  const [viewId, setViewId] = useState<string | null>(focus);
  const [editor, setEditor] = useState<Project | null | "new">(null);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [status, setStatus] = useState("all");
  const [formError, setFormError] = useState<string | null>(null);
  if (focus !== seenFocus) {
    setSeenFocus(focus);
    setViewId(focus);
  }

  const managers = data.users.filter((user) => user.role === "project_manager");
  const table = usePagedRows({
    rows: data.projects,
    filterKey: status,
    filter: (project) => status === "all" || project.status === status,
    search: (project, query) => {
      const manager = data.managerName(project).toLowerCase();
      return `${project.name} ${project.code} ${project.location} ${project.client} ${manager}`.toLowerCase().includes(query);
    },
    accessors: {
      name: (project) => project.name,
      code: (project) => project.code,
      manager: (project) => data.managerName(project),
      location: (project) => project.location,
      start: (project) => project.startDate,
      end: (project) => project.expectedEndDate,
      budget: (project) => project.budget,
      progress: (project) => project.progress,
      status: (project) => project.status,
    },
    initialSort: { key: "name", dir: "asc" },
  });

  const viewing = data.projects.find((project) => project.id === viewId) ?? null;

  function save(values: ProjectFormValues) {
    const result = editor === "new" ? data.createProject(values) : editor ? data.updateProject(editor.id, values) : { ok: false as const, error: "Nothing to save." };
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    toast.success(editor === "new" ? "Project created in this preview." : "Project updated in this preview.");
    setEditor(null);
    setFormError(null);
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Register and maintain the construction portfolio. Changes stay in this browser session."
        actions={
          <Button type="button" onClick={() => { setFormError(null); setEditor("new"); }}>
            <Plus />
            Create project
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input value={table.query} onChange={(event) => table.setQuery(event.target.value)} placeholder="Search name, code, client, location, manager" className="sm:max-w-md" />
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 rounded-lg border border-input bg-white px-3 text-sm"
        >
          <option value="all">All statuses</option>
          {projectStatuses.map((item) => (
            <option key={item} value={item}>
              {projectStatusLabel[item]}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-black/[0.03] text-left text-[11px] text-muted-foreground">
              <tr>
                {[
                  ["name", "Project"],
                  ["code", "Code"],
                  ["manager", "Manager"],
                  ["location", "Location"],
                  ["start", "Start"],
                  ["end", "Completion"],
                  ["budget", "Budget"],
                  ["progress", "Progress"],
                  ["status", "Status"],
                ].map(([key, label]) => (
                  <th key={key} className="px-3 py-3">
                    <SortButton label={label} active={table.sort?.key === key} dir={table.sort?.dir} onClick={() => table.toggleSort(key)} />
                  </th>
                ))}
                <th className="px-3 py-3 font-medium tracking-wide uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {table.pageRows.map((project) => (
                <tr key={project.id} className="border-t border-border">
                  <td className="px-3 py-3 font-medium">
                    <Link href={`/admin/projects/${project.id}`} className="hover:underline">{project.name}</Link>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{project.code}</td>
                  <td className="px-3 py-3">{data.managerName(project)}</td>
                  <td className="px-3 py-3">{project.location}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDate(project.startDate)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDate(project.expectedEndDate)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatMoney(project.budget, data.settings.currency)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-accent" style={{ width: `${project.progress}%` }} />
                      </div>
                      <span>{project.progress}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <ProjectStatusBadge status={project.status} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <Button type="button" size="icon" variant="ghost" aria-label={`View ${project.name}`} onClick={() => setViewId(project.id)}>
                        <Eye />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${project.name}`} onClick={() => { setFormError(null); setEditor(project); }}>
                        <Pencil />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Delete ${project.name}`} onClick={() => setPendingDelete(project)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {table.total === 0 ? (
          <EmptyState title="No projects match" body="Change the search or status filter, or create a project." />
        ) : (
          <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={6} onPage={table.setPage} />
        )}
      </div>

      <Dialog open={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        {editor !== null ? (
          <DialogContent
            className="sm:max-w-2xl"
            title={editor === "new" ? "Create project" : "Edit project"}
            description="Saved in this preview only. Budget figures are demonstration data."
          >
            <ProjectForm
              project={editor === "new" ? null : editor}
              managers={managers}
              serverError={formError}
              onCancel={() => setEditor(null)}
              onSubmit={save}
            />
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewId(null); }}>
        {viewing ? (
          <DialogContent title={viewing.name} description={viewing.code} className="sm:max-w-xl">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Client" value={viewing.client} />
              <Detail label="Location" value={viewing.location} />
              <Detail label="Manager" value={data.managerName(viewing)} />
              <Detail label="Status" value={<ProjectStatusBadge status={viewing.status} />} />
              <Detail label="Start" value={formatDate(viewing.startDate)} />
              <Detail label="Expected completion" value={formatDate(viewing.expectedEndDate)} />
              <Detail label="Budget" value={`${formatMoney(viewing.budget, data.settings.currency)} demo`} />
              <Detail label="Spent" value={`${formatMoney(viewing.spent, data.settings.currency)} demo`} />
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Description</dt>
                <dd className="mt-1">{viewing.description}</dd>
              </div>
            </dl>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setViewId(null)}>Close</Button>
              <Button variant="outline" asChild>
                <Link href={`/admin/projects/${viewing.id}`}>Open workspace</Link>
              </Button>
              <Button type="button" onClick={() => { setViewId(null); setFormError(null); setEditor(viewing); }}>Edit</Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete project?"
        body={pendingDelete ? `${pendingDelete.name} will be removed from this preview. Assigned people will be unassigned, and its tasks will be removed.` : ""}
        confirmLabel="Delete project"
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        onConfirm={() => {
          if (!pendingDelete) return;
          data.deleteProject(pendingDelete.id);
          toast.success("Project deleted from this preview.");
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
