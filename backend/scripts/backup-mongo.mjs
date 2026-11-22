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
const outBase = path.resolve(repoRoot, arg("out", "backups/mongo"));
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(outBase, ts);

const dbs = [
  process.env.MONGODB_DB_ADMIN?.trim() || "vertexa_admin",
  process.env.MONGODB_DB_PM?.trim() || "vertexa_pm",
  process.env.MONGODB_DB_SE?.trim() || "vertexa_se",
  process.env.MONGODB_DB_QS?.trim() || "vertexa_qs",
  process.env.MONGODB_DB?.trim() || "vertexa_cpmis",
];
const uri = process.env.MONGODB_URI?.trim() || "mongodb://127.0.0.1:27017";

function redactMongoUri(value) {
  try {
    const u = new URL(value);
    if (u.username) u.username = "***";
    if (u.password) u.password = "***";
    return u.toString();
  } catch { return "<redacted-mongo-uri>"; }
}

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.map((a) => (a === uri ? redactMongoUri(uri) : a)).join(" ")}`);
  if (dryRun) return { status: 0 };
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${cmd} exited with status ${res.status}`);
  return res;
}

console.log("CPMIS MongoDB backup");
console.log(`URI: ${redactMongoUri(uri)}`);
console.log(`Databases: ${dbs.join(", ")}`);
console.log(`Output: ${outDir}`);
if (dryRun) console.log("Mode: dry-run (no changes)");

if (!dryRun) fs.mkdirSync(outDir, { recursive: true });

for (const db of dbs) {
  run("mongodump", ["--uri", uri, "--db", db, "--out", outDir]);
}

const manifest = {
  createdAt: new Date().toISOString(),
  uri: redactMongoUri(uri),
  databases: dbs,
  outDir,
  dryRun,
};
const manifestPath = path.join(outDir, "backup-manifest.json");
console.log(`\nManifest: ${manifestPath}`);
if (!dryRun) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(dryRun ? "Dry run complete." : "Backup complete.");