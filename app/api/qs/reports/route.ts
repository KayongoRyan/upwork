import { billLines, sameBill } from "@/lib/boq";
import { requireApiSession, verifyCsrf } from "@/lib/server/auth";
import { readState } from "@/lib/server/memory";
import { applyPortalAction } from "@/lib/server/portal-store";
import { persistOr, redirectTo } from "@/lib/server/redirect";
import { nextId } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const __session = await requireApiSession("quantity_surveyor");
  if (__session instanceof Response) return __session;
  const __csrf = verifyCsrf(request, __session);
  if (__csrf) return __csrf;
  const state = await readState();
  const surveyor = state.users.find((user) => user.id === __session.id && user.role === "quantity_surveyor" && user.status === "active");
  const project = surveyor?.projectId ? state.projects.find((item) => item.id === surveyor.projectId) : undefined;
  const manager = project ? state.users.find((user) => user.id === project.managerId) : undefined;
  if (!surveyor || !project || !manager) return redirectTo(request, "/qs/reports", { error: "No project is assigned to this account." });

  const lines = billLines(state.boq, project.id);
  if (lines.length === 0) return redirectTo(request, "/qs/reports", { error: "There is no bill to send." });
  const already = (state.costReports ?? []).some(
    (report) => report.projectId === project.id && report.submittedBy === surveyor.id && sameBill(report.lines, lines),
  );
  if (already) return redirectTo(request, "/qs/reports", { error: "These figures are already with your project manager." });

  const id = nextId("cst");
  return persistOr(
    async () => {
      await applyPortalAction("quantity_surveyor", {
        type: "send-cost-report",
        surveyorId: surveyor.id,
        stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}`, actorId: __session.id, actorName: `${__session.firstName} ${__session.lastName}`, actorRole: __session.role },
      });
      return redirectTo(request, "/qs/reports", { sent: `${manager.firstName} ${manager.lastName}` });
    },
    () => redirectTo(request, "/qs/reports", { error: "The cost report could not be saved. Try again." }),
  );
}
