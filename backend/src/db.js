import { MongoClient } from "mongodb";
import { config } from "./config.js";
import { getMongoRuntime, mongoUri, resetMongoRuntime } from "@/lib/server/mongo.ts";

/** @type {MongoClient | null} */
let client = null;

/** @type {import("mongodb").Db | null} */
let db = null;

/** @type {Promise<import("mongodb").Db> | null} */
let connecting = null;

export const mongoStartupHelp = `MongoDB is not running at ${config.mongoUri}
  • Dev (Compass): from repo root run \`npm run mongo:local\`, then Compass → mongodb://127.0.0.1:27017/
  • Local service: install MongoDB Community Server and start the MongoDB service
  • Atlas: set MONGODB_URI in backend/.env to your mongodb+srv://… string
  • Docker: docker run -d -p 27017:27017 --name mongo mongo:7`;

export async function connectDb() {
  if (db) return db;
  if (connecting) return connecting;

  connecting = (async () => {
    client = new MongoClient(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    db = client.db(config.mongoDb);
    await ensureIndexes(db);
    return db;
  })();

  try {
    return await connecting;
  } catch (error) {
    connecting = null;
    client = null;
    db = null;
    throw error;
  }
}

export async function ensureCpmisDbs() {
  const runtime = await getMongoRuntime();
  if (!runtime && process.env.NODE_ENV === "production") {
    throw new Error(`CPMIS MongoDB runtime unavailable at ${mongoUri()}`);
  }
  return runtime;
}

export async function ensureDb() {
  const [database] = await Promise.all([connectDb(), ensureCpmisDbs()]);
  return database;
}

export function getDb() {
  if (!db) {
    throw new Error("MongoDB is not connected. Call ensureDb() first.");
  }
  return db;
}

export async function closeDb() {
  await resetMongoRuntime().catch(() => undefined);
  if (client) {
    await client.close();
    client = null;
    db = null;
    connecting = null;
  }
}

/**
 * @param {import("mongodb").Db} database
 */
async function ensureIndexes(database) {
  await database.collection("inquiries").createIndexes([
    { key: { createdAt: -1 } },
    { key: { status: 1, createdAt: -1 } },
    { key: { recipientId: 1, createdAt: -1 } },
  ]);
  await database.collection("notifications").createIndexes([
    { key: { recipientId: 1, read: 1, createdAt: -1 } },
    { key: { audience: 1, read: 1, createdAt: -1 } },
    { key: { inquiryId: 1 } },
  ]);
}