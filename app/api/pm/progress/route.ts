import { readState } from "@/lib/server/memory";
import { requireApiSession, verifyCsrf } from "@/lib/server/auth";
import { applyPortalAction } from "@/lib/server/portal-store";
import { persistOr, redirectTo } from "@/lib/server/redirect";
import { nextId } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const __session = await requireApiSession("project_manager");
  if (__session instanceof Response) return __session;
  const __csrf = verifyCsrf(request, __session);
  if (__csrf) return __csrf;
  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "");
  const raw = String(form.get("progress") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  const state = await readState();
  const project = state.projects.find((item) => item.id === projectId && item.managerId === __session.id);
  if (!project) return redirectTo(request, "/pm/progress", { error: "That project is not on your portfolio." });
  if (project.status === "completed") return redirectTo(request, "/pm/progress", { error: "A completed project keeps its recorded progress." });
  if (!/^\d{1,3}$/.test(raw)) return redirectTo(request, "/pm/progress", { error: "Progress must be a whole number from 0 to 100." });
  const progress = Number(raw);
  if (progress > 100) return redirectTo(request, "/pm/progress", { error: "Progress must be a whole number from 0 to 100." });
  const id = nextId("act");
  return persistOr(
    async () => {
      await applyPortalAction("project_manager", {
        type: "set-progress",
        id: project.id,
        progress,
        note,
        stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}`, actorId: __session.id, actorName: `${__session.firstName} ${__session.lastName}`, actorRole: __session.role },
      });
      return redirectTo(request, "/pm/progress", { saved: project.code });
    },
    () => redirectTo(request, "/pm/progress", { error: "The progress update could not be saved. Try again." }),
  );
}
