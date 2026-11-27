import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emailOtpConfigured,
  sendEmailOtp,
  verifyEmailOtp,
} from "@/lib/server/email-otp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_EMAIL_OTP_TIMEOUT_MS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_EMAIL_OTP_TIMEOUT_MS;
});

describe("Supabase email OTP provider", () => {
  it("detects configured projects with anon or publishable keys", () => {
    expect(emailOtpConfigured()).toBe(true);

    delete process.env.SUPABASE_ANON_KEY;
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    expect(emailOtpConfigured()).toBe(true);

    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    expect(emailOtpConfigured()).toBe(false);
  });

  it("sends an OTP email through the Supabase Auth REST API", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmailOtp("person@example.com");
    expect(result).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/auth/v1/otp");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).apikey).toBe("anon-key");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "person@example.com",
      create_user: true,
    });
  });

  it("normalizes trailing slashes and /rest/v1 in the project URL", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co/rest/v1/";
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmailOtp("person@example.com");
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://example.supabase.co/auth/v1/otp");
  });

  it("maps provider rate limits to 429 with the provider message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ msg: "email rate limit exceeded" }, 429)),
    );

    const result = await sendEmailOtp("person@example.com");
    expect(result).toEqual({
      ok: false,
      status: 429,
      error: "email rate limit exceeded",
    });
  });

  it("verifies a token through /auth/v1/verify", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ access_token: "token" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyEmailOtp("person@example.com", "123456");
    expect(result).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/auth/v1/verify");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "person@example.com",
      token: "123456",
      type: "email",
    });
  });

  it("returns a generic error for invalid or expired codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ msg: "Token has expired or is invalid" }, 403)),
    );

    const result = await verifyEmailOtp("person@example.com", "000000");
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Incorrect or expired verification code.",
    });
  });

  it("returns 502 when the provider is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const result = await sendEmailOtp("person@example.com");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(502);
  });
});
