"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdmin } from "@/lib/data/admin-store";
import { notificationTypeLabel, roleLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import type { NotificationType, UserRole } from "@/types";

const typeFilters = ["all", "unread", "project", "user", "status", "delay", "system"] as const;
const portalFilters = ["all", "other", "project_manager", "site_engineer", "quantity_surveyor", "administrator"] as const;

const portalFilterLabel: Record<(typeof portalFilters)[number], string> = {
  all: "All portals",
  other: "Other portals",
  project_manager: "Project Manager",
  site_engineer: "Site Engineer",
  quantity_surveyor: "Quantity Surveyor",
  administrator: "This portal",
};

export function NotificationsView() {
  const data = useAdmin();
  const [filter, setFilter] = useState<(typeof typeFilters)[number]>("all");
  const [portal, setPortal] = useState<(typeof portalFilters)[number]>("all");
  const items = data.notifications.filter((item) => {
    const typeOk = filter === "all" || (filter === "unread" ? !item.read : item.type === filter);
    const portalOk =
      portal === "all" ||
      (portal === "other" ? item.source !== "administrator" : item.source === portal);
    return typeOk && portalOk;
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="The administrator inbox. Notices raised in the Project Manager, Site Engineer, and Quantity Surveyor portals land here."
        actions={<Button type="button" variant="outline" onClick={() => data.markAllNotifications()}>Mark all as read</Button>}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        {portalFilters.map((item) => (
          <Button key={item} type="button" size="sm" variant={portal === item ? "navy" : "outline"} onClick={() => setPortal(item)}>
            {portalFilterLabel[item]}
          </Button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {typeFilters.map((item) => (
          <Button key={item} type="button" size="sm" variant={filter === item ? "navy" : "outline"} onClick={() => setFilter(item)}>
            {item === "all" ? "All types" : item === "unread" ? "Unread" : notificationTypeLabel[item as NotificationType]}
          </Button>
        ))}
      </div>
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
