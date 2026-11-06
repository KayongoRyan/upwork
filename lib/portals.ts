export const portals = [
  { id: "administrator", port: 3000, basePath: "/admin", home: "/admin", label: "Administrator portal" },
  { id: "project_manager", port: 3001, basePath: "/pm", home: "/pm", label: "Project manager portal" },
  { id: "site_engineer", port: 3002, basePath: "/se", home: "/se", label: "Site engineer portal" },
] as const;

export type PortalId = (typeof portals)[number]["id"];
export type BoundPorts = Record<PortalId, number>;

declare global {
  var __cpmisPorts: Partial<BoundPorts> | undefined;
}

let clientPorts: Partial<BoundPorts> = {};

/** Called from the root layout so client links use the ports the server actually bound. */
export function registerClientPorts(ports: Partial<BoundPorts>) {
  clientPorts = ports;
}

function livePorts(): Partial<BoundPorts> {
  if (typeof window === "undefined") return globalThis.__cpmisPorts ?? {};
  return clientPorts;
}

export function activePort(id: PortalId) {
  return livePorts()[id] ?? portals.find((portal) => portal.id === id)!.port;
}

export function readBoundPorts(): BoundPorts {
  return {
    administrator: activePort("administrator"),
    project_manager: activePort("project_manager"),
    site_engineer: activePort("site_engineer"),
  };
}

function withActivePort<T extends { id: PortalId; port: number }>(portal: T) {
  return { ...portal, port: activePort(portal.id) };
}

export function portalById(id: PortalId) {
  return withActivePort(portals.find((portal) => portal.id === id) ?? portals[0]);
}

export function portalByPort(port: number) {
  const portal = portals.find((item) => activePort(item.id) === port);
  return portal ? withActivePort(portal) : null;
}

export function portalForPath(pathname: string) {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const portal = portals.find((item) => path === item.basePath || path.startsWith(`${item.basePath}/`));
  return portal ? withActivePort(portal) : null;
}

export function portalUrl(id: PortalId, path?: string) {
  const portal = portalById(id);
  return `http://localhost:${portal.port}${path ?? portal.home}`;
}
