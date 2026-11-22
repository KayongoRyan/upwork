import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionUser, portalHome, signOut, verifyCsrf } from "@/lib/server/auth";
import { isPortalKey, type PortalKey } from "@/lib/server/portal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readBody(request: Request): Promise<{ portal: PortalKey | null; csrfToken: string | null }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { portal?: string; csrfToken?: string } | null;
    return {
      portal: body?.portal && isPortalKey(body.portal) ? body.portal : null,
      csrfToken: typeof body?.csrfToken === "string" ? body.csrfToken : null,
    };
  }
  const form = await request.formData().catch(() => null);
  const portal = form?.get("portal");
  const csrfToken = form?.get("csrfToken");
  return {
    portal: typeof portal === "string" && isPortalKey(portal) ? portal : null,
    csrfToken: typeof csrfToken === "string" ? csrfToken : null,
  };
}

export async function POST(request: Request) {
  const { portal, csrfToken } = await readBody(request);
  if (!portal) {
    return NextResponse.json({ ok: false, error: "Unknown portal." }, { status: 400 });
  }

  const session = await getSessionUser(portal);
  if (session) {
    const csrf = verifyCsrf(request, session, csrfToken);
    if (csrf) return csrf;
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
