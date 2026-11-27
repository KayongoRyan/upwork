/**
 * Email OTP challenges for portal self-signup.
 *
 * Challenges are short-lived, single-use, and bound to the portal + signup
 * payload. Supabase Auth generates and emails the code; only the temporary
 * demo fallback stores a local OTP hash. In-memory fallback keeps the flow
 * working without MongoDB, matching the rest of the preview persistence.
 */

import crypto from "node:crypto";
import {
  getMongoRuntime,
  requireCollectionInProduction,
  type PortalKey,
} from "@/lib/server/mongo";
import {
  emailOtpConfigured,
  sendEmailOtp,
  verifyEmailOtp,
} from "@/lib/server/email-otp";

export type SignupOtpProvider = "supabase_email" | "demo";

export interface SignupChallenge {
  _id: string;
  portal: PortalKey;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  passwordHash: string;
  /**
   * Only used by the temporary demo fallback. Supabase-generated codes are
   * verified against Supabase and never stored here.
   */
  otpHash: string | null;
  /** Missing on legacy SMS challenges; treat those as local demo records. */
  provider?: SignupOtpProvider;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  consumedAt: string | null;
  lastSentAt: string;
}

interface OtpMemory {
  challenges: Map<string, SignupChallenge>;
  indexesReady: boolean;
}

interface OtpGlobal {
  __cpmisOtp?: OtpMemory;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_MIN_MS = 60 * 1000;

function memory(): OtpMemory {
  const g = globalThis as typeof globalThis & OtpGlobal;
  g.__cpmisOtp ??= { challenges: new Map(), indexesReady: false };
  return g.__cpmisOtp;
}

function hashOtp(challengeId: string, otp: string): string {
  return crypto.createHash("sha256").update(`${challengeId}:${otp}`).digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const aa = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "").trim();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function collection() {
  const runtime = await getMongoRuntime();
  const col = runtime?.dbs.administrator.collection<SignupChallenge>("otp_challenges") ?? null;
  if (col && !memory().indexesReady) {
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => undefined);
    await col.createIndex({ portal: 1, email: 1, consumedAt: 1 }).catch(() => undefined);
    memory().indexesReady = true;
  }
  return col;
}

