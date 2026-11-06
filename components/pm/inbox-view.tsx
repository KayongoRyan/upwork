"use client";

import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { usePm } from "@/lib/data/admin-store";
import { roleLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export function PmInbox() {
  const data = usePm();
  return (
    <div>
      <PageHeader
        title="Inbox"
        description="Daily reports and other notices from the site engineers on your projects. Approvals you make are delivered to the administrator."
      />
      {data.inbox.length === 0 ? <EmptyState title="No incoming notices" body="Engineer and surveyor notices will show here." /> : (
        <ul className="space-y-2">
          {data.inbox.map((item) => (
            <li key={item.id} className="rounded-[22px] border border-black/5 bg-card px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!item.read ? <span className="size-2 rounded-full bg-accent" /> : null}
                    <h2 className="text-sm font-semibold">{item.title}</h2>
                    <Badge tone="amber">{roleLabel[item.source]}</Badge>
                  </div>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{item.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.senderName} · {formatDateTime(item.createdAt)}</p>
                  {/report/i.test(item.title) ? (
                    <Link href="/pm/reports" className="mt-2 inline-block text-sm font-medium text-accent">Review report</Link>
                  ) : null}
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
