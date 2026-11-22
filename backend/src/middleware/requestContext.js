import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger.ts";

/** Attach a request id and emit a structured access log line on completion. */
export function requestContext(req, res, next) {
  const incoming = req.get("x-request-id");
  const requestId =
    typeof incoming === "string" && incoming.trim() && incoming.length <= 128
      ? incoming.trim()
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const started = Date.now();
  let logged = false;
  const log = (event) => {
    if (logged) return;
    logged = true;
    logger.info("http.request", {
      event,
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: Date.now() - started,
      ip: req.ip,
      userAgent: req.get("user-agent")?.slice(0, 256),
    });
  };

  res.on("finish", () => log("finish"));
  res.on("close", () => log("close"));
  next();
}
