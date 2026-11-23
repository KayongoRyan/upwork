/* eslint-disable @typescript-eslint/no-explicit-any */
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

async function withUpstream(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, body: Buffer) => void | Promise<void>,
  fn: (baseUrl: string) => Promise<void>,
) {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    await handler(req, res, Buffer.concat(chunks));
    if (!res.writableEnded) res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function loadBff(baseUrl: string) {
  vi.resetModules();
  process.env.CPMIS_API_URL = baseUrl;
  (process.env as any).NODE_ENV = "test";
  return await import("../../lib/server/cpmis-api");
}

afterEach(() => {
  delete process.env.CPMIS_API_URL;
  delete process.env.VERTEXA_API_URL;
  vi.resetModules();
});

describe("BFF forwarding", () => {
  it("proxyCpmisJson forwards method, path, body, headers, and set-cookie", async () => {
    let seen: any = null;
    await withUpstream((req, res, body) => {
      seen = { method: req.method, url: req.url, headers: req.headers, body: body.toString("utf8") };
      res.statusCode = 201;
      res.setHeader("content-type", "application/json");
      res.setHeader("set-cookie", "cpmis_session_pm=newtoken; Path=/; HttpOnly");
      res.end(JSON.stringify({ ok: true, id: "t1" }));
    }, async (baseUrl) => {
      const { proxyCpmisJson, CPMIS_API_PREFIX } = await loadBff(baseUrl);
      const req = new Request("https://app.example.com/api/cpmis/business/tasks?x=1", {
        method: "POST",
        headers: {
          cookie: "cpmis_session_pm=abc",
          "x-csrf-token": "csrf-1",
          "x-forwarded-for": "203.0.113.9",
          "x-forwarded-host": "app.example.com",
          "x-forwarded-proto": "https",
          origin: "https://app.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Task" }),
      });
      const res = await proxyCpmisJson(req, `${CPMIS_API_PREFIX}/business/tasks?x=1`);
      expect(res.status).toBe(201);
      expect(res.headers.get("set-cookie")).toContain("cpmis_session_pm=newtoken");
      expect(await res.json()).toEqual({ ok: true, id: "t1" });
      expect(seen.method).toBe("POST");
      expect(seen.url).toBe("/api/v1/cpmis/business/tasks?x=1");
      expect(seen.headers.cookie).toBe("cpmis_session_pm=abc");
      expect(seen.headers["x-csrf-token"]).toBe("csrf-1");
      expect(seen.headers["x-forwarded-for"]).toBe("203.0.113.9");
      expect(seen.headers["x-forwarded-host"]).toBe("app.example.com");
      expect(seen.headers["x-forwarded-proto"]).toBe("https");
      expect(seen.headers.origin).toBe("https://app.example.com");
      expect(seen.headers["x-api-version"]).toBe("v1");
      expect(JSON.parse(seen.body)).toEqual({ title: "Task" });
    });
  });

  it("proxyCpmisJson returns 503 when upstream is unavailable", async () => {
    const { proxyCpmisJson } = await loadBff("http://127.0.0.1:1");
    const req = new Request("https://app.example.com/api/cpmis/auth/sign-in", { method: "POST", body: "{}" });
    const res = await proxyCpmisJson(req, "/api/v1/cpmis/auth/sign-in");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, error: "service-unavailable" });
  });

  it("proxyCpmisRaw forwards raw body, preserves redirect and response headers", async () => {
    let seen: any = null;
    await withUpstream((req, res, body) => {
      seen = { method: req.method, url: req.url, headers: req.headers, bodyLen: body.length };
      res.statusCode = 303;
      res.setHeader("location", "/admin/users?ok=1");
      res.setHeader("set-cookie", "cpmis_session_admin=s; Path=/; HttpOnly");
      res.end();
    }, async (baseUrl) => {
      const { proxyCpmisRaw } = await loadBff(baseUrl);
      const body = new FormData();
      body.set("name", "Alice");
      const req = new Request("https://app.example.com/api/users", {
        method: "POST",
        headers: {
          cookie: "cpmis_session_admin=a",
          "x-forwarded-host": "app.example.com",
          "x-forwarded-proto": "https",
          origin: "https://app.example.com",
        },
        body,
      });
      const res = await proxyCpmisRaw(req, "/api/v1/cpmis/users");
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("/admin/users?ok=1");
      expect(res.headers.get("set-cookie")).toContain("cpmis_session_admin=s");
      expect(seen.method).toBe("POST");
      expect(seen.url).toBe("/api/v1/cpmis/users");
      expect(seen.headers.cookie).toBe("cpmis_session_admin=a");
      expect(seen.headers["x-forwarded-host"]).toBe("app.example.com");
      expect(seen.bodyLen).toBeGreaterThan(0);
    });
  });
});
