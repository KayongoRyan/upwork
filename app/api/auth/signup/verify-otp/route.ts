import { NextResponse } from "next/server";
import { z } from "zod";
import { applyAction } from "@/lib/server/portal-store";
import { readState } from "@/lib/server/memory";
import { applySessionCookie, createSessionForUser, portalHome, PORTAL_ROLE, setUserPasswordHash } from "@/lib/server/auth";
import { verifySignupOtp } from "@/lib/server/otp";
import { nextId } from "@/lib/utils";
import type { UserAccount } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  portal: z.enum(["administrator", "project_manager", "site_engineer", "quantity_surveyor"]),
  challengeId: z.string().min(1),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid verification request." },
      { status: 400 },
    );
  }

  const { portal, challengeId, otp } = parsed.data;
  const verified = await verifySignupOtp(challengeId, otp, portal);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
  }

  const ch = verified.challenge;
  const email = ch.email.toLowerCase();

  const state = await readState();
  if (state.users.some((u) => u.email.toLowerCase() === email)) {
    return NextResponse.json({ ok: false, error: "An account with this email already exists. Sign in instead." }, { status: 409 });
  }

  const id = nextId("act");
  const now = new Date().toISOString();
  const role = PORTAL_ROLE[portal];

  const userInput = {
    firstName: ch.firstName,
    lastName: ch.lastName,
    email,
    phone: ch.phone,
    role,
    projectId: "unassigned",
    status: "active" as const,
  };

  await applyAction({
    type: "create-user",
    input: userInput,
    stamp: {
      id,
      at: now,
      notificationId: `ntf-${id}`,
      actorId: id,
      actorName: `${ch.firstName} ${ch.lastName}`.trim(),
      actorRole: role,
    },
  });

  await setUserPasswordHash(id, email, ch.passwordHash);

  const created: UserAccount = {
    ...userInput,
    projectId: null,
    id,
    registeredAt: now.slice(0, 10),
  };

  const session = await createSessionForUser(portal, created);
  const response = NextResponse.json({ ok: true, redirectTo: portalHome(portal) });
  applySessionCookie(response, portal, session.token);
  return response;
}
