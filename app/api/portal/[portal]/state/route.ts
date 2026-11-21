import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { isPortalKey, readState } from "@/lib/server/portal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The portal's view of the shared workspace. Records are stored in the portal
 * databases (see lib/server/portal-store.ts); this endpoint keeps the shape the
 * portal screens already consume.
 */
export async function GET(_request: Request, context: { params: Promise<{ portal: string }> }) {
  const { portal } = await context.params;
  if (!isPortalKey(portal)) {
    return NextResponse.json({ ok: false, error: "unknown-portal" }, { status: 404 });
  }
  const session = await getSessionUser(portal);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const state = await readState();
  return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
}
