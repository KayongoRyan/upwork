"use client";

import Link from "next/link";
import { commentHref } from "@/components/pm/manager-notes";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { usePm } from "@/lib/data/admin-store";
import { roleLabel } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import type { WorkComment } from "@/types";

export function PmInbox() {
  const data = usePm();
  return (
    <div>
      <PageHeader
        title="Inbox"
        description="Daily reports and other notices from the site engineers on your projects. Comments the administrator writes on the work land here, and stay on this portal."
      />
      {data.comments.length > 0 ? (
        <section className="mb-6">
          <h2 className="text-sm font-semibold">Comments from the administrator</h2>
          <ul className="mt-2 space-y-2">
            {data.comments.map((comment) => (
              <li key={comment.id} className="rounded-[22px] border border-black/5 bg-card px-4 py-3">
                <p className="text-xs text-black/45">{commentLabel(comment, data)}</p>
                <p className="mt-1 text-sm">{comment.body}</p>
                <p className="mt-2 text-xs text-black/45">{formatDateTime(comment.createdAt)}</p>
                <Link href={commentHref(comment)} className="mt-2 inline-block text-sm font-medium text-accent">Open the work</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
                  {/cost statement/i.test(item.title) ? (
                    <Link href="/pm/costs" className="mt-2 inline-block text-sm font-medium text-accent">Open cost report</Link>
                  ) : /report/i.test(item.title) ? (
                    <Link href="/pm/reports" className="mt-2 inline-block text-sm font-medium text-accent">Review report</Link>
                  ) : null}
                </div>
                <form action="/api/notifications" method="post" className="shrink-0">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="read" value={item.read ? "0" : "1"} />
                  <input type="hidden" name="return" value="/pm/notifications" />
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

function commentLabel(comment: WorkComment, data: ReturnType<typeof usePm>) {
  if (comment.kind === "project") {
    const project = data.projectById(comment.workId);
    return project ? `${project.code} · ${project.name}` : "Project";
  }
  if (comment.kind === "task") return data.tasks.find((task) => task.id === comment.workId)?.title ?? "Task";
  if (comment.kind === "report") return data.reports.find((report) => report.id === comment.workId)?.summary ?? "Engineer report";
  if (comment.kind === "cost") return "Cost statement";
  if (comment.kind === "progress") {
    const mark = data.progressMarks.find((item) => item.id === comment.workId);
    const project = mark ? data.projectById(mark.projectId) : null;
    return project ? `${project.code} progress` : "Progress";
  }
  if (comment.kind === "boq") return data.boq.find((line) => line.id === comment.workId)?.description ?? "Bill line";
  return data.events.find((event) => event.id === comment.workId)?.title ?? "Calendar";
}
