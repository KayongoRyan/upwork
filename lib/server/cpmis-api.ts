import { NextResponse } from "next/server";

const DEFAULT_DEV_API_URL = "http://localhost:4000";

function baseUrl(): string {
  const configured = process.env.CPMIS_API_URL?.trim() || process.env.VERTEXA_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return DEFAULT_DEV_API_URL;
  throw new Error("CPMIS_API_URL or VERTEXA_API_URL must be configured in production.");
}

function forwardHeaders(request: Request, extra: Record<string, string> = {}): HeadersInit {
  const headers: Record<string, string> = { ...extra };
  const cookie = request.headers.get("cookie");
  if (cookie) headers.cookie = cookie;
  const csrf = request.headers.get("x-csrf-token");
  if (csrf) headers["x-csrf-token"] = csrf;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  const origin = request.headers.get("origin");
  if (origin) headers.origin = origin;
  const contentType = request.headers.get("content-type");
  if (contentType && !headers["content-type"]) headers["content-type"] = contentType;
  return headers;
}

function applySetCookies(upstream: Response, response: NextResponse) {
  const headers = upstream.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? (upstream.headers.get("set-cookie") ? [upstream.headers.get("set-cookie")!] : []);
  for (const value of values) response.headers.append("set-cookie", value);
}

export async function proxyCpmisJson(request: Request, path: string, init?: { method?: string; body?: unknown }): Promise<NextResponse> {
  const method = init?.method ?? request.method;
  const body = init?.body !== undefined ? JSON.stringify(init.body) : (method !== "GET" && method !== "HEAD" ? await request.text() : undefined);
  const headers = forwardHeaders(request, body ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" });

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("[cpmis-bff] upstream unavailable", error);
    return NextResponse.json({ ok: false, error: "service-unavailable" }, { status: 503 });
  }

  const text = await upstream.text();
  const contentType = upstream.headers.get("content-type") ?? "application/json";
  const response = new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": contentType, "cache-control": "no-store" },
  });
  applySetCookies(upstream, response);
  return response;
}

export async function proxyCpmisRaw(request: Request, path: string, init?: { method?: string }): Promise<NextResponse> {
  const method = init?.method ?? request.method;
  const headers = forwardHeaders(request, { accept: request.headers.get("accept") ?? "*/*" });
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? request.body : undefined,
      // @ts-expect-error duplex required for streaming body in Node fetch
      duplex: "half",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    console.error("[cpmis-bff] upstream unavailable", error);
    return NextResponse.json({ ok: false, error: "service-unavailable" }, { status: 503 });
  }
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const respHeaders: Record<string, string> = { "content-type": contentType, "cache-control": upstream.headers.get("cache-control") ?? "no-store" };
  const location = upstream.headers.get("location");
  if (location) respHeaders.location = location;
  const contentDisposition = upstream.headers.get("content-disposition");
  if (contentDisposition) respHeaders["content-disposition"] = contentDisposition;
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) respHeaders["content-length"] = contentLength;
  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
  applySetCookies(upstream, response);
  return response;
}
