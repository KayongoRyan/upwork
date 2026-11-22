import type { Request, Response } from "express";
import { isPortalKey, type PortalKey } from "@/lib/server/portal-store";

const PORTAL_KEYS: PortalKey[] = ["administrator", "project_manager", "site_engineer", "quantity_surveyor"];
import type { SessionUser } from "@/lib/server/auth";
import { apiError } from "./api-response";
import { getSessionUserByToken, sessionCookieName } from "./auth-bridge";

export type AuthenticatedSession = {
  portal: PortalKey;
  session: SessionUser;
  token: string;
};

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Validates portal, session cookie, token hash lookup, expiry, and active role/portal membership. */
export async function requireSession(req: Request, res: Response, portal: string): Promise<AuthenticatedSession | null> {
  if (!isPortalKey(portal)) {
    apiError(res, 404, "unknown-portal", { requestId: req.requestId });
    return null;
  }
  const token = readCookie(req, sessionCookieName(portal));
  const session = token ? await getSessionUserByToken(portal, token) : null;
  if (!session || !token) {
    apiError(res, 401, "unauthorized", { requestId: req.requestId });
    return null;
  }
  return { portal, session, token };
}

/** Validates any portal session cookie. Useful for endpoints that allow any authenticated CPMIS user. */
export async function requireAnySession(req: Request, res: Response): Promise<AuthenticatedSession | null> {
  for (const portal of PORTAL_KEYS) {
    const token = readCookie(req, sessionCookieName(portal));
    if (!token) continue;
    const session = await getSessionUserByToken(portal, token);
    if (session) return { portal, session, token };
  }
  apiError(res, 401, "unauthorized", { requestId: req.requestId });
  return null;
}

/** CSRF/origin guard for cookie-authenticated or pre-auth browser POSTs. Returns true if response was sent. */
export function assertSameOrigin(req: Request, res: Response): boolean {
  const origin = req.get("origin");
  if (!origin) return false;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    apiError(res, 403, "invalid-origin", { message: "Invalid origin.", requestId: req.requestId });
    return true;
  }
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
  if (host && originHost !== host) {
    apiError(res, 403, "invalid-origin", { message: "Invalid origin.", requestId: req.requestId });
    return true;
  }
  return false;
}
