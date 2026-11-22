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
  const id = String(form.get("id") ?? "");
  const state = await readState();
  const report = state.reports.find((item) => item.id === id);
  const project = report ? state.projects.find((item) => item.id === report.projectId) : undefined;
  const engineer = report ? state.users.find((user) => user.id === report.engineerId) : undefined;
  if (!report || !project || project.managerId !== __session.id) {
    return redirectTo(request, "/pm/reports", { error: "That report is not on your portfolio." });
  }
  if (report.status !== "submitted") {
    return redirectTo(request, "/pm/reports", { error: "Only a submitted report can be opened for review." });
  }
  const stampId = nextId("act");
  const sender = engineer ? `${engineer.firstName} ${engineer.lastName}` : "the sender";
  return persistOr(
    async () => {
      await applyPortalAction("project_manager", {
        type: "open-report-review",
        id,
        stamp: { id: stampId, at: new Date().toISOString(), notificationId: `ntf-${stampId}`, actorId: __session.id, actorName: `${__session.firstName} ${__session.lastName}`, actorRole: __session.role },
      });
      return redirectTo(request, "/pm/reports", { opened: sender }, id);
    },
    () => redirectTo(request, "/pm/reports", { error: "The review could not be opened. Try again." }, id),
  );
}
