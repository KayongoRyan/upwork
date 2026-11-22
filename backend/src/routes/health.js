import { Router } from "express";
import { config } from "../config.js";
import { ensureDb, mongoStartupHelp } from "../db.js";

export const healthRouter = Router();

healthRouter.get("/", async (req, res) => {
  try {
    const database = await ensureDb();
    await database.command({ ping: 1 });
    res.json({
      ok: true,
      service: "vertexa-cpmis-api",
      apiVersion: config.apiVersion,
      mongodb: "connected",
      database: config.mongoDb,
      requestId: req.requestId,
    });
  } catch {
    res.status(503).json({
      ok: false,
      error: "mongodb_unavailable",
      service: "vertexa-cpmis-api",
      apiVersion: config.apiVersion,
      mongodb: "disconnected",
      ...(config.isProduction ? {} : { uri: config.mongoUri, help: mongoStartupHelp }),
      requestId: req.requestId,
    });
  }
});