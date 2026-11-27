/**
 * Supabase email OTP delivery for portal signup.
 *
 * Supabase Auth generates and emails the verification code; this module only
 * talks to the Supabase Auth REST API (no SDK dependency). The code is verified
 * through Supabase, while the signup payload stays in our own challenge store.
 *
 * Configure via env vars:
 *   SUPABASE_URL                    - Project base URL, e.g. https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY               - Anon key (legacy JWT)
 *   SUPABASE_PUBLISHABLE_KEY        - Optional newer publishable key alias
 *   SUPABASE_EMAIL_OTP_TIMEOUT_MS   - Optional request timeout; defaults to 10000
 *
 * The Supabase project must have Email auth enabled. Add `{{ .Token }}` to the
 * Magic Link and Confirm signup email templates so users can read the 6-digit
 * code; the default templates only contain the confirmation link.
 *
 * Never log OTP codes.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
}

function timeoutMs(): number {
  const parsed = Number(env("SUPABASE_EMAIL_OTP_TIMEOUT_MS"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export interface SupabaseOtpConfig {
  ok: true;
  url: string;
  key: string;
  timeoutMs: number;
}

export interface SupabaseOtpConfigError {
  ok: false;
  error: string;
}

function supabaseConfig(): SupabaseOtpConfig | SupabaseOtpConfigError {
  const url = normalizeUrl(env("SUPABASE_URL"));
  const key = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  if (url && key) {
    return { ok: true, url, key, timeoutMs: timeoutMs() };
  }
  return {
    ok: false,
    error:
      "Email OTP is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY).",
  };
}

export function emailOtpConfigured(): boolean {
  return supabaseConfig().ok;
}

export interface EmailOtpSuccess {
  ok: true;
}

export interface EmailOtpFailure {
  ok: false;
  error: string;
  status: number;
}

export type EmailOtpResult = EmailOtpSuccess | EmailOtpFailure;

interface SupabaseErrorPayload {
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
  code?: number | string;
}

async function postAuth(
  path: string,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; payload: unknown }
  | { ok: false; status: number; payload: SupabaseErrorPayload | null }
  | { ok: false; network: true }
> {
  const cfg = supabaseConfig();
  if (!cfg.ok) return { ok: false, status: 503, payload: { msg: cfg.error } };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await res.json().catch(() => null)) as SupabaseErrorPayload | null;
    if (!res.ok) return { ok: false, status: res.status, payload };
    return { ok: true, payload };
  } catch {
    return { ok: false, network: true };
  } finally {
    clearTimeout(timer);
  }
}

function providerMessage(payload: SupabaseErrorPayload | null, fallback: string): string {
  return (
    payload?.msg?.trim() ||
    payload?.message?.trim() ||
    payload?.error_description?.trim() ||
    payload?.error?.trim() ||
    fallback
  );
}

function mapProviderStatus(status: number): number {
  if (status === 429) return 429;
  if (status === 503) return 503;
  if (status >= 500) return 502;
  return 400;
}

/** Ask Supabase to email a one-time code to `email`. */
export async function sendEmailOtp(email: string): Promise<EmailOtpResult> {
  const result = await postAuth("/auth/v1/otp", { email, create_user: true });
  if ("network" in result) {
    return { ok: false, status: 502, error: "Could not reach the email OTP provider. Try again." };
  }
  if (!result.ok) {
    return {
      ok: false,
      status: mapProviderStatus(result.status),
      error: providerMessage(result.payload, "The verification email could not be sent."),
    };
  }
  return { ok: true };
}

/** Verify a code previously emailed by Supabase. */
export async function verifyEmailOtp(email: string, token: string): Promise<EmailOtpResult> {
  const result = await postAuth("/auth/v1/verify", { email, token, type: "email" });
  if ("network" in result) {
    return { ok: false, status: 502, error: "Could not reach the email OTP provider. Try again." };
  }
  if (!result.ok) {
    if (result.status === 429) {
      return { ok: false, status: 429, error: "Too many verification attempts. Wait a moment and try again." };
    }
    if (result.status >= 500) {
      return { ok: false, status: 502, error: "The verification service is temporarily unavailable. Try again." };
    }
    return { ok: false, status: 400, error: "Incorrect or expired verification code." };
  }
  return { ok: true };
}
