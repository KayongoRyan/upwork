"use client";

import { useSyncExternalStore } from "react";
import QRCode from "react-qr-code";
import { activePort, type CpmisPortalId } from "@/lib/portals";

const TARGETS: Array<{ id: CpmisPortalId; label: string; description: string; base: string }> = [
  {
    id: "administrator",
    label: "Administrator",
    description: "Scan to create an Administrator account.",
    base: "/admin",
  },
  {
    id: "project_manager",
    label: "Project Manager",
    description: "Scan to create a Project Manager account.",
    base: "/pm",
  },
  {
    id: "site_engineer",
    label: "Site Engineer",
    description: "Scan to create a Site Engineer account.",
    base: "/se",
  },
  {
    id: "quantity_surveyor",
    label: "Quantity Surveyor",
    description: "Scan to create a Quantity Surveyor account.",
    base: "/qs",
  },
];

function signupUrl(id: CpmisPortalId, base: string) {
  if (typeof window === "undefined") return `${base}/signup`;
  const port = activePort(id);
  return `${window.location.protocol}//${window.location.hostname}:${port}${base}/signup`;
}

const emptySubscribe = () => () => {};

export function PortalQrCodes() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  return (
    <section className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.03)]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-black/45">Onboarding</p>
          <h2 className="mt-1 text-xl font-semibold text-black">QR Code</h2>
          <p className="mt-1 max-w-2xl text-sm text-black/55">
            Each portal has its own QR code. Scan the code for a portal, enter your details, and verify your phone number with an OTP before entering.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TARGETS.map((target) => {
          const url = mounted ? signupUrl(target.id, target.base) : `${target.base}/signup`;
          return (
            <div key={target.id} className="rounded-2xl border border-black/5 bg-[#fcfbfa] p-4">
              <div className="mx-auto flex w-full max-w-[220px] items-center justify-center rounded-2xl bg-white p-3 shadow-sm">
                <QRCode value={url} size={180} style={{ height: "auto", maxWidth: "100%", width: "100%" }} viewBox="0 0 256 256" />
              </div>
              <p className="mt-4 text-sm font-semibold text-black">{target.label}</p>
              <p className="mt-1 text-xs text-black/55">{target.description}</p>
              <p className="mt-3 break-all rounded-xl bg-white px-3 py-2 font-mono text-[11px] text-black/55">{url}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
