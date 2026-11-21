import { NextResponse } from "next/server";
import type { AdminAction } from "@/lib/data/reducer";
import { PortalActionError, applyPortalAction, isPortalKey } from "@/lib/server/portal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Actions a portal screen posts after its local reducer has rendered them. */
export async function POST(request: Request, context: { params: Promise<{ portal: string }> }) {
  const { portal } = await context.params;
  if (!isPortalKey(portal)) {
    return NextResponse.json({ ok: false, error: "unknown-portal" }, { status: 404 });
  }

  const action = (await request.json().catch(() => null)) as AdminAction | null;
  if (!action || typeof action !== "object" || typeof action.type !== "string") {
    return NextResponse.json({ ok: false, error: "unknown-action" }, { status: 400 });
  }

  try {
    const state = await applyPortalAction(portal, action);
    return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof PortalActionError) {
      return NextResponse.json(
        { ok: false, error: "action-not-allowed", action: error.action, portal: error.portal },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: false, error: "action-failed" }, { status: 400 });
  }
}
