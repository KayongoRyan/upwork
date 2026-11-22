import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { closeDb, connectDb, mongoStartupHelp } from "./db.js";
import { requestContext } from "./middleware/requestContext.js";
import { requireDb } from "./middleware/requireDb.js";
import { cpmisRouter } from "./routes/cpmis.ts";
import { cpmisRemainingRouter } from "./routes/cpmis-remaining.ts";
import { healthRouter } from "./routes/health.js";
import { inquiriesRouter } from "./routes/inquiries.js";
import { notificationsRouter } from "./routes/notifications.js";

const app = express();

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
    ],
  });
});
v1.use("/health", healthRouter);
v1.use("/inquiries", requireDb, inquiriesRouter);
v1.use("/notifications", requireDb, notificationsRouter);
v1.use("/cpmis", requireDb, cpmisRouter);
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
  console.error(`[${req.requestId ?? "no-request-id"}]`, error);
  if (res.headersSent) return;
  if (error?.type === "entity.parse.failed" || error instanceof SyntaxError) {
    return res.status(400).json({
      ok: false,
      error: "invalid-json",
      message: "The request body could not be parsed as valid JSON.",
      requestId: req.requestId,
      apiVersion: config.apiVersion,
    });
  }
  res.status(500).json({
    ok: false,
    error: "server_error",
    message: "An unexpected server error occurred.",
    requestId: req.requestId,
    apiVersion: config.apiVersion,
  });
});

const server = app.listen(config.port, () => {
  console.log(`Vertexa API  http://localhost:${config.port}`);
  console.log(`Health        http://localhost:${config.port}/api/v1/health`);
});

connectDb()
  .then(async () => {
    const { PORTAL_KEYS, portalDatabaseName } = await import("@/lib/server/mongo.ts");
    console.log(`MongoDB       ${config.mongoDb} @ ${config.mongoUri}`);
    for (const portal of PORTAL_KEYS) {
      console.log(`CPMIS DB      ${portalDatabaseName(portal)} (${portal})`);
    }
  })
  .catch(() => {
    console.warn("\n" + mongoStartupHelp + "\n");
    console.warn("API is up; routes return 503 until MongoDB is available.\n");
  });

async function shutdown() {
  server.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);