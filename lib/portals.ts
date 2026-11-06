export const portals = [
  { id: "administrator", port: 3000, basePath: "/admin", home: "/admin", label: "Administrator portal" },
  { id: "project_manager", port: 3001, basePath: "/pm", home: "/pm", label: "Project manager portal" },
] as const;

export type PortalId = (typeof portals)[number]["id"];

export function portalById(id: PortalId) {
  return portals.find((portal) => portal.id === id) ?? portals[0];
}

export function portalByPort(port: number) {
  return portals.find((portal) => portal.port === port) ?? null;
}

export function portalForPath(pathname: string) {
  const path = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return portals.find((portal) => path === portal.basePath || path.startsWith(`${portal.basePath}/`)) ?? null;
}

export function portalUrl(id: PortalId, path?: string) {
  const portal = portalById(id);
  return `http://localhost:${portal.port}${path ?? portal.home}`;
}
