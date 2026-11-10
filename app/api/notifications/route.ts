import { isManagerFieldNotice } from "@/lib/notices";
import { applyAction, readState } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { PREVIEW_PM_ID, PREVIEW_QS_ID } from "@/lib/utils";
import type { AppNotification } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETURNS = new Set(["/admin/notifications", "/pm/notifications", "/qs/notices"]);
const PORTALS = new Set(["project_manager", "site_engineer", "quantity_surveyor"]);
const TYPES = new Set(["unread", "project", "user", "status", "delay", "system"]);

export async function POST(request: Request) {
  const form = await request.formData();
  const back = String(form.get("return") ?? "");
  if (!RETURNS.has(back)) return redirectTo(request, "/admin/notifications");
  const query = back === "/admin/notifications" ? keptFilters(form) : {};

  const state = readState();
  if (form.get("all") === "1") {
    if (back !== "/admin/notifications") return redirectTo(request, back);
    await applyAction({ type: "mark-all-notifications" });
    return redirectTo(request, back, { ...query, read: "all" });
  }

  const id = String(form.get("id") ?? "");
  const item = state.notifications.find((notice) => notice.id === id);
  const read = form.get("read") !== "0";
  if (!item || !visible(state, back, item)) return redirectTo(request, back, query);
  await applyAction({ type: "mark-notification", id, read });
  return redirectTo(request, back, query, id);
}

function keptFilters(form: FormData) {
  const query: Record<string, string> = {};
  const portal = String(form.get("portal") ?? "");
  const type = String(form.get("type") ?? "");
  if (PORTALS.has(portal)) query.portal = portal;
  if (TYPES.has(type)) query.type = type;
  return query;
}

function visible(state: ReturnType<typeof readState>, back: string, item: AppNotification) {
  if (back === "/admin/notifications") return true;
  if (back === "/pm/notifications") {
    const projects = state.projects.filter((project) => project.managerId === PREVIEW_PM_ID);
    return isManagerFieldNotice(item, projects);
  }
  const surveyor = state.users.find((user) => user.id === PREVIEW_QS_ID);
  const project = state.projects.find((item) => item.id === surveyor?.projectId);
  return project ? isManagerFieldNotice(item, [project]) : false;
}
