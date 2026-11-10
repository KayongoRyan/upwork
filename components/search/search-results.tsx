"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { useAdmin } from "@/lib/data/admin-store";
import { navItems, pmNavItems, qsNavItems, seNavItems } from "@/lib/navigation";
import { searchRecords } from "@/lib/search";
import { PREVIEW_PM_ID, PREVIEW_QS_ID, PREVIEW_SE_ID } from "@/lib/utils";

export function SearchResults({ portal }: { portal: "admin" | "pm" | "se" | "qs" }) {
  const query = useSearchParams().get("q")?.trim() ?? "";
  const data = useAdmin();
  const pmIds = data.projects.filter((project) => project.managerId === PREVIEW_PM_ID).map((project) => project.id);
  const siteId = data.users.find((user) => user.id === (portal === "se" ? PREVIEW_SE_ID : PREVIEW_QS_ID))?.projectId ?? null;
  const projectIds = portal === "admin" ? undefined : portal === "pm" ? pmIds : siteId ? [siteId] : [];
  const pages = portal === "pm" ? pmNavItems : portal === "se" ? seNavItems : portal === "qs" ? qsNavItems : navItems;
  const groups = searchRecords({
    query,
    pages,
    projects: data.projects,
    users: data.users,
    employees: data.employees,
    documents: data.documents ?? [],
    tasks: data.tasks,
    projectIds,
    projectBase: portal === "pm" ? "/pm/projects" : undefined,
    portal: portal === "pm" ? "project_manager" : portal === "se" ? "site_engineer" : portal === "qs" ? "quantity_surveyor" : "administrator",
  });
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div>
      <PageHeader
        title={query ? `Results for “${query}”` : "Search"}
        description={query ? `${total} record${total === 1 ? "" : "s"} match the word you entered.` : "Type a name, project, drawing, or task, then press Enter."}
      />
      {!query ? null : total === 0 ? (
        <p className="rounded-[22px] border border-black/5 bg-card px-4 py-6 text-sm text-black/60">Nothing in the preview matches “{query}”.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.title} className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
              <h2 className="text-[11px] font-semibold tracking-[0.14em] text-black/40 uppercase">{group.title}</h2>
              <ul className="mt-3 divide-y divide-black/5">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="flex items-center justify-between gap-3 py-3 hover:text-accent">
                      <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
                      <span className="shrink-0 text-xs text-black/45">{item.meta}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
