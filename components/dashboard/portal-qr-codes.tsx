"use client";

import { useSyncExternalStore } from "react";
import QRCode from "react-qr-code";
import { activePort, type CpmisPortalId } from "@/lib/portals";

const TARGETS: Array<{ id: CpmisPortalId; label: string; description: string; base: string }> = [
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
    <div className="grid gap-4 md:grid-cols-3">
      {TARGETS.map((target) => {
        const url = mounted ? signupUrl(target.id, target.base) : `${target.base}/signup`;
        return (
          <div key={target.id} className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.03)]">
            <div className="mx-auto flex w-full max-w-[220px] items-center justify-center rounded-2xl bg-[#fcfbfa] p-3">
              <QRCode value={url} size={180} style={{ height: "auto", maxWidth: "100%", width: "100%" }} viewBox="0 0 256 256" />
            </div>
            <p className="mt-4 text-sm font-semibold text-black">{target.label}</p>
            <p className="mt-1 text-xs text-black/55">{target.description}</p>
            <p className="mt-3 break-all rounded-xl bg-[#fcfbfa] px-3 py-2 font-mono text-[11px] text-black/55">{url}</p>
          </div>
        );
      })}
    </div>
  );
}
