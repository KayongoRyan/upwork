import { NextResponse } from "next/server";
import {
  listVertexaNotifications,
  markAllVertexaNotificationsRead,
  markVertexaNotificationRead,
} from "@/lib/server/vertexa-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Notification notices stored by the Express API, in the CPMIS shape. */
export async function GET() {
  return NextResponse.json(
    { items: await listVertexaNotifications() },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; read?: unknown; all?: unknown }
    | null;

  if (body?.all === true) {
    const updated = await markAllVertexaNotificationsRead();
    return NextResponse.json({ ok: true, updated });
  }

  if (typeof body?.id !== "string" || typeof body.read !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid-request" }, { status: 400 });
  }

  const ok = await markVertexaNotificationRead(body.id, body.read);
  return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
}
