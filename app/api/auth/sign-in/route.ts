import { NextResponse } from "next/server";
import { z } from "zod";
import { applySessionCookie, assertSameOrigin, checkLoginRateLimit, portalHome, resetLoginRateLimit, signInWithPassword } from "@/lib/server/auth";
import { isPortalKey } from "@/lib/server/portal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  portal: z.enum(["administrator", "project_manager", "site_engineer", "quantity_surveyor"]),
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enter a valid email and password." }, { status: 400 });
  }

  const { portal, email, password } = parsed.data;
  if (!isPortalKey(portal)) {
    return NextResponse.json({ ok: false, error: "Unknown portal." }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = checkLoginRateLimit(`${portal}:${ip}:${email.toLowerCase()}`);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: `Too many sign-in attempts. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const result = await signInWithPassword(portal, email, password);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  resetLoginRateLimit(`${portal}:${ip}:${email.toLowerCase()}`);
  const response = NextResponse.json({ ok: true, redirectTo: portalHome(portal) });
  applySessionCookie(response, portal, result.token);
  return response;
}
