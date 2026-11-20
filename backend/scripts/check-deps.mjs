import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localModules = path.join(backendDir, "node_modules");
const rootModules = path.join(backendDir, "..", "node_modules");
const mongodbPkg = path.join(rootModules, "mongodb", "package.json");

if (existsSync(localModules)) {
  const localMongo = path.join(localModules, "mongodb", "package.json");
  if (!existsSync(localMongo)) {
    console.warn("Removing incomplete backend/node_modules (use repo root npm install).");
    try {
      rmSync(localModules, { recursive: true, force: true });
    } catch (error) {
      console.error("Delete backend/node_modules manually, then run npm install from the repo root.");
      console.error(error);
      process.exit(1);
    }
  }
}

if (!existsSync(mongodbPkg)) {
  console.error("Missing dependencies. From the repo root run: npm install");
  process.exit(1);
}