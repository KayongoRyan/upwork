import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });
dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  apiVersion: "v1",
  apiBasePath: "/api/v1",
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  mongoDb: process.env.MONGODB_DB ?? "vertexa_cpmis",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3030,http://localhost:3000")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  /** Shared secret for admin routes. BFF sends it as X-API-Key or Bearer token. */
  apiKey:
    process.env.VERTEXA_API_KEY?.trim() ||
    process.env.API_KEY?.trim() ||
    (isProduction ? "" : "dev-vertexa-api-key"),
  /** Public inquiry creation (POST /api/v1/inquiries). */
  inquiryRateLimit: {
    windowMs: Number(process.env.INQUIRY_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000),
    max: Number(process.env.INQUIRY_RATE_LIMIT_MAX ?? 20),
  },
};