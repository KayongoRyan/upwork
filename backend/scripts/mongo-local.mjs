/**
 * Local MongoDB for Compass + backend on mongodb://127.0.0.1:27017
 * Uses mongodb-memory-server (downloads mongod once to cache).
 * Data dir: <repo>/.mongo-data
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const dbPath = path.join(repoRoot, ".mongo-data");
const port = Number(process.env.MONGO_PORT ?? 27017);

fs.mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: {
    port,
    dbPath,
    ip: "127.0.0.1",
    storageEngine: "wiredTiger",
  },
});

const uri = server.getUri();
console.log(`MongoDB listening on ${uri}`);
console.log(`Compass URI: mongodb://127.0.0.1:${port}/`);
console.log(`Data: ${dbPath}`);
console.log("Press Ctrl+C to stop.");

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await new Promise(() => {});