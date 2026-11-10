import { applyAction, readState } from "@/lib/server/memory";
import { readCostEdits } from "@/lib/server/cost-lines";
import { redirectTo } from "@/lib/server/redirect";
import { nextId, PREVIEW_PM_ID } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "");
  const state = readState();
  const project = state.projects.find((item) => item.id === projectId && item.managerId === PREVIEW_PM_ID);
  if (!project) return redirectTo(request, "/pm/costs", { error: "That project is not on your portfolio." });
  const rows = state.boq.filter((item) => item.projectId === project.id);
  if (rows.length === 0) return redirectTo(request, "/pm/costs", { error: "There is no bill to edit." });
  const parsed = readCostEdits(form, rows);
  if (!parsed.ok) return redirectTo(request, "/pm/costs", { error: parsed.error });
  const id = nextId("act");
  await applyAction({
    type: "revise-cost-bill",
    projectId,
    lines: parsed.lines,
    stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` },
  });
  return redirectTo(request, "/pm/costs", { edited: project.code });
}
