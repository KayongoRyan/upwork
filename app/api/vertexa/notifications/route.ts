import { NextResponse } from "next/server";
import { getAnySessionUser, verifyCsrf } from "@/lib/server/auth";
import {
  filterVertexaNotificationsForSession,
  listVertexaNotifications,
  markVertexaNotificationRead,
} from "@/lib/server/vertexa-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Notification notices stored by the Express API, in the CPMIS shape. */
export async function GET() {
  const session = await getAnySessionUser();
  if (!session) return NextResponse.json({ ok: false, items: [], error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  const result = await listVertexaNotifications();
  if (result.error) {
    // The inboxes treat the BFF as best-effort; surface an empty list rather
    // than breaking the demo workspace when auth/config is unavailable.
    return NextResponse.json(
      { ok: false, items: [], error: result.error },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: true, items: filterVertexaNotificationsForSession(result.items, session) },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const session = await getAnySessionUser();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const csrf = verifyCsrf(request, session);
  if (csrf) return csrf;
  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; read?: unknown; all?: unknown }
    | null;

  const listed = await listVertexaNotifications();
  if (listed.error) {
    return NextResponse.json(
      { ok: false, error: listed.error },
      { status: listed.status ?? 502 },
    );
  }
  const visible = filterVertexaNotificationsForSession(listed.items, session);

  if (body?.all === true) {
    const targets = visible.filter((notice) => !notice.read);
    let updated = 0;
    let firstError: { error?: string; status?: number } | null = null;
    for (const notice of targets) {
      const result = await markVertexaNotificationRead(notice.id, true);
      if (result.ok) updated += 1;
      else if (!firstError) firstError = { error: result.error, status: result.status };
    }
    if (firstError && updated === 0) {
      return NextResponse.json(
        { ok: false, updated: 0, error: firstError.error },
        { status: firstError.status ?? 502 },
      );
    }
    return NextResponse.json({
      ok: !firstError,
      updated,
      ...(firstError ? { error: firstError.error } : {}),
    });
  }

  if (typeof body?.id !== "string" || typeof body.read !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid-request" }, { status: 400 });
  }

  const target = visible.find((item) => item.id === body.id);
  if (!target) {
    return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
  }

  const result = await markVertexaNotificationRead(body.id, body.read);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "unavailable" },
      { status: result.status ?? 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
