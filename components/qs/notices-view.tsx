"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useQuantitySurveyor } from "@/lib/data/admin-store";
import { roleLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export function QsNotices() {
  const data = useQuantitySurveyor();
  return (
    <div>
      <PageHeader
        title="Notices"
        description={data.project ? `Measurement and site notices for ${data.project.code} only.` : "No project is assigned to this account."}
      />
      {data.notices.length === 0 ? <EmptyState title="No notices" body="Updates on your project will show here." /> : (
        <ul className="space-y-2">
          {data.notices.map((item) => (
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
                </div>
                <form action="/api/notifications" method="post" className="shrink-0">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="read" value={item.read ? "0" : "1"} />
                  <input type="hidden" name="return" value="/qs/notices" />
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
