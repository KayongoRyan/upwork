import { applyAction } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { createInquiry } from "@/lib/server/inquiries";
import type { VertexaServiceId } from "@/lib/vertexa-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICES = new Set(["custom-homes", "renovations", "extensions"]);

export async function POST(request: Request) {
  const form = await request.formData();
  const service = String(form.get("service") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();
  const returnTo = String(form.get("returnTo") ?? "/vertexa/contact");

  if (!SERVICES.has(service)) {
    return redirectTo(request, returnTo, { error: "invalid-service" });
  }
  if (name.length < 2 || name.length > 100) {
    return redirectTo(request, returnTo, { error: "invalid-name" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirectTo(request, returnTo, { error: "invalid-email" });
  }
  if (message.length < 10 || message.length > 2000) {
    return redirectTo(request, returnTo, { error: "invalid-message" });
  }

  const inquiry = createInquiry({ service: service as VertexaServiceId, name, email, message });

  // Notify the project manager inbox via the existing notification system.
  const stamp = { id: inquiry.id, at: inquiry.createdAt, notificationId: `ntf-${inquiry.id}` };
  await applyAction({
    type: "support-request",
    topic: `Vertexa service enquiry — ${service}`,
    message: `New service enquiry from ${name} (${email}): ${message}`,
    stamp,
  });

  return redirectTo(request, returnTo, { saved: "1" }, `inq-${inquiry.id}`);
}
