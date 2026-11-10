import { billLines, sameBill } from "@/lib/boq";
import { applyAction, readState } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { nextId, PREVIEW_QS_ID } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const state = readState();
  const surveyor = state.users.find((user) => user.id === PREVIEW_QS_ID && user.role === "quantity_surveyor" && user.status === "active");
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
  await applyAction({
    type: "send-cost-report",
    surveyorId: surveyor.id,
    stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` },
  });
  return redirectTo(request, "/qs/reports", { sent: `${manager.firstName} ${manager.lastName}` });
}
