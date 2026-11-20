import { NextResponse } from "next/server";
import { applyAction } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { createInquiry } from "@/lib/server/inquiries";
import {
  canUseInMemoryFallback,
  forwardVertexaInquiry,
  listVertexaInquiries,
  vertexaApiBaseUrl,
  type VertexaInquiryPayload,
} from "@/lib/server/vertexa-api";
import { isVertexaInquiryServiceId, type VertexaInquiryServiceId } from "@/lib/vertexa-inquiry";
import { managerIdForVertexaInquiry } from "@/lib/vertexa-inquiry-routing";
import { serviceLabel } from "@/lib/vertexa-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[\d\s()+\-./]{6,30}$/;
const DEFAULT_RETURN_TO = "/vertexa/contact";

/** Only same-site paths: `//host` and `https://host` would leave the site. */
function safeReturnTo(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_RETURN_TO;
  }
  return value;
}

function inquiryHash(id: string): string {
  return id.startsWith("inq-") ? id : `inq-${id}`;
}

/** Administrator ops list. Reads through to MongoDB; the demo store has no inquiries. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const search = url.searchParams.get("search") ?? "";
  return NextResponse.json(
    {
      items: await listVertexaInquiries({
        status: status === "all" ? undefined : status,
        search,
      }),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

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
  const returnTo = safeReturnTo(String(form.get("returnTo") ?? ""));

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
  const payload: VertexaInquiryPayload = {
    scope,
    service: serviceId,
    name,
    email,
    phone,
    location,
    budget,
    startDate,
    message,
  };

  const apiBase = vertexaApiBaseUrl();

  if (apiBase) {
    const result = await forwardVertexaInquiry(apiBase, payload);

    if (result.status === "created") {
      return redirectTo(request, returnTo, { saved: "1" }, inquiryHash(result.id));
    }

    if (result.status === "rejected") {
      return redirectTo(request, returnTo, { error: result.error });
    }

    // Offline only means "nothing was listening", so a local copy cannot duplicate
    // a stored inquiry. Anything ambiguous (timeout, 5xx) is reported as unavailable.
    if (result.status !== "offline" || !canUseInMemoryFallback()) {
      return redirectTo(request, returnTo, { error: "unavailable" });
    }

    console.warn(
      "[vertexa] API unreachable — storing this inquiry in memory. Run `npm run dev:backend` to persist inquiries.",
    );
  }

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
    type: "vertexa-inquiry",
    serviceName,
    clientName: name,
    message: detailLines,
    recipientId: managerIdForVertexaInquiry(serviceId),
    stamp,
  });

  return redirectTo(request, returnTo, { saved: "1" }, inquiryHash(inquiry.id));
}
