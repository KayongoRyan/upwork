import { billLines, sameBill } from "@/lib/boq";
import { readCostEdits } from "@/lib/server/cost-lines";
import { applyAction, readState } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { nextId, PREVIEW_PM_ID } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "");
  const state = readState();
  const project = state.projects.find((item) => item.id === projectId && item.managerId === PREVIEW_PM_ID);
  const surveyor = state.users.find((user) => user.role === "quantity_surveyor" && user.status === "active" && user.projectId === projectId);
  const rows = state.boq.filter((item) => item.projectId === projectId);
  if (!project) return redirectTo(request, "/pm/costs", { error: "That project is not on your portfolio." });
  if (!surveyor) return redirectTo(request, "/pm/costs", { error: "No quantity surveyor is assigned to that project." });
  if (rows.length === 0) return redirectTo(request, "/pm/costs", { error: "There is no bill to submit." });
  const parsed = readCostEdits(form, rows);
  if (!parsed.ok) return redirectTo(request, "/pm/costs", { error: parsed.error });
  const edited = nextId("act");
  await applyAction({
    type: "revise-cost-bill",
    projectId,
    lines: parsed.lines,
    stamp: { id: edited, at: new Date().toISOString(), notificationId: `ntf-${edited}` },
  });
  const fresh = readState();
  const live = billLines(fresh.boq, projectId);
  const latest = (fresh.costReports ?? []).find((report) => report.projectId === projectId && report.status === "submitted");
  if (latest && sameBill(latest.lines, live)) {
    return redirectTo(request, "/pm/costs", { error: "These figures are already with the administrator. Change a quantity or rate to send an update." });
  }
  const id = nextId("act");
  await applyAction({
    type: "submit-cost-report",
    projectId,
    surveyorId: surveyor.id,
    stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` },
  });
  return redirectTo(request, "/pm/costs", { sent: fresh.settings.profileName });
}
