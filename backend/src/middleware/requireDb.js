import { config } from "../config.js";
import { ensureDb, mongoStartupHelp } from "../db.js";

export async function requireDb(req, res, next) {
  try {
    await ensureDb();
    next();
  } catch {
    res.status(503).json({
      ok: false,
      error: "mongodb_unavailable",
      message: "Database is not reachable. See the API server log for setup steps.",
      hint: mongoStartupHelp.split("\n")[0],
      requestId: req.requestId,
      apiVersion: config.apiVersion,
    });
  }
}