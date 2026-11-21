import { NextResponse } from "next/server";
import { clearSessionCookie, portalHome, signOut } from "@/lib/server/auth";
import { isPortalKey, type PortalKey } from "@/lib/server/portal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readPortal(request: Request): Promise<PortalKey | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { portal?: string } | null;
    return body?.portal && isPortalKey(body.portal) ? body.portal : null;
  }
  const form = await request.formData().catch(() => null);
  const portal = form?.get("portal");
  return typeof portal === "string" && isPortalKey(portal) ? portal : null;
}

export async function POST(request: Request) {
  const portal = await readPortal(request);
  if (!portal) {
    return NextResponse.json({ ok: false, error: "Unknown portal." }, { status: 400 });
  }

  await signOut(portal);
  const accept = request.headers.get("accept") ?? "";
  const loginPath = `${portalHome(portal)}/login`;
  if (accept.includes("application/json")) {
    const response = NextResponse.json({ ok: true, redirectTo: loginPath });
    clearSessionCookie(response, portal);
    return response;
  }
  const response = NextResponse.redirect(new URL(loginPath, request.url), 303);
  clearSessionCookie(response, portal);
  return response;
}
