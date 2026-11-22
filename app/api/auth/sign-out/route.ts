import { NextResponse } from "next/server";
import { proxyCpmisJson } from "@/lib/server/cpmis-api";
import { isPortalKey } from "@/lib/server/portal-store";
import { portalHome } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BFF proxy: Express is the CPMIS API authority. */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let portal: string | null = null;
  let body: unknown = null;
  if (contentType.includes("application/json")) {
    const parsed = (await request.json().catch(() => null)) as { portal?: unknown; csrfToken?: unknown } | null;
    portal = typeof parsed?.portal === "string" ? parsed.portal : null;
    body = parsed;
  } else {
    const form = await request.formData().catch(() => null);
    portal = typeof form?.get("portal") === "string" ? String(form?.get("portal")) : null;
    body = { portal, csrfToken: form?.get("csrfToken") };
  }
  const upstream = await proxyCpmisJson(request, "/api/v1/cpmis/auth/sign-out", { method: "POST", body });
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("application/json") && portal && isPortalKey(portal) && upstream.status < 400) {
    const response = NextResponse.redirect(new URL(`${portalHome(portal)}/login`, request.url), 303);
    for (const value of upstream.headers.getSetCookie?.() ?? []) response.headers.append("set-cookie", value);
    return response;
  }
  return upstream;
}
