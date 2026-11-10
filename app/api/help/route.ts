import { applyAction } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { nextId } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const topics = new Map([
  ["access", "Account access"],
  ["project", "Project record"],
  ["data", "Demonstration data"],
  ["other", "Something else"],
]);

export async function POST(request: Request) {
  const form = await request.formData();
  const topic = topics.get(String(form.get("topic") ?? ""));
  const message = String(form.get("message") ?? "").trim();
  if (!topic) return redirectTo(request, "/admin/help", { error: "Choose a topic." });
  if (message.length < 12 || message.length > 2000) {
    return redirectTo(request, "/admin/help", { error: "Write the note in a sentence or more." });
  }
  const id = nextId("hlp");
  await applyAction({
    type: "support-request",
    topic,
    message,
    stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` },
  });
  return redirectTo(request, "/admin/help", { saved: "1" }, `ntf-${id}`);
}
