import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/auth";
import { proxyCpmisJson } from "@/lib/server/cpmis-api";
import { readState } from "@/lib/server/portal-store";
import { managerIdForVertexaInquiry } from "@/lib/vertexa-inquiry-routing";
import { isVertexaInquiryServiceId, type VertexaInquiryServiceId } from "@/lib/vertexa-inquiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RETURN_TO = "/vertexa/contact";

function wantsJson(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const accept = request.headers.get("accept") ?? "";
  return contentType.includes("application/json") || accept.includes("application/json");
}

function safeReturnTo(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_RETURN_TO;
  return value;
}

function inquiryHash(id: string): string {
  return id.startsWith("inq-") ? id : `inq-${id}`;
}

export async function GET(request: Request) {
  const session = await requireApiSession("administrator");
  if (session instanceof Response) return session;
  const url = new URL(request.url);
  return proxyCpmisJson(request, `/api/v1/inquiries${url.search}`, { method: "GET", adminAuth: true });
}

export async function POST(request: Request) {
  const asJson = wantsJson(request);
  let source: FormData | Record<string, unknown>;
  try {
    source = asJson ? ((await request.json()) as Record<string, unknown>) : await request.formData();
  } catch {
    return asJson
      ? NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 })
      : NextResponse.redirect(new URL(`${DEFAULT_RETURN_TO}?error=invalid-request`, request.url), 303);
  }

  const read = (key: string) =>
    source instanceof FormData ? String(source.get(key) ?? "") : String((source as Record<string, unknown>)[key] ?? "");
  const returnTo = safeReturnTo(read("returnTo") || DEFAULT_RETURN_TO);
  const service = read("service").trim();

  let recipientId: string | null | undefined;
  if (isVertexaInquiryServiceId(service)) {
    const state = await readState();
    recipientId = managerIdForVertexaInquiry(service as VertexaInquiryServiceId, state.users);
  }

  const payload = {
    scope: read("scope") || "service",
    service,
    name: read("name").trim(),
    email: read("email").trim(),
    phone: read("phone").trim(),
    location: read("location").trim(),
    budget: read("budget").trim() || null,
    startDate: read("startDate").trim() || null,
    message: read("message").trim(),
    recipientId,
  };

  const upstream = await proxyCpmisJson(request, "/api/v1/inquiries", {
    method: "POST",
    body: payload,
    adminAuth: true,
  });

  if (asJson) return upstream;
  if (upstream.ok) {
    const body = (await upstream.clone().json().catch(() => null)) as { inquiry?: { id?: string } } | null;
    const id = body?.inquiry?.id;
    return NextResponse.redirect(new URL(`${returnTo}?saved=1${id ? `#${inquiryHash(id)}` : ""}`, request.url), 303);
  }
  const body = (await upstream.clone().json().catch(() => null)) as { error?: string } | null;
  const error = body?.error ?? "unavailable";
  return NextResponse.redirect(new URL(`${returnTo}?error=${encodeURIComponent(error)}`, request.url), 303);
}
