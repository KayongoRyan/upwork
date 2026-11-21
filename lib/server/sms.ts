/**
 * Twilio SMS delivery for OTP verification.
 *
 * Configure via env vars (either auth style):
 *   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER
 * or
 *   TWILIO_ACCOUNT_SID + TWILIO_API_KEY + TWILIO_API_SECRET + TWILIO_FROM_NUMBER
 *
 * TWILIO_FROM_NUMBER must be an E.164 sender number, e.g. +15005550006.
 * No Twilio SDK dependency; uses the REST API directly. Never log OTP codes.
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

function twilioAuth() {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const from = env("TWILIO_FROM_NUMBER");
  const apiKey = env("TWILIO_API_KEY");
  const apiSecret = env("TWILIO_API_SECRET");
  const authToken = env("TWILIO_AUTH_TOKEN");

  if (accountSid && from && apiKey && apiSecret) {
    return { ok: true as const, accountSid, from, user: apiKey, pass: apiSecret };
  }
  if (accountSid && from && authToken) {
    return { ok: true as const, accountSid, from, user: accountSid, pass: authToken };
  }
  return {
    ok: false as const,
    error:
      "SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_FROM_NUMBER, and either TWILIO_AUTH_TOKEN or TWILIO_API_KEY+TWILIO_API_SECRET.",
  };
}

export function smsConfigured(): boolean {
  return twilioAuth().ok;
}

export async function sendSms(to: string, body: string): Promise<SmsResponse> {
  const auth = twilioAuth();
  if (!auth.ok) {
    return { ok: false, status: 503, error: auth.error };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(auth.accountSid)}/Messages.json`;
  const basic = Buffer.from(`${auth.user}:${auth.pass}`).toString("base64");
  const form = new URLSearchParams({ To: to, From: auth.from, Body: body });

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  } catch (error) {
    return { ok: false, status: 502, error: `Could not reach SMS provider: ${(error as Error).message}` };
  }

  const payload = (await res.json().catch(() => null)) as { sid?: string; message?: string; code?: number } | null;
  if (!res.ok) {
    const message = payload?.message || `SMS provider returned ${res.status}.`;
    return { ok: false, status: res.status >= 400 && res.status < 500 ? 400 : 502, error: message };
  }

  return { ok: true, sid: payload?.sid ?? "" };
}
