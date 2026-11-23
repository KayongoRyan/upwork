import crypto from "node:crypto";
import type { Request, Response } from "express";
import {
  getSessionUserByToken,
  sessionCookieName,
  sessionCookieOptions,
  signOutByToken,
  setUserPassword,
  destroySessionsForUser,
  removeUserCredential,
  resetDemoAuth,
  signInWithPassword,
  portalHome,
  createSessionForUser,
  checkLoginRateLimit,
  resetLoginRateLimit,
} from "@/lib/server/auth";
import type { SessionUser } from "@/lib/server/auth";
import type { PortalKey } from "@/lib/server/portal-store";

export {
  getSessionUserByToken,
  sessionCookieName,
  sessionCookieOptions,
  signOutByToken,
  setUserPassword,
  destroySessionsForUser,
  removeUserCredential,
  resetDemoAuth,
  signInWithPassword,
  portalHome,
  createSessionForUser,
  checkLoginRateLimit,
  resetLoginRateLimit,
};

export function applySessionCookieToExpress(res: Response, portal: PortalKey, token: string) {
  res.cookie(sessionCookieName(portal), token, sessionCookieOptions());
}

export function clearSessionCookieOnExpress(res: Response, portal: PortalKey) {
  res.cookie(sessionCookieName(portal), "", { ...sessionCookieOptions(), maxAge: 0 });
}

export function verifyCsrfToken(req: Request, session: SessionUser, bodyToken?: string | null) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  // Native HTML forms cannot set x-csrf-token, so they post the per-session
  // token as a hidden field. Read it centrally so every form route accepts it.
  const bodyValue = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? (req.body as { csrfToken?: unknown }).csrfToken
    : undefined;
  const bodyField = typeof bodyValue === "string" ? bodyValue : "";
  const provided = (req.get("x-csrf-token") ?? bodyToken ?? bodyField ?? "").toString();
  if (!provided || !session.csrfToken) {
    return { status: 403, body: { ok: false, error: "Invalid CSRF token." } };
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(session.csrfToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { status: 403, body: { ok: false, error: "Invalid CSRF token." } };
  }
  return null;
}