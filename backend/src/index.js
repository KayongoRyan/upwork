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
    exposedHeaders: ["X-Request-Id", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After"],
  }),
);
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "Vertexa CPMIS API",
    version: "0.1.0",
    docs: "See backend/README.md",
  });
});

app.use("/api/v1/health", healthRouter);
app.use("/api/v1/inquiries", requireDb, inquiriesRouter);
app.use("/api/v1/notifications", requireDb, notificationsRouter);
app.use("/api/v1/cpmis", requireDb, cpmisRouter);
app.use("/api/v1/cpmis", requireDb, cpmisRemainingRouter);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "not_found",
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
      requestId: req.requestId,
    });
  }
  res.status(500).json({
    ok: false,
    error: "server_error",
    requestId: req.requestId,
  });
});

const server = app.listen(config.port, () => {
  console.log(`Vertexa API  http://localhost:${config.port}`);
  console.log(`Health        http://localhost:${config.port}/api/v1/health`);
});

connectDb()
  .then(() => {
    console.log(`MongoDB       ${config.mongoDb} @ ${config.mongoUri}`);
  })
  .catch(() => {
    console.warn("\n" + mongoStartupHelp + "\n");
    console.warn("API is up; inquiry routes return 503 until MongoDB is available.\n");
  });

async function shutdown() {
  server.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);