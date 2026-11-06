"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { navItems } from "@/lib/navigation";
import { useAdmin } from "@/lib/data/admin-store";
import { portalForPath } from "@/lib/portals";
import { fullName } from "@/lib/utils";

export function SearchDialog({
  open,
  onOpenChange,
  pages = navItems,
  projectIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages?: typeof navItems;
  projectIds?: string[];
}) {
  const router = useRouter();
  const { projects, users, employees } = useAdmin();
  const [query, setQuery] = useState("");

  function close(next: boolean) {
    if (!next) setQuery("");
    onOpenChange(next);
  }

  const needle = query.trim().toLowerCase();
  const pageHits = useMemo(
    () => pages.filter((item) => !needle || `${item.label} ${item.description}`.toLowerCase().includes(needle)),
    [needle, pages],
  );
  const allowed = projectIds ? new Set(projectIds) : null;
  const projectHits = projects
    .filter((project) => !allowed || allowed.has(project.id))
    .filter((project) => !needle || `${project.name} ${project.code} ${project.location}`.toLowerCase().includes(needle))
    .slice(0, 5);
  const userHits = users
    .filter((user) => !needle || `${fullName(user)} ${user.email}`.toLowerCase().includes(needle))
    .slice(0, 5);
  const employeeHits = employees
    .filter((employee) => !needle || `${fullName(employee)} ${employee.employeeCode}`.toLowerCase().includes(needle))
    .slice(0, 5);

  function go(href: string) {
    close(false);
    const owner = portalForPath(href);
    if (owner && window.location.port !== String(owner.port)) {
      window.location.assign(`http://localhost:${owner.port}${href}`);
      return;
    }
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title="Search the preview" description="Find a page, project, user, or employee. This searches local demonstration data." className="sm:max-w-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, people, pages" className="pl-9" />
        </div>
        <div className="max-h-80 space-y-4 overflow-y-auto">
          <ResultGroup title="Pages">
            {pageHits.slice(0, 6).map((item) => (
              <ResultButton key={item.href} title={item.label} meta={item.section} onClick={() => go(item.href)} />
            ))}
          </ResultGroup>
          <ResultGroup title="Projects">
            {projectHits.map((project) => (
              <ResultButton
                key={project.id}
                title={project.name}
                meta={project.code}
                onClick={() => go(allowed ? "/se" : `/admin/projects?focus=${project.id}`)}
              />
            ))}
            {needle && projectHits.length === 0 ? <p className="px-2 text-xs text-muted-foreground">No projects</p> : null}
          </ResultGroup>
          {allowed ? null : (
            <>
              <ResultGroup title="Users">
                {userHits.map((user) => (
                  <ResultButton key={user.id} title={fullName(user)} meta={user.email} onClick={() => go(`/admin/users?focus=${user.id}`)} />
                ))}
              </ResultGroup>
              <ResultGroup title="Employees">
                {employeeHits.map((employee) => (
                  <ResultButton
                    key={employee.id}
                    title={fullName(employee)}
                    meta={employee.employeeCode}
                    onClick={() => go(`/admin/employees?focus=${employee.id}`)}
                  />
                ))}
              </ResultGroup>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 px-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function ResultButton({ title, meta, onClick }: { title: string; meta: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted">
      <span className="truncate text-sm font-medium">{title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
    </button>
  );
}
