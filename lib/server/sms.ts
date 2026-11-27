/**
 * DEPRECATED: portal signup OTPs are now delivered by email through Supabase
 * (see `lib/server/email-otp.ts`). This module is retained for reference and
 * possible future SMS notifications, but it is no longer used by the signup flow.
 *
 * Africa's Talking SMS delivery for OTP verification.
 *
 * Configure via env vars:
 *   AT_USERNAME / AFRICASTALKING_USERNAME   - Africa's Talking username (use "sandbox" for sandbox)
 *   AT_API_KEY / AFRICASTALKING_API_KEY     - Africa's Talking API key
 *   AT_FROM / AFRICASTALKING_FROM           - Optional sender ID/shortcode
 *   AFRICASTALKING_BASE_URL                 - Optional override; defaults to sandbox/production by username
 *
 * No SDK dependency; uses the REST API directly. Never log OTP codes.
 */

export interface SmsResult {
  ok: true;
  sid: string;
}

export interface SmsError {
  ok: false;
  error: string;
  status: number;
}

type SmsResponse = SmsResult | SmsError;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function atConfig() {
  const username = env("AT_USERNAME") || env("AFRICASTALKING_USERNAME");
  const apiKey = env("AT_API_KEY") || env("AFRICASTALKING_API_KEY");
  const from = env("AT_FROM") || env("AFRICASTALKING_FROM");
  const baseUrl =
    env("AFRICASTALKING_BASE_URL") ||
    (username.toLowerCase() === "sandbox"
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging");

  if (username && apiKey) {
    return { ok: true as const, username, apiKey, from, baseUrl };
  }
  return {
    ok: false as const,
    error:
      "SMS is not configured. Set AT_USERNAME and AT_API_KEY (and AT_FROM if required).",
  };
}

export function smsConfigured(): boolean {
  return atConfig().ok;
}

export async function sendSms(to: string, body: string): Promise<SmsResponse> {
  const cfg = atConfig();
  if (!cfg.ok) {
    return { ok: false, status: 503, error: cfg.error };
  }

  const form = new URLSearchParams({
    username: cfg.username,
    to,
    message: body,
  });
  if (cfg.from) form.set("from", cfg.from);

  let res: Response;
  try {
    res = await fetch(cfg.baseUrl, {
      method: "POST",
      headers: {
        apiKey: cfg.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
    });
  } catch (error) {
    return { ok: false, status: 502, error: `Could not reach SMS provider: ${(error as Error).message}` };
  }

  const payload = (await res.json().catch(() => null)) as
    | {
        SMSMessageData?: {
          Message?: string;
          Recipients?: Array<{ statusCode?: number | string; status?: string; messageId?: string; number?: string }>;
        };
      }
    | null;

  if (!res.ok) {
    const message =
      payload?.SMSMessageData?.Message || `SMS provider returned ${res.status}.`;
    return { ok: false, status: res.status >= 400 && res.status < 500 ? 400 : 502, error: message };
  }

  const recipients = payload?.SMSMessageData?.Recipients ?? [];
  const first = recipients[0];
  const status = String(first?.status ?? "").toLowerCase();
  const statusCode = Number(first?.statusCode);
  const accepted = status.includes("success") || statusCode === 101 || statusCode === 102;
  if (!accepted) {
    return {
      ok: false,
      status: 400,
      error: first?.status ? `SMS not sent: ${first.status}` : (payload?.SMSMessageData?.Message ?? "SMS was not accepted by provider."),
    };
  }

  return { ok: true, sid: first?.messageId ?? "" };
}
