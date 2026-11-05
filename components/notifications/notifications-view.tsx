"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdmin } from "@/lib/data/admin-store";
import { notificationTypeLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import type { NotificationType } from "@/types";

const filters = ["all", "unread", "project", "user", "status", "delay", "system"] as const;

export function NotificationsView() {
  const data = useAdmin();
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const reduce = useReducedMotion();
  const items = data.notifications.filter((item) => {
    if (filter === "all") return true;
    if (filter === "unread") return !item.read;
    return item.type === filter;
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Preview alerts for projects, accounts, and delays. Read state is kept for this session."
        actions={<Button type="button" variant="outline" onClick={() => data.markAllNotifications()}>Mark all as read</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((item) => (
          <Button key={item} type="button" size="sm" variant={filter === item ? "navy" : "outline"} onClick={() => setFilter(item)}>
            {item === "all" ? "All" : item === "unread" ? "Unread" : notificationTypeLabel[item as NotificationType]}
          </Button>
        ))}
      </div>
      {items.length === 0 ? <EmptyState title="No notifications" body="Nothing matches this filter." /> : (
        <ul className="space-y-2">
          {items.map((item) => (
            <motion.li
              layout
              key={item.id}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!item.read ? <span className="size-2 rounded-full bg-accent" /> : null}
                    <h2 className="text-sm font-semibold">{item.title}</h2>
                    <Badge tone={item.type === "delay" ? "red" : item.type === "status" ? "amber" : "slate"}>{notificationTypeLabel[item.type]}</Badge>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{item.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => data.markNotification(item.id, !item.read)}>
                  {item.read ? "Mark unread" : "Mark as read"}
                </Button>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
