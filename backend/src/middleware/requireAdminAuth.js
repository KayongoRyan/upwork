import { config } from "../config.js";

function readApiKey(req) {
  const header = req.get("x-api-key");
  if (typeof header === "string" && header.trim()) return header.trim();
  const auth = req.get("authorization");
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

/**
 * Protects administrative routes. The Next.js BFF passes the shared key; the
 * public inquiry-create endpoint stays open (and rate-limited separately).
 */
export function requireAdminAuth(req, res, next) {
  if (!config.apiKey) {
    return res.status(503).json({
      ok: false,
      error: "admin_auth_not_configured",
      message: "Set VERTEXA_API_KEY on the API server to enable admin routes.",
      requestId: req.requestId,
    });
  }

  const provided = readApiKey(req);
  if (!provided || provided !== config.apiKey) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      requestId: req.requestId,
    });
  }

  next();
}
