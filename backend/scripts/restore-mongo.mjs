#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
dotenv.config({ path: path.resolve(repoRoot, "backend/.env") });
dotenv.config({ path: path.resolve(repoRoot, ".env") });
dotenv.config();

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return "true";
  return v;
}
function has(name) { return process.argv.includes(`--${name}`); }

const dryRun = has("dry-run");
const drop = has("drop");
const confirm = arg("confirm", "");
const from = arg("from", "");
if (!from) {
  console.error("Missing --from <backup-dir>. Example: node backend/scripts/restore-mongo.mjs --from backups/mongo/2026-01-01T00-00-00-000Z --drop --confirm RESTORE");
  process.exit(2);
}
const backupDir = path.resolve(repoRoot, from);
if (!fs.existsSync(backupDir)) {
  console.error(`Backup directory not found: ${backupDir}`);
  process.exit(2);
}
if (drop && confirm !== "RESTORE" && !dryRun) {
  console.error("Refusing destructive restore. Re-run with --drop --confirm RESTORE (and --from ...). Use --dry-run to preview.");
  process.exit(2);
}

const dbs = [
  process.env.MONGODB_DB_ADMIN?.trim() || "vertexa_admin",
  process.env.MONGODB_DB_PM?.trim() || "vertexa_pm",
  process.env.MONGODB_DB_SE?.trim() || "vertexa_se",
  process.env.MONGODB_DB_QS?.trim() || "vertexa_qs",
  process.env.MONGODB_DB?.trim() || "vertexa_cpmis",
];
const uri = process.env.MONGODB_URI?.trim() || "mongodb://127.0.0.1:27017";

function redactMongoUri(value) {
  try { const u = new URL(value); if (u.username) u.username = "***"; if (u.password) u.password = "***"; return u.toString(); } catch { return "<redacted-mongo-uri>"; }
}

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.map((a) => (a === uri ? redactMongoUri(uri) : a)).join(" ")}`);
  if (dryRun) return { status: 0 };
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${cmd} exited with status ${res.status}`);
  return res;
}

console.log("CPMIS MongoDB restore");
console.log(`URI: ${redactMongoUri(uri)}`);
console.log(`Databases: ${dbs.join(", ")}`);
console.log(`From: ${backupDir}`);
console.log(`Drop: ${drop}`);
if (dryRun) console.log("Mode: dry-run (no changes)");

for (const db of dbs) {
  const dbDir = path.join(backupDir, db);
  if (!fs.existsSync(dbDir)) {
    const msg = `Backup folder missing for ${db}: ${dbDir}`;
    if (dryRun) console.warn(`Warning: ${msg}`);
    else throw new Error(msg);
  }
  const args = ["--uri", uri];
  if (drop) args.push("--drop");
  // Restore only this DB from the dump root; mongodump creates <out>/<db>/...
  args.push("--nsInclude", `${db}.*`, "--dir", backupDir);
  run("mongorestore", args);
}

console.log(dryRun ? "Dry run complete." : "Restore complete. Verify with health checks and restore checklist.");