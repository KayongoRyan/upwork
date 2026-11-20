import { randomUUID } from "node:crypto";

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
  res.on("finish", () => {
    const durationMs = Date.now() - started;
    console.log(
      `[${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`,
    );
  });

  next();
}
