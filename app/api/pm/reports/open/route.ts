import { applyAction, readState } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { nextId, PREVIEW_PM_ID } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const state = readState();
  const report = state.reports.find((item) => item.id === id);
  const project = report ? state.projects.find((item) => item.id === report.projectId) : undefined;
  const engineer = report ? state.users.find((user) => user.id === report.engineerId) : undefined;
  if (!report || !project || project.managerId !== PREVIEW_PM_ID) {
    return redirectTo(request, "/pm/reports", { error: "That report is not on your portfolio." });
  }
  if (report.status !== "submitted") {
    return redirectTo(request, "/pm/reports", { error: "Only a submitted report can be opened for review." });
  }
  const stampId = nextId("act");
  await applyAction({
    type: "open-report-review",
    id,
    stamp: { id: stampId, at: new Date().toISOString(), notificationId: `ntf-${stampId}` },
  });
  const sender = engineer ? `${engineer.firstName} ${engineer.lastName}` : "the sender";
  return redirectTo(request, "/pm/reports", { opened: sender }, id);
}
