"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import type { CpmisPortalId } from "@/lib/portals";

const PORTAL_LABEL: Record<CpmisPortalId, string> = {
  administrator: "Administrator portal",
  project_manager: "Project manager portal",
  site_engineer: "Site engineer portal",
  quantity_surveyor: "Quantity surveyor portal",
};

const PORTAL_BASE: Record<CpmisPortalId, string> = {
  administrator: "/admin",
  project_manager: "/pm",
  site_engineer: "/se",
  quantity_surveyor: "/qs",
};

type Step = "details" | "otp";

export function SignupForm({ portal }: { portal: CpmisPortalId }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt || step !== "otp") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, step]);

  const secondsLeft =
    expiresAt && step === "otp" ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : null;

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/signup/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portal, firstName, lastName, phone, email, password }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            challengeId?: string;
            expiresAt?: string;
            delivery?: "email" | "demo";
            demoOtp?: string;
          }
        | null;
      if (!res.ok || !data?.ok || !data.challengeId) {
        setError(data?.error ?? "Could not send verification code.");
        return;
      }
      setChallengeId(data.challengeId);
      setExpiresAt(data.expiresAt ?? null);
      setNow(Date.now());
      setDemoOtp(data.demoOtp ?? null);
      setStep("otp");
      setMessage(
        data.delivery === "demo"
          ? "Demo mode: use the code shown below."
          : `Verification code sent to ${email}.`,
      );
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/signup/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portal, challengeId, otp }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; redirectTo?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Verification failed.");
        return;
      }
      router.push(data.redirectTo ?? PORTAL_BASE[portal]);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    if (pending) return;
    setOtp("");
    setChallengeId(null);
    setDemoOtp(null);
    setExpiresAt(null);
    setStep("details");
    setMessage(null);
    setError(null);
  }

  const expired = secondsLeft === 0;
  const countdown =
    secondsLeft === null ? null : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <div className="w-full max-w-md rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-black/45">CPMIS</p>
      <h1 className="mt-2 text-2xl font-semibold text-black">{PORTAL_LABEL[portal]}</h1>
      <p className="mt-1 text-sm text-black/55">
        {step === "details"
          ? "Create your account to access this portal."
          : "Enter the verification code sent to your email."}
      </p>

      {step === "details" ? (
        <form className="mt-6 grid gap-4" onSubmit={requestOtp}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName">
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </Field>
            <Field label="Last name" htmlFor="lastName">
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </Field>
          </div>
          <Field label="Phone number" htmlFor="phone" hint="Use international format, e.g. +2507...">
            <Input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters">
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending}>{pending ? "Sending code..." : "Send verification code"}</Button>
        </form>
      ) : (
        <form className="mt-6 grid gap-4" onSubmit={verifyOtp}>
          <div className="rounded-2xl bg-[#f7f4f2] px-4 py-3 text-sm text-black/65">
            <p><span className="font-medium text-black/80">Code sent to:</span> {email}</p>
            <p><span className="font-medium text-black/80">Phone:</span> {phone}</p>
            {countdown ? (
              <p className={expired ? "mt-1 font-medium text-destructive" : "mt-1 text-black/55"}>
                {expired ? "Code expired. Request a new code." : `Code expires in ${countdown}`}
              </p>
            ) : null}
          </div>
          <Field label="Verification code" htmlFor="otp">
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Verification code"
              maxLength={10}
              required
            />
          </Field>
          {demoOtp ? (
            <div className="rounded-2xl bg-[#fff7f3] px-4 py-3 text-sm text-black/70">
              <p className="font-medium text-black/80">Demo verification code</p>
              <p className="mt-1 font-mono text-base tracking-[0.2em] text-black">{demoOtp}</p>
              <p className="mt-1 text-xs text-black/50">Temporary demo fallback while email delivery is not configured.</p>
            </div>
          ) : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending || expired || otp.length < 6}>{pending ? "Verifying..." : "Verify and create account"}</Button>
          <button type="button" onClick={resend} className="text-sm text-black/55 underline underline-offset-2 hover:text-black">
            Edit details or resend code
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-black/55">
        Already have an account?{" "}
        <Link href={`${PORTAL_BASE[portal]}/login`} className="font-medium text-[#d97757] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
