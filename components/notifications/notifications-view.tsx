"use client";

import { useSearchParams } from "next/navigation";
import { PortalWork } from "@/components/notifications/portal-work";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdmin } from "@/lib/data/admin-store";
import { notificationTypeLabel, roleLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import type { NotificationType, UserRole } from "@/types";

const typeFilters = ["all", "unread", "project", "user", "status", "delay", "system"] as const;
const portalFilters = ["all", "project_manager", "site_engineer", "quantity_surveyor"] as const;

const portalFilterLabel: Record<(typeof portalFilters)[number], string> = {
  all: "All portals",
  project_manager: "Project Manager",
  site_engineer: "Site Engineer",
  quantity_surveyor: "Quantity Surveyor",
};

export function NotificationsView() {
  const data = useAdmin();
  const params = useSearchParams();
  const portal = readFilter(portalFilters, params.get("portal"));
  const filter = readFilter(typeFilters, params.get("type"));
  const items = data.notifications.filter((item) => {
    const typeOk = filter === "all" || (filter === "unread" ? !item.read : item.type === filter);
    const portalOk = portal === "all" || item.source === portal;
    return typeOk && portalOk;
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={portal === "all"
          ? "The administrator inbox. Notices raised in the Project Manager, Site Engineer, and Quantity Surveyor portals land here."
          : `${portalFilterLabel[portal]} dashboard and the work on that portal. A comment goes only to the project manager.`}
        actions={
          <form action="/api/notifications" method="post">
            <input type="hidden" name="all" value="1" />
            <input type="hidden" name="return" value="/admin/notifications" />
            <FilterFields portal={portal} type={filter} />
            <Button type="submit" variant="outline">Mark all as read</Button>
          </form>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {portalFilters.map((item) => (
          <Button key={item} asChild size="sm" variant={portal === item ? "navy" : "outline"}>
            <a href={filterHref(item, filter)} aria-current={portal === item ? "true" : undefined}>{portalFilterLabel[item]}</a>
          </Button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {typeFilters.map((item) => (
          <Button key={item} asChild size="sm" variant={filter === item ? "navy" : "outline"}>
            <a href={filterHref(portal, item)} aria-current={filter === item ? "true" : undefined}>
              {item === "all" ? "All types" : item === "unread" ? "Unread" : notificationTypeLabel[item as NotificationType]}
            </a>
          </Button>
        ))}
      </div>
      {portal !== "all" ? <PortalWork portal={portal} type={filter} /> : null}
      {portal !== "all" ? <h2 className="mb-2 text-sm font-semibold">Notices</h2> : null}
      {items.length === 0 ? <EmptyState title="No notifications" body="Nothing matches this filter." /> : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-[22px] border border-black/5 bg-card px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!item.read ? <span className="size-2 rounded-full bg-accent" /> : null}
                    <h2 className="text-sm font-semibold">{item.title}</h2>
                    <Badge tone={item.source === "administrator" ? "slate" : "amber"}>{roleLabel[item.source as UserRole]}</Badge>
                    <Badge tone={item.type === "delay" ? "red" : item.type === "status" ? "amber" : "slate"}>{notificationTypeLabel[item.type]}</Badge>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{item.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.senderName} · {formatDateTime(item.createdAt)}</p>
                </div>
                <form action="/api/notifications" method="post" className="shrink-0">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="read" value={item.read ? "0" : "1"} />
                  <input type="hidden" name="return" value="/admin/notifications" />
                  <FilterFields portal={portal} type={filter} />
                  <Button type="submit" size="sm" variant="outline">{item.read ? "Mark unread" : "Mark as read"}</Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterFields({ portal, type }: { portal: (typeof portalFilters)[number]; type: (typeof typeFilters)[number] }) {
  return (
    <>
      {portal !== "all" ? <input type="hidden" name="portal" value={portal} /> : null}
      {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
    </>
  );
}

function filterHref(portal: (typeof portalFilters)[number], type: (typeof typeFilters)[number]) {
  const query = new URLSearchParams();
  if (portal !== "all") query.set("portal", portal);
  if (type !== "all") query.set("type", type);
  const search = query.toString();
  return search ? `/admin/notifications?${search}` : "/admin/notifications";
}

function readFilter<T extends string>(allowed: readonly T[], value: string | null): T {
  return allowed.find((item) => item === value) ?? allowed[0];
}
