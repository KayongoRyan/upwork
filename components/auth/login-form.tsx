"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import type { CpmisPortalId } from "@/lib/portals";

const DEMO_PASSWORDS: Record<CpmisPortalId, string> = {
  administrator: "AdminDemo2026!",
  project_manager: "PmDemo2026!",
  site_engineer: "SeDemo2026!",
  quantity_surveyor: "QsDemo2026!",
};

const PORTAL_LABEL: Record<CpmisPortalId, string> = {
  administrator: "Administrator portal",
  project_manager: "Project manager portal",
  site_engineer: "Site engineer portal",
  quantity_surveyor: "Quantity surveyor portal",
};

export function LoginForm({ portal }: { portal: CpmisPortalId }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portal, email, password }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; redirectTo?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "Sign-in failed.");
        return;
      }
      router.push(data.redirectTo ?? "/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-black/45">CPMIS</p>
      <h1 className="mt-2 text-2xl font-semibold text-black">{PORTAL_LABEL[portal]}</h1>
      <p className="mt-1 text-sm text-black/55">Sign in with your email and password.</p>

      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Signing in..." : "Sign in"}</Button>
      </form>

      <div className="mt-5 rounded-2xl bg-[#fff7f3] px-4 py-3 text-xs text-black/60">
        <p className="font-medium text-black/75">Demo password ({PORTAL_LABEL[portal].replace(" portal", "")})</p>
        <p className="mt-1 font-mono">{DEMO_PASSWORDS[portal]}</p>
      </div>
    </div>
  );
}
