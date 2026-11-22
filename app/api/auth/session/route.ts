import { NextResponse } from "next/server";
import { proxyCpmisJson } from "@/lib/server/cpmis-api";
import { isPortalKey } from "@/lib/server/portal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BFF proxy: Express is the CPMIS API authority for current-user/session. */
export async function GET(request: Request) {
  const portal = new URL(request.url).searchParams.get("portal") ?? "";
  if (!isPortalKey(portal)) {
    return NextResponse.json({ ok: false, error: "unknown-portal" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  return proxyCpmisJson(request, `/api/v1/cpmis/auth/session/${encodeURIComponent(portal)}`, { method: "GET" });
}
