import { applyAction } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { createInquiry } from "@/lib/server/inquiries";
import { isVertexaInquiryServiceId, type VertexaInquiryServiceId } from "@/lib/vertexa-inquiry";
import { serviceLabel } from "@/lib/vertexa-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[\d\s()+\-./]{6,30}$/;

export async function POST(request: Request) {
  const form = await request.formData();
  const scope = String(form.get("scope") ?? "service");
  const service = String(form.get("service") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const location = String(form.get("location") ?? "").trim();
  const budgetRaw = String(form.get("budget") ?? "").trim();
  const startDateRaw = String(form.get("startDate") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();
  const returnTo = String(form.get("returnTo") ?? "/vertexa/contact");

  if (!isVertexaInquiryServiceId(service)) {
    return redirectTo(request, returnTo, { error: "invalid-service" });
  }
  if (name.length < 2 || name.length > 100) {
    return redirectTo(request, returnTo, { error: "invalid-name" });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return redirectTo(request, returnTo, { error: "invalid-email" });
  }

  if (scope === "project-inquiry") {
    if (!PHONE_PATTERN.test(phone)) {
      return redirectTo(request, returnTo, { error: "invalid-phone" });
    }
    if (location.length < 2 || location.length > 120) {
      return redirectTo(request, returnTo, { error: "invalid-location" });
    }
  } else if (phone && !PHONE_PATTERN.test(phone)) {
    return redirectTo(request, returnTo, { error: "invalid-phone" });
  }

  const budget = budgetRaw.length > 0 ? budgetRaw : null;
  if (budget && budget.length > 80) {
    return redirectTo(request, returnTo, { error: "invalid-budget" });
  }

  let startDate: string | null = null;
  if (startDateRaw.length > 0) {
    const parsed = Date.parse(startDateRaw);
    if (Number.isNaN(parsed)) {
      return redirectTo(request, returnTo, { error: "invalid-start-date" });
    }
    startDate = startDateRaw;
  }

  if (message.length < 10 || message.length > 2000) {
    return redirectTo(request, returnTo, { error: "invalid-message" });
  }

  const serviceId = service as VertexaInquiryServiceId;
  const inquiry = createInquiry({
    service: serviceId,
    name,
    email,
    phone,
    location,
    budget,
    startDate,
    message,
  });

  const serviceName =
    serviceId === "general" ? "General enquiry" : serviceLabel(serviceId);

  const detailLines = [
    `New Vertexa project inquiry (${serviceName})`,
    `From: ${name} · ${email}`,
    phone ? `Phone: ${phone}` : null,
    location ? `Location: ${location}` : null,
    budget ? `Budget: ${budget}` : null,
    startDate ? `Expected start: ${startDate}` : null,
    "",
    message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const stamp = { id: inquiry.id, at: inquiry.createdAt, notificationId: `ntf-${inquiry.id}` };
  await applyAction({
    type: "support-request",
    topic: `Vertexa inquiry — ${serviceName}`,
    message: detailLines,
    stamp,
  });

  return redirectTo(request, returnTo, { saved: "1" }, `inq-${inquiry.id}`);
}