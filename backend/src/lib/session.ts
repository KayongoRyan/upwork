import type { Request, Response } from "express";
import { isPortalKey, type PortalKey } from "@/lib/server/portal-store";
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
