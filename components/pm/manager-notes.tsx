import { cn, formatDateTime } from "@/lib/utils";
import type { WorkComment } from "@/types";

export function ManagerNotes({ notes, className }: { notes: Pick<WorkComment, "id" | "body" | "createdAt">[]; className?: string }) {
  if (notes.length === 0) return null;
  return (
    <div className={cn("mt-3 rounded-2xl bg-[#fff1eb] px-3 py-2", className)}>
      <p className="text-xs font-medium">From the administrator</p>
      {notes.map((note) => (
        <p key={note.id} className="mt-1 text-sm">
          {note.body}
          <span className="ml-2 text-xs text-black/45">{formatDateTime(note.createdAt)}</span>
        </p>
      ))}
    </div>
  );
}

export function commentHref(comment: Pick<WorkComment, "kind" | "workId" | "projectId">) {
  if (comment.kind === "report") return `/pm/reports#${comment.workId}`;
  if (comment.kind === "task") return `/pm/tasks#${comment.workId}`;
  if (comment.kind === "progress") return `/pm/progress#${comment.projectId}`;
  if (comment.kind === "project") return `/pm/projects/${comment.workId}`;
  if (comment.kind === "event") return "/pm#calendar";
  return `/pm/costs#${comment.projectId}`;
}