function generateOtp(): string {
  // 6 digits, cryptographically random.
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

export interface CreateOtpInput {
  portal: PortalKey;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  passwordHash: string;
}

export type CreateOtpResult =
  | {
      ok: true;
      challengeId: string;
      expiresAt: string;
      delivery: "email" | "demo";
      demoOtp?: string;
    }
  | { ok: false; error: string; status: number };

export async function createSignupOtp(input: CreateOtpInput): Promise<CreateOtpResult> {
  const now = new Date();
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const col = requireCollectionInProduction(await collection());
  const demoFallback = process.env.OTP_DEMO_FALLBACK === "true";
  const emailConfigured = emailOtpConfigured();

  if (!emailConfigured && !demoFallback) {
    return {
      ok: false,
      status: 503,
      error:
        "Email OTP is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY).",
    };
  }

  // Basic resend throttling per portal+email/phone.
  const recentCutoff = new Date(now.getTime() - RESEND_MIN_MS).toISOString();
  if (col) {
    const recent = await col.findOne({
      portal: input.portal,
      consumedAt: null,
      expiresAt: { $gt: now.toISOString() },
      $or: [{ email }, { phone }],
      lastSentAt: { $gt: recentCutoff },
    });
    if (recent) {
      return { ok: false, status: 429, error: "An OTP was just sent. Please wait a minute before requesting another." };
    }
  } else {
    for (const c of memory().challenges.values()) {
      if (c.portal !== input.portal || c.consumedAt || c.expiresAt <= now.toISOString()) continue;
      if ((c.email === email || c.phone === phone) && c.lastSentAt > recentCutoff) {
        return { ok: false, status: 429, error: "An OTP was just sent. Please wait a minute before requesting another." };
      }
    }
  }

  const challengeId = crypto.randomUUID();
  const useDemo = !emailConfigured;
  const demoOtp = useDemo ? generateOtp() : null;
  const record: SignupChallenge = {
    _id: challengeId,
    portal: input.portal,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone,
    email,
    passwordHash: input.passwordHash,
    otpHash: demoOtp ? hashOtp(challengeId, demoOtp) : null,
    provider: useDemo ? "demo" : "supabase_email",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
    attempts: 0,
    consumedAt: null,
    lastSentAt: now.toISOString(),
  };

  // Persist before sending: if storage fails, no code is sent that could never
  // be verified, and the caller sees a failure instead of a false success.
  if (col) {
    await col.insertOne(record);
  } else {
    memory().challenges.set(challengeId, record);
  }

  if (!useDemo) {
    const sent = await sendEmailOtp(email);
    if (!sent.ok) {
      if (!demoFallback) {
        // Do not leave a challenge the user cannot verify.
        if (col) await col.deleteOne({ _id: challengeId }).catch(() => undefined);
        else memory().challenges.delete(challengeId);
        return { ok: false, status: sent.status, error: sent.error };
      }

      // Delivery failed but the temporary demo fallback is enabled: convert the
      // challenge to a locally verified code so signup can continue.
      const fallbackOtp = generateOtp();
      const updated: SignupChallenge = {
        ...record,
        provider: "demo",
        otpHash: hashOtp(challengeId, fallbackOtp),
      };
      try {
        if (col) {
          await col.updateOne(
            { _id: challengeId },
            { $set: { provider: "demo", otpHash: updated.otpHash } },
          );
        } else {
          memory().challenges.set(challengeId, updated);
        }
      } catch {
        if (col) await col.deleteOne({ _id: challengeId }).catch(() => undefined);
        else memory().challenges.delete(challengeId);
        return { ok: false, status: 503, error: "Sign-up could not be started. Try again." };
      }
      return {
        ok: true,
        challengeId,
        expiresAt: record.expiresAt,
        delivery: "demo",
        demoOtp: fallbackOtp,
      };
    }
  }

  return {
    ok: true,
    challengeId,
    expiresAt: record.expiresAt,
    delivery: useDemo ? "demo" : "email",
    ...(demoOtp ? { demoOtp } : {}),
  };
}

export type VerifyOtpResult =
  | { ok: true; challenge: SignupChallenge }
  | { ok: false; error: string; status: number };

export async function verifySignupOtp(challengeId: string, otp: string, portal: PortalKey): Promise<VerifyOtpResult> {
  const col = requireCollectionInProduction(await collection());
  let record: SignupChallenge | null = null;
  if (col) {
    record = (await col.findOne({ _id: challengeId })) ?? null;
  } else {
    record = memory().challenges.get(challengeId) ?? null;
  }

  if (!record || record.portal !== portal) {
    return { ok: false, status: 400, error: "Invalid or expired verification code." };
  }
  if (record.consumedAt) {
    return { ok: false, status: 400, error: "This verification code has already been used." };
  }
  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    return { ok: false, status: 400, error: "This verification code has expired. Request a new one." };
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, error: "Too many incorrect attempts. Request a new code." };
  }

  if (record.provider === "supabase_email") {
    const verified = await verifyEmailOtp(record.email, otp.trim());
    if (!verified.ok) {
      // Provider outages and provider-side throttling are not wrong codes, so
      // do not burn an attempt for them.
      if (verified.status >= 500 || verified.status === 429) {
        return { ok: false, status: verified.status, error: verified.error };
      }
      record.attempts += 1;
      if (col) {
        await col.updateOne({ _id: challengeId }, { $set: { attempts: record.attempts } });
      }
      return { ok: false, status: 400, error: "Incorrect verification code." };
    }
  } else {
    const match =
      Boolean(record.otpHash) &&
      timingSafeEqualHex(record.otpHash as string, hashOtp(challengeId, otp.trim()));
    if (!match) {
      record.attempts += 1;
      if (col) {
        await col.updateOne({ _id: challengeId }, { $set: { attempts: record.attempts } });
      }
      return { ok: false, status: 400, error: "Incorrect verification code." };
    }
  }

  record.consumedAt = new Date().toISOString();
  if (col) {
    await col.updateOne({ _id: challengeId }, { $set: { consumedAt: record.consumedAt } });
  }
  return { ok: true, challenge: record };
}

export function normalizeSignupPhone(phone: string): string {
  return normalizePhone(phone);
}

export function normalizeSignupEmail(email: string): string {
  return normalizeEmail(email);
}
