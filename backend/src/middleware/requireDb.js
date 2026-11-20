import { ensureDb, mongoStartupHelp } from "../db.js";

export async function requireDb(_req, res, next) {
  try {
    await ensureDb();
    next();
  } catch {
    res.status(503).json({
      error: "mongodb_unavailable",
      message: "Database is not reachable. See the API server log for setup steps.",
      hint: mongoStartupHelp.split("\n")[0],
    });
  }
}