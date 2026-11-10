import { NextResponse, type NextRequest } from "next/server";
import { portalByPort, portalForPath } from "@/lib/portals";

function requestPort(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const match = host.match(/:(\d+)$/);
  if (match) return Number(match[1]);
  return request.nextUrl.protocol === "https:" ? 443 : 80;
}

function redirect(location: string, fromPort: number) {
  const target = new URL(location);
  // Next treats :3000 as this process's origin and rewrites that Location to a
  // relative path, which would keep the browser on the other portal's port.
  if (target.port === "3000" && fromPort !== 3000) {
    const safe = location.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
    return new NextResponse(
      `<!doctype html><meta http-equiv="refresh" content="0;url=${safe}"><script>location.replace(${JSON.stringify(location)})</script>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }
  return new NextResponse(null, {
    status: 307,
    headers: { Location: location },
  });
}

function rememberPorts(request: NextRequest) {
  const raw = request.headers.get("x-cpmis-ports");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    globalThis.__cpmisPorts = { ...globalThis.__cpmisPorts, ...parsed };
  } catch {
    /* A bad header must not block the page. */
  }
}

function forward(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-cpmis-q", request.nextUrl.searchParams.get("q") ?? "");
  return NextResponse.next({ request: { headers } });
}

export function proxy(request: NextRequest) {
  rememberPorts(request);
  const port = requestPort(request);
  const here = portalByPort(port);
  if (!here) return forward(request);

  const { pathname, search } = request.nextUrl;
  const local = `http://localhost:${port}`;
  if (pathname === "/") {
    return redirect(`${local}${here.home}`, port);
  }

  const owner = portalForPath(pathname);
  if (owner && owner.port !== port) {
    return redirect(`http://localhost:${owner.port}${pathname}${search}`, port);
  }

  if (!pathname.startsWith(here.basePath)) {
    return redirect(`${local}${here.home}`, port);
  }

  return forward(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
