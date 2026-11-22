import { NextResponse } from "next/server";
import { getAnySessionUser, verifyCsrf } from "@/lib/server/auth";
import { proxyCpmisJson } from "@/lib/server/cpmis-api";
import { filterVertexaNotificationsForSession } from "@/lib/server/vertexa-api";
import type { AppNotification, NotificationType } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTIFICATION_TYPES = new Set<NotificationType>(["project", "user", "status", "delay", "system"]);

type ApiNotification = {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  message?: unknown;
  senderName?: unknown;
  recipientId?: unknown;
  audience?: unknown;
  read?: unknown;
  createdAt?: unknown;
  source?: unknown;
};

function toAppNotification(item: ApiNotification): AppNotification | null {
  if (
    item.source !== "vertexa" ||
    typeof item.id !== "string" ||
    typeof item.title !== "string" ||
    typeof item.createdAt !== "string" ||
    Number.isNaN(Date.parse(item.createdAt))
  ) {
    return null;
  }
  return {
    id: item.id,
    title: item.title,
    message: typeof item.message === "string" ? item.message : "",
    type: NOTIFICATION_TYPES.has(item.type as NotificationType) ? (item.type as NotificationType) : "system",
    source: "vertexa",
    senderName: typeof item.senderName === "string" ? item.senderName : "Vertexa site",
    projectId: null,
    recipientId: typeof item.recipientId === "string" ? item.recipientId : null,
    audience: item.audience === "admin" || item.audience === "pm" ? item.audience : undefined,
    read: item.read === true,
    createdAt: new Date(item.createdAt).toISOString(),
  };
}

async function listVisible(request: Request, session: NonNullable<Awaited<ReturnType<typeof getAnySessionUser>>>) {
  const upstream = await proxyCpmisJson(request, "/api/v1/notifications?limit=100", { method: "GET", adminAuth: true });
  const body = (await upstream.clone().json().catch(() => null)) as { items?: ApiNotification[]; error?: string } | null;
  if (!upstream.ok) {
    return { ok: false as const, items: [] as AppNotification[], error: body?.error ?? "unavailable", status: upstream.status };
  }
  const items = Array.isArray(body?.items) ? body.items.flatMap((item) => {
    const notice = toAppNotification(item);
    return notice ? [notice] : [];
  }) : [];
  return { ok: true as const, items: filterVertexaNotificationsForSession(items, session), status: 200 };
}

/** Notification notices stored by the Express API, in the CPMIS shape. */
export async function GET(request: Request) {
  const session = await getAnySessionUser();
  if (!session) return NextResponse.json({ ok: false, items: [], error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  const result = await listVisible(request, session);
  if (!result.ok) {
    // The inboxes treat the BFF as best-effort; surface an empty list rather
    // than breaking the demo workspace when auth/config is unavailable.
    return NextResponse.json(
      { ok: false, items: [], error: result.error },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json({ ok: true, items: result.items }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  const session = await getAnySessionUser();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const csrf = verifyCsrf(request, session);
  if (csrf) return csrf;

  const body = (await request.json().catch(() => null)) as { id?: unknown; read?: unknown; all?: unknown } | null;
  const listed = await listVisible(request, session);
  if (!listed.ok) {
    return NextResponse.json({ ok: false, error: listed.error }, { status: listed.status >= 400 ? listed.status : 502 });
  }

  if (body?.all === true) {
    const targets = listed.items.filter((notice) => !notice.read);
    let updated = 0;
    let firstError: { error?: string; status?: number } | null = null;
    for (const notice of targets) {
      const upstream = await proxyCpmisJson(request, `/api/v1/notifications/${encodeURIComponent(notice.id)}/read`, {
        method: "PATCH",
        body: { read: true },
        adminAuth: true,
      });
      if (upstream.ok) updated += 1;
      else if (!firstError) {
        const errBody = (await upstream.clone().json().catch(() => null)) as { error?: string } | null;
        firstError = { error: errBody?.error, status: upstream.status };
      }
    }
    if (firstError && updated === 0) {
      return NextResponse.json({ ok: false, updated: 0, error: firstError.error }, { status: firstError.status ?? 502 });
    }
    return NextResponse.json({ ok: !firstError, updated, ...(firstError ? { error: firstError.error } : {}) });
  }

  if (typeof body?.id !== "string" || typeof body.read !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid-request" }, { status: 400 });
  }

  const target = listed.items.find((item) => item.id === body.id);
  if (!target) {
    return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
  }

  const upstream = await proxyCpmisJson(request, `/api/v1/notifications/${encodeURIComponent(body.id)}/read`, {
    method: "PATCH",
    body: { read: body.read },
    adminAuth: true,
  });
  if (!upstream.ok) {
    const errBody = (await upstream.clone().json().catch(() => null)) as { error?: string } | null;
    return NextResponse.json({ ok: false, error: errBody?.error ?? "unavailable" }, { status: upstream.status >= 400 ? upstream.status : 502 });
  }
  return NextResponse.json({ ok: true });
}
