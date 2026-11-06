"use client";

import { registerClientPorts, type BoundPorts } from "@/lib/portals";

export function PortalPortsProvider({ ports, children }: { ports: BoundPorts; children: React.ReactNode }) {
  registerClientPorts(ports);
  return children;
}
