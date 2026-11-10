import { applyAction, readState } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { nextId, PREVIEW_PM_ID } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const note = String(form.get("note") ?? "");
  const decision = String(form.get("decision") ?? "");
  const state = readState();
  const report = state.reports.find((item) => item.id === id);
  const project = report ? state.projects.find((item) => item.id === report.projectId) : undefined;
  const engineer = report ? state.users.find((user) => user.id === report.engineerId) : undefined;
  const sender = engineer ? `${engineer.firstName} ${engineer.lastName}` : "the sender";
  if (!report || !project || project.managerId !== PREVIEW_PM_ID) {
    return redirectTo(request, "/pm/reports", { error: "That report is not on your portfolio." });
  }
  if (report.status !== "in_review") {
    return redirectTo(request, "/pm/reports", { error: "Start the review before you send a comment." }, id);
  }
  if (decision !== "approved" && decision !== "rejected") {
    return redirectTo(request, "/pm/reports", { error: "Choose send review or send rejection." }, id);
  }
  if (note.trim().length < 3) {
    return redirectTo(request, "/pm/reports", { error: "Write a comment for the person who sent this report." }, id);
  }
  const stampId = nextId("act");
  await applyAction({
    type: "decide-report",
    id,
    decision,
    note,
    stamp: { id: stampId, at: new Date().toISOString(), notificationId: `ntf-${stampId}` },
  });
  return redirectTo(request, "/pm/reports", { reviewSent: sender }, id);
}
