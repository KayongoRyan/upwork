import { NextResponse } from "next/server";
import { requireApiSession, verifyCsrf } from "@/lib/server/auth";
import { getVertexaInquiry, updateVertexaInquiry } from "@/lib/server/vertexa-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession("administrator");
  if (session instanceof Response) return session;
  const { id } = await context.params;
  const result = await getVertexaInquiry(id);
  if (result.error || !result.inquiry) {
    const status = result.status ?? (result.error === "not_found" ? 404 : 502);
    return NextResponse.json(
      { ok: false, error: result.error ?? "not_found" },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: true, inquiry: result.inquiry },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession("administrator");
  if (session instanceof Response) return session;
  const csrf = verifyCsrf(request, session);
  if (csrf) return csrf;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid-request" }, { status: 400 });
  }

  const patch = {
    status: typeof body.status === "string" ? (body.status as "received" | "assigned" | "closed") : undefined,
    recipientId: typeof body.recipientId === "string" ? body.recipientId : undefined,
    projectId: body.projectId === null || typeof body.projectId === "string" ? body.projectId : undefined,
    note: typeof body.note === "string" ? body.note : undefined,
    author: typeof body.author === "string" ? body.author : undefined,
  };

  const result = await updateVertexaInquiry(id, patch);
  return NextResponse.json(
    result.ok ? { ok: true, inquiry: result.inquiry } : { ok: false, error: result.error },
    { status: result.ok ? 200 : result.status },
  );
}
