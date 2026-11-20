import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });
dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017",
  mongoDb: process.env.MONGODB_DB ?? "vertexa_cpmis",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3030,http://localhost:3000")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
};