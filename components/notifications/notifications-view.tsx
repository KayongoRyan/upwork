"use client";

import { useSearchParams } from "next/navigation";
import { PortalWork } from "@/components/notifications/portal-work";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdmin } from "@/lib/data/admin-store";
import { noticeSourceLabel, notificationTypeLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import type { NotificationType } from "@/types";

const typeFilters = ["all", "unread", "project", "user", "status", "delay", "system"] as const;
const portalFilters = ["all", "project_manager", "site_engineer", "quantity_surveyor", "vertexa"] as const;
const workPortals = new Set<(typeof portalFilters)[number]>([
  "project_manager",
  "site_engineer",
  "quantity_surveyor",
]);

const portalFilterLabel: Record<(typeof portalFilters)[number], string> = {
  all: "All portals",
  project_manager: "Project Manager",
  site_engineer: "Site Engineer",
  quantity_surveyor: "Quantity Surveyor",
  vertexa: "Vertexa site",
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
          ? "The administrator inbox. Notices from the Project Manager, Site Engineer, and Quantity Surveyor portals and the public Vertexa site land here."
          : portal === "vertexa"
            ? "Inquiries submitted on the public site, stored in MongoDB by the Vertexa API."
            : `${portalFilterLabel[portal]} dashboard and the work on that portal. A comment goes only to the project manager.`}
        actions={
          <Button type="button" variant="outline" onClick={() => data.markAllNotifications()}>
            Mark all as read
          </Button>
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
      {workPortals.has(portal) ? (
        <PortalWork portal={portal as "project_manager" | "site_engineer" | "quantity_surveyor"} type={filter} />
      ) : null}
      {workPortals.has(portal) ? <h2 className="mb-2 text-sm font-semibold">Notices</h2> : null}
      {items.length === 0 ? <EmptyState title="No notifications" body="Nothing matches this filter." /> : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-[22px] border border-black/5 bg-card px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!item.read ? <span className="size-2 rounded-full bg-accent" /> : null}
                    <h2 className="text-sm font-semibold">{item.title}</h2>
                    <Badge tone={item.source === "administrator" ? "slate" : "amber"}>{noticeSourceLabel(item.source)}</Badge>
                    <Badge tone={item.type === "delay" ? "red" : item.type === "status" ? "amber" : "slate"}>{notificationTypeLabel[item.type]}</Badge>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{item.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.senderName} · {formatDateTime(item.createdAt)}</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => data.markNotification(item.id, !item.read)}>
                  {item.read ? "Mark unread" : "Mark as read"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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
