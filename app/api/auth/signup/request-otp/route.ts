import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, checkLoginRateLimit } from "@/lib/server/auth";
import { createSignupOtp, normalizeSignupEmail, normalizeSignupPhone } from "@/lib/server/otp";
import { isPortalKey } from "@/lib/server/portal-store";
import { readState } from "@/lib/server/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  portal: z.enum(["administrator", "project_manager", "site_engineer", "quantity_surveyor"]),
  firstName: z.string().trim().min(2, "First name is required").max(80),
  lastName: z.string().trim().min(2, "Last name is required").max(80),
  phone: z
    .string()
    .trim()
    .min(8, "Enter a valid phone number")
    .max(30)
    .regex(/^[+\d\s().-]+$/, "Enter a valid phone number"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." },
      { status: 400 },
    );
  }

  const { portal, firstName, lastName, password } = parsed.data;
  if (!isPortalKey(portal)) {
    return NextResponse.json({ ok: false, error: "Unknown portal." }, { status: 400 });
  }

  const email = normalizeSignupEmail(parsed.data.email);
  const phone = normalizeSignupPhone(parsed.data.phone);
  if (!phone.startsWith("+") || phone.replace(/\D/g, "").length < 8) {
    return NextResponse.json(
      { ok: false, error: "Enter phone number in international format, e.g. +2507..." },
      { status: 400 },
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = checkLoginRateLimit(`signup:${portal}:${ip}:${email}`);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429 },
    );
  }

  const state = await readState();
  if (state.users.some((u) => u.email.toLowerCase() === email)) {
    return NextResponse.json({ ok: false, error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const result = await createSignupOtp({
    portal,
    firstName,
    lastName,
    phone,
    email,
    passwordHash,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    challengeId: result.challengeId,
    expiresAt: result.expiresAt,
    ...(result.demoOtp ? { demoOtp: result.demoOtp } : {}),
  });
}
