import { applyAction, readState } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { fullName, nextId } from "@/lib/utils";
import type { AdminState, WorkKind } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORTALS = new Set(["project_manager", "site_engineer", "quantity_surveyor"]);
const TYPES = new Set(["unread", "project", "user", "status", "delay", "system"]);
const KINDS = new Set<WorkKind>(["project", "task", "report", "cost", "progress", "boq", "event"]);

export async function POST(request: Request) {
  const form = await request.formData();
  const portal = String(form.get("portal") ?? "");
  const type = String(form.get("type") ?? "");
  const kind = String(form.get("kind") ?? "") as WorkKind;
  const workId = String(form.get("workId") ?? "");
  const body = String(form.get("body") ?? "").trim();
  const query: Record<string, string> = {};
  if (PORTALS.has(portal)) query.portal = portal;
  if (TYPES.has(type)) query.type = type;

  const fail = (error: string) => redirectTo(request, "/admin/notifications", { ...query, error }, workId);
  if (!PORTALS.has(portal) || !KINDS.has(kind)) return fail("That work is not on this portal.");
  if (body.length < 3 || body.length > 500) return fail("Write a comment for the project manager.");

  const state = readState();
  const projectId = projectFor(state, kind, workId);
  if (projectId == null || !onPortal(state, portal, kind, workId, projectId)) return fail("That work is not on this portal.");

  const id = nextId("cmt");
  await applyAction({
    type: "add-work-comment",
    kind,
    workId,
    projectId,
    body,
    stamp: { id, at: new Date().toISOString() },
  });
  return redirectTo(request, "/admin/notifications", { ...query, commented: "1" }, workId);
}

function projectFor(state: AdminState, kind: WorkKind, workId: string) {
  if (kind === "project") return state.projects.some((project) => project.id === workId) ? workId : null;
  if (kind === "task") return state.tasks.find((task) => task.id === workId)?.projectId ?? null;
  if (kind === "report") return state.reports.find((report) => report.id === workId)?.projectId ?? null;
  if (kind === "cost") return (state.costReports ?? []).find((report) => report.id === workId)?.projectId ?? null;
  if (kind === "progress") return (state.progressMarks ?? []).find((mark) => mark.id === workId)?.projectId ?? null;
  if (kind === "boq") return state.boq.find((line) => line.id === workId)?.projectId ?? null;
  if (kind === "event") return (state.calendarEvents ?? []).some((event) => event.id === workId) ? "" : null;
  return null;
}

function onPortal(state: AdminState, portal: string, kind: WorkKind, workId: string, projectId: string) {
  if (portal === "project_manager") {
    if (kind === "event") return true;
    const project = state.projects.find((item) => item.id === projectId);
    return Boolean(project && state.users.some((user) => user.id === project.managerId && user.role === "project_manager"));
  }
  if (portal === "site_engineer") {
    if (kind === "report") {
      const report = state.reports.find((item) => item.id === workId);
      return Boolean(report && state.users.some((user) => user.id === report.engineerId && user.role === "site_engineer"));
    }
    if (kind === "task") {
      const task = state.tasks.find((item) => item.id === workId);
      return Boolean(task && state.users.some((user) => user.role === "site_engineer" && fullName(user) === task.assignee));
    }
    if (kind === "project") return state.users.some((user) => user.role === "site_engineer" && user.projectId === projectId);
    return false;
  }
  if (kind === "boq" || kind === "cost" || kind === "project") {
    return state.users.some((user) => user.role === "quantity_surveyor" && user.projectId === projectId);
  }
  return false;
}
