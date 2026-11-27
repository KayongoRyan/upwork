import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/mongo", () => ({
  getMongoRuntime: vi.fn(async () => null),
  requireCollectionInProduction: <T,>(value: T) => value,
  PersistenceError: class PersistenceError extends Error {},
}));

import { createSignupOtp, verifySignupOtp } from "@/lib/server/otp";

const baseInput = {
  portal: "project_manager" as const,
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+250700000000",
  email: "ada@example.com",
  passwordHash: "hashed-password",
};

function resetOtpMemory() {
  delete (globalThis as { __cpmisOtp?: unknown }).__cpmisOtp;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetOtpMemory();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_EMAIL_OTP_TIMEOUT_MS;
  delete process.env.OTP_DEMO_FALLBACK;
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetOtpMemory();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_EMAIL_OTP_TIMEOUT_MS;
  delete process.env.OTP_DEMO_FALLBACK;
});

describe("signup OTP challenges", () => {
  it("requires email OTP configuration when the demo fallback is off", async () => {
    process.env.OTP_DEMO_FALLBACK = "false";
    const created = await createSignupOtp(baseInput);
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.status).toBe(503);
    expect(created.error).toContain("SUPABASE_URL");
  });

  it("uses a locally verified demo code when Supabase is not configured", async () => {
    process.env.OTP_DEMO_FALLBACK = "true";
    const created = await createSignupOtp(baseInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.delivery).toBe("demo");
    expect(created.demoOtp).toMatch(/^\d{6}$/);

    const wrong = created.demoOtp === "000000" ? "000001" : "000000";
    const rejected = await verifySignupOtp(created.challengeId, wrong, baseInput.portal);
    expect(rejected.ok).toBe(false);

    const verified = await verifySignupOtp(
      created.challengeId,
      created.demoOtp as string,
      baseInput.portal,
    );
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.challenge.email).toBe(baseInput.email);
    expect(verified.challenge.provider).toBe("demo");

    const reused = await verifySignupOtp(
      created.challengeId,
      created.demoOtp as string,
      baseInput.portal,
    );
    expect(reused.ok).toBe(false);
    if (reused.ok) return;
    expect(reused.error).toContain("already been used");
  });

  it("sends through Supabase and verifies through Supabase", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.OTP_DEMO_FALLBACK = "false";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ access_token: "token" }));
    vi.stubGlobal("fetch", fetchMock);

    const created = await createSignupOtp(baseInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.delivery).toBe("email");
    expect(created.demoOtp).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.supabase.co/auth/v1/otp");

    const verified = await verifySignupOtp(created.challengeId, "123456", baseInput.portal);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.challenge.provider).toBe("supabase_email");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, verifyInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(verifyInit.body))).toEqual({
      email: baseInput.email,
      token: "123456",
      type: "email",
    });
  });

  it("falls back to a demo code when Supabase delivery fails and the fallback is on", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.OTP_DEMO_FALLBACK = "true";

    const fetchMock = vi.fn(async () =>
      jsonResponse({ msg: "email rate limit exceeded" }, 429),
    );
    vi.stubGlobal("fetch", fetchMock);

    const created = await createSignupOtp(baseInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.delivery).toBe("demo");
    expect(created.demoOtp).toMatch(/^\d{6}$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The challenge was converted to a local demo record, so verification must
    // not call Supabase again.
    const verified = await verifySignupOtp(
      created.challengeId,
      created.demoOtp as string,
      baseInput.portal,
    );
    expect(verified.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not leave a challenge when delivery fails without the fallback", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.OTP_DEMO_FALLBACK = "false";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ msg: "invalid email" }, 400)),
    );

    const created = await createSignupOtp(baseInput);
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.status).toBe(400);
  });
});
