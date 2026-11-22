import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth";
import { applyPortalAction, readState } from "@/lib/server/portal-store";
import { redirectTo, persistOr } from "@/lib/server/redirect";
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

function wantsJson(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const accept = request.headers.get("accept") ?? "";
  return contentType.includes("application/json") || accept.includes("application/json");
}

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
  const session = await requireApiSession("administrator");
  if (session instanceof Response) return session;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const search = url.searchParams.get("search") ?? "";
  const result = await listVertexaInquiries({
    status: status === "all" ? undefined : status,
    search,
  });

  if (result.error) {
    return NextResponse.json(
      { ok: false, items: [], error: result.error },
      { status: result.status ?? 502, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: true, items: result.items },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const asJson = wantsJson(request);
  let source: FormData | Record<string, unknown>;
  try {
    source = asJson ? ((await request.json()) as Record<string, unknown>) : await request.formData();
  } catch {
    return asJson
      ? NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 })
      : redirectTo(request, DEFAULT_RETURN_TO, { error: "invalid-request" });
  }

  const read = (key: string) =>
    source instanceof FormData ? String(source.get(key) ?? "") : String(source[key] ?? "");

  const scope = read("scope") || "service";
  const service = read("service").trim();
  const name = read("name").trim();
  const email = read("email").trim();
  const phone = read("phone").trim();
  const location = read("location").trim();
  const budgetRaw = read("budget").trim();
  const startDateRaw = read("startDate").trim();
  const message = read("message").trim();
  const returnTo = safeReturnTo(read("returnTo") || DEFAULT_RETURN_TO);

  const fail = (error: string, status = 400) =>
    asJson
      ? NextResponse.json({ ok: false, error }, { status })
      : redirectTo(request, returnTo, { error });

  if (!isVertexaInquiryServiceId(service)) {
    return fail("invalid-service");
  }
  if (name.length < 2 || name.length > 100) {
    return fail("invalid-name");
  }
  if (!EMAIL_PATTERN.test(email)) {
    return fail("invalid-email");
  }

  if (scope === "project-inquiry") {
    if (!PHONE_PATTERN.test(phone)) {
      return fail("invalid-phone");
    }
    if (location.length < 2 || location.length > 120) {
      return fail("invalid-location");
    }
  } else if (phone && !PHONE_PATTERN.test(phone)) {
    return fail("invalid-phone");
  }

  const budget = budgetRaw.length > 0 ? budgetRaw : null;
  if (budget && budget.length > 80) {
    return fail("invalid-budget");
  }

  let startDate: string | null = null;
  if (startDateRaw.length > 0) {
    const parsed = Date.parse(startDateRaw);
    if (Number.isNaN(parsed)) {
      return fail("invalid-start-date");
    }
    startDate = startDateRaw;
  }

  if (message.length < 10 || message.length > 2000) {
    return fail("invalid-message");
  }

  const serviceId = service as VertexaInquiryServiceId;
  // Resolve a real project manager from the current team; never a preview id.
  const state = await readState();
  const recipientId = managerIdForVertexaInquiry(serviceId, state.users);
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
    recipientId,
  };

  const apiBase = vertexaApiBaseUrl();

  if (apiBase) {
    const result = await forwardVertexaInquiry(apiBase, payload);

    if (result.status === "created") {
      return asJson
        ? NextResponse.json({ ok: true, inquiry: { id: result.id } }, { status: 201 })
        : redirectTo(request, returnTo, { saved: "1" }, inquiryHash(result.id));
    }

    if (result.status === "rejected") {
      const status = result.error === "rate_limited" ? 429 : 400;
      return fail(result.error, status);
    }

    // Offline only means "nothing was listening", so a local copy cannot duplicate
    // a stored inquiry. Anything ambiguous (timeout, 5xx) is reported as unavailable.
    if (result.status !== "offline" || !canUseInMemoryFallback()) {
      return fail("unavailable", 503);
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
  return persistOr(
    async () => {
      await applyPortalAction("administrator", {
        type: "vertexa-inquiry",
        serviceName,
        clientName: name,
        message: detailLines,
        recipientId,
        stamp,
      });

      return asJson
        ? NextResponse.json({ ok: true, inquiry: { id: inquiry.id }, fallback: true }, { status: 201 })
        : redirectTo(request, returnTo, { saved: "1" }, inquiryHash(inquiry.id));
    },
    () => fail("unavailable", 503),
  );
}
