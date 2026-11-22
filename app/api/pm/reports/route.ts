import { readState } from "@/lib/server/memory";
import { requireApiSession, verifyCsrf } from "@/lib/server/auth";
import { applyPortalAction } from "@/lib/server/portal-store";
import { redirectTo } from "@/lib/server/redirect";
import { nextId } from "@/lib/utils";
import { engineerReportSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const __session = await requireApiSession("project_manager");
  if (__session instanceof Response) return __session;
  const __csrf = verifyCsrf(request, __session);
  if (__csrf) return __csrf;
  const form = await request.formData();
  const parsed = engineerReportSchema.safeParse({
    projectId: form.get("projectId"),
    engineerId: form.get("engineerId"),
    periodStart: form.get("periodStart"),
    periodEnd: form.get("periodEnd"),
    progress: form.get("progress"),
    summary: form.get("summary"),
    issues: form.get("issues") ?? "",
  });
  if (!parsed.success) {
    return redirectTo(request, "/pm/reports", { error: parsed.error.issues[0]?.message ?? "Check the form and try again." });
  }
  const state = await readState();
  const project = state.projects.find((item) => item.id === parsed.data.projectId && item.managerId === __session.id);
  const engineer = state.users.find((user) => user.id === parsed.data.engineerId && user.role === "site_engineer" && user.status === "active");
  if (!project) return redirectTo(request, "/pm/reports", { error: "Choose one of your projects." });
  if (!engineer) return redirectTo(request, "/pm/reports", { error: "Choose an active site engineer." });
  const id = nextId("act");
  await applyPortalAction("project_manager", {
    type: "submit-report",
    input: parsed.data,
    toAdmin: true,
    stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}`, actorId: __session.id, actorName: `${__session.firstName} ${__session.lastName}`, actorRole: __session.role },
  });
  return redirectTo(request, "/pm/reports", { sent: state.settings.profileName });
}
