import { Router } from "express";
import { config } from "../config.js";
import { ensureDb, mongoStartupHelp } from "../db.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    const database = await ensureDb();
    await database.command({ ping: 1 });
    res.json({
      ok: true,
      service: "vertexa-cpmis-api",
      mongodb: "connected",
      database: config.mongoDb,
    });
  } catch {
    res.status(503).json({
      ok: false,
      service: "vertexa-cpmis-api",
      mongodb: "disconnected",
      uri: config.mongoUri,
      help: mongoStartupHelp,
    });
  }
});