import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Load backend/.env first, then repo-root .env, then process env wins.
dotenv.config({ path: path.resolve(here, "../.env") });
dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";

function parseBool(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const v = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseCsv(value, fallback = []) {
  const raw = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return raw.length > 0 ? raw : fallback;
}

const corsOrigins = parseCsv(
  process.env.CORS_ORIGINS,
  isProduction ? [] : ["http://localhost:3030", "http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003"],
);

const apiKey = process.env.VERTEXA_API_KEY?.trim() || process.env.API_KEY?.trim() || (isProduction ? "" : "dev-vertexa-api-key");
const internalServiceKey = process.env.INTERNAL_SERVICE_KEY?.trim() || (isProduction ? "" : "dev-internal-service-key");

export const config = {
  nodeEnv,
  isProduction,
  port: parseNumber(process.env.PORT, 4000),
  trustProxy: parseBool(process.env.TRUST_PROXY, isProduction),
  apiVersion: "v1",
  apiBasePath: "/api/v1",
  mongoUri: process.env.MONGODB_URI?.trim() || "mongodb://127.0.0.1:27017",
  mongoDb: process.env.MONGODB_DB?.trim() || "vertexa_cpmis",
  corsOrigins,
  /** Shared secret for admin routes. BFF sends it as X-API-Key or Bearer token. */
  apiKey,
  internalService: {
    url: (process.env.INTERNAL_SERVICE_URL?.trim() || "http://127.0.0.1:4010").replace(/\/+$/, ""),
    key: internalServiceKey,
    timeoutMs: parseNumber(process.env.INTERNAL_SERVICE_TIMEOUT_MS, 10_000),
  },
  /** Supabase Auth email OTP delivery for portal signup. */
  supabase: {
    url: (process.env.SUPABASE_URL?.trim() || "").replace(/\/+$/, "").replace(/\/rest\/v1$/i, ""),
    key: process.env.SUPABASE_ANON_KEY?.trim() || process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "",
    timeoutMs: parseNumber(process.env.SUPABASE_EMAIL_OTP_TIMEOUT_MS, 10_000),
  },
  /** Public inquiry creation (POST /api/v1/inquiries). */
  inquiryRateLimit: {
    windowMs: parseNumber(process.env.INQUIRY_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
    max: parseNumber(process.env.INQUIRY_RATE_LIMIT_MAX, 20),
  },
};

export function validateProductionConfig() {
  if (!isProduction) return [];
  const missing = [];
  if (!config.mongoUri) missing.push("MONGODB_URI");
  if (!config.apiKey) missing.push("VERTEXA_API_KEY or API_KEY");
  if (config.corsOrigins.length === 0) missing.push("CORS_ORIGINS");
  if (config.corsOrigins.some((o) => /localhost|127\.0\.0\.1/i.test(o))) missing.push("CORS_ORIGINS (must not include localhost in production)");
  if (parseBool(process.env.OTP_DEMO_FALLBACK, false)) missing.push("OTP_DEMO_FALLBACK must be false in production");
  if (!config.supabase.url || !config.supabase.key) {
    missing.push("SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY)");
  }
  if (!config.internalService.key) missing.push("INTERNAL_SERVICE_KEY");
  return missing;
}

export function assertProductionConfig() {
  const problems = validateProductionConfig();
  if (problems.length > 0) {
    const message = `Invalid production configuration: ${problems.join("; ")}`;
    throw new Error(message);
  }
}
