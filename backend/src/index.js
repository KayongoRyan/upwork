import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { closeDb, connectDb, mongoStartupHelp } from "./db.js";
import { requestContext } from "./middleware/requestContext.js";
import { requireDb } from "./middleware/requireDb.js";
import { cpmisRouter } from "./routes/cpmis.ts";
import { cpmisRemainingRouter } from "./routes/cpmis-remaining.ts";
import { businessRouter } from "./routes/business.ts";
import { healthRouter } from "./routes/health.js";
import { inquiriesRouter } from "./routes/inquiries.js";
import { notificationsRouter } from "./routes/notifications.js";
import { logger } from "./lib/logger.ts";

// Express 4 does not catch rejected async route handlers. Wrap them so errors reach the global handler.
function wrapAsync(fn) {
  if (typeof fn !== "function") return fn;
  if (fn.__wrappedAsync || fn.stack || fn.handle || fn.length === 4) return fn;
  const wrapped = function wrappedAsync(...args) {
    try {
      const result = fn.apply(this, args);
      if (result && typeof result.then === "function") {
        const next = args[args.length - 1];
        return result.catch(typeof next === "function" ? next : (err) => { throw err; });
      }
      return result;
    } catch (err) {
      const next = args[args.length - 1];
      if (typeof next === "function") return next(err);
      throw err;
    }
  };
  wrapped.__wrappedAsync = true;
  return wrapped;
}
for (const method of ["get", "post", "put", "patch", "delete", "all", "use"]) {
  const original = express.Router[method];
  express.Router[method] = function patched(...args) {
    return original.apply(this, args.map((a) => (typeof a === "function" && !a.stack && !a.handle ? wrapAsync(a) : a)));
  };
}

const app = express();
for (const method of ["get", "post", "put", "patch", "delete", "all", "use"]) {
  const original = app[method];
  if (typeof original === "function") {
    app[method] = (...args) => original.apply(app, args.map((a) => (typeof a === "function" ? wrapAsync(a) : a)));
  }
}

app.disable("x-powered-by");
app.use(requestContext);
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
    exposedHeaders: ["X-Request-Id", "X-API-Version", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After"],
  }),
);
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));

app.use("/api", (_req, res, next) => {
  res.setHeader("X-API-Version", config.apiVersion);
  next();
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "Vertexa CPMIS API",
    version: "0.1.0",
    apiVersion: config.apiVersion,
    apiBasePath: config.apiBasePath,
    docs: "See backend/README.md",
  });
});

const v1 = express.Router();
v1.get("/", (_req, res) => {
  res.json({
    ok: true,
    version: config.apiVersion,
    resources: [
      `${config.apiBasePath}/health`,
      `${config.apiBasePath}/inquiries`,
      `${config.apiBasePath}/notifications`,
      `${config.apiBasePath}/cpmis`,
      `${config.apiBasePath}/cpmis/business`,
    ],
  });
});
v1.use("/health", healthRouter);
v1.use("/inquiries", requireDb, inquiriesRouter);
v1.use("/notifications", requireDb, notificationsRouter);
v1.use("/cpmis", requireDb, cpmisRouter);
v1.use("/cpmis/business", requireDb, businessRouter);
v1.use("/cpmis", requireDb, cpmisRemainingRouter);

app.use(config.apiBasePath, v1);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "not_found",
    apiVersion: req.path.startsWith("/api/") ? config.apiVersion : undefined,
    supportedVersions: req.path.startsWith("/api/") ? [config.apiVersion] : undefined,
    requestId: req.requestId,
  });
});

app.use((error, req, res, next) => {
  void next;
  if (res.headersSent) {
    logger.error("http.error.after_headers_sent", error, { requestId: req.requestId, method: req.method, path: req.originalUrl });
    return;
  }

  const status = Number(error?.status || error?.statusCode || 0);
  const isPersistence = error?.name === "PersistenceError";
  const isPayloadTooLarge = error?.type === "entity.too.large" || status === 413;
  const isBadJson = error?.type === "entity.parse.failed" || (error instanceof SyntaxError && error && typeof error === "object" && "body" in error);

  if (isPersistence) {
    logger.warn("http.persistence_unavailable", { requestId: req.requestId, method: req.method, path: req.originalUrl });
    return res.status(503).json({ ok: false, error: "persistence-failed", message: "The database is temporarily unavailable. Try again.", requestId: req.requestId, apiVersion: config.apiVersion });
  }
  if (isPayloadTooLarge) {
    logger.warn("http.payload_too_large", { requestId: req.requestId, method: req.method, path: req.originalUrl });
    return res.status(413).json({ ok: false, error: "payload-too-large", message: "The request payload is too large.", requestId: req.requestId, apiVersion: config.apiVersion });
  }
  if (isBadJson) {
    logger.warn("http.invalid_json", { requestId: req.requestId, method: req.method, path: req.originalUrl });
    return res.status(400).json({ ok: false, error: "invalid-json", message: "The request body could not be parsed as valid JSON.", requestId: req.requestId, apiVersion: config.apiVersion });
  }
  if (status >= 400 && status < 500) {
    logger.warn("http.client_error", { requestId: req.requestId, method: req.method, path: req.originalUrl, status, error: error?.message });
    return res.status(status).json({
      ok: false,
      error: typeof error?.code === "string" ? error.code : "bad-request",
      message: typeof error?.message === "string" ? error.message : "Request failed.",
      requestId: req.requestId,
      apiVersion: config.apiVersion,
    });
  }

  logger.error("http.unhandled_error", error, { requestId: req.requestId, method: req.method, path: req.originalUrl, status: status || 500 });
  res.status(500).json({
    ok: false,
    error: "server_error",
    message: "An unexpected server error occurred.",
    requestId: req.requestId,
    apiVersion: config.apiVersion,
  });
});

const server = app.listen(config.port, () => {
  logger.info("server.started", { port: config.port, apiBasePath: config.apiBasePath, url: `http://localhost:${config.port}` });
});

connectDb()
  .then(async () => {
    const { PORTAL_KEYS, portalDatabaseName } = await import("@/lib/server/mongo.ts");
    logger.info("mongo.connected", { db: config.mongoDb, uri: config.mongoUri, portals: PORTAL_KEYS.map((p) => ({ portal: p, db: portalDatabaseName(p) })) });
  })
  .catch((error) => {
    logger.warn("mongo.unavailable", { help: mongoStartupHelp, message: error?.message });
  });

async function shutdown() {
  server.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("unhandledRejection", (reason) => {
  logger.error("process.unhandled_rejection", reason);
});
process.on("uncaughtException", (error) => {
  logger.error("process.uncaught_exception", error);
});