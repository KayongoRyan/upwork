/**
 * Shared MongoDB connection for CPMIS server modules.
 *
 * The portal stores, auth, and other server helpers all use this single client.
 * A missing database keeps the preview running in memory where the caller supports it.
 */

import { MongoClient, type Db } from "mongodb";
import { cpmisPortalIds, type CpmisPortalId } from "@/lib/portals";

export const PORTAL_KEYS = cpmisPortalIds;
export type PortalKey = CpmisPortalId;

const DATABASES: Record<PortalKey, { env: string; fallback: string }> = {
  administrator: { env: "MONGODB_DB_ADMIN", fallback: "vertexa_admin" },
  project_manager: { env: "MONGODB_DB_PM", fallback: "vertexa_pm" },
  site_engineer: { env: "MONGODB_DB_SE", fallback: "vertexa_se" },
  quantity_surveyor: { env: "MONGODB_DB_QS", fallback: "vertexa_qs" },
};

const DEFAULT_MONGO_URI = "mongodb://127.0.0.1:27017";
const CONNECT_TIMEOUT_MS = 3_000;
const RETRY_AFTER_MS = 15_000;

export interface MongoRuntime {
  client: MongoClient;
  dbs: Record<PortalKey, Db>;
}

interface MongoGlobal {
  __cpmisMongoRuntime?: MongoRuntime | null;
  __cpmisMongoConnecting?: Promise<MongoRuntime | null>;
  __cpmisMongoRetryAt?: number;
  __cpmisMongoWarned?: boolean;
}

const store = globalThis as typeof globalThis & MongoGlobal;

export function mongoUri(): string {
  return process.env.MONGODB_URI?.trim() || DEFAULT_MONGO_URI;
}

export function portalDatabaseName(portal: PortalKey): string {
  const spec = DATABASES[portal];
  return process.env[spec.env]?.trim() || spec.fallback;
}

async function openRuntime(): Promise<MongoRuntime | null> {
  const client = new MongoClient(mongoUri(), {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    appName: "cpmis-server",
  });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    return {
      client,
      dbs: {
        administrator: client.db(portalDatabaseName("administrator")),
        project_manager: client.db(portalDatabaseName("project_manager")),
        site_engineer: client.db(portalDatabaseName("site_engineer")),
        quantity_surveyor: client.db(portalDatabaseName("quantity_surveyor")),
      },
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    if (!store.__cpmisMongoWarned) {
      store.__cpmisMongoWarned = true;
      console.warn(
        `[mongo] MongoDB is not reachable at ${mongoUri()}. ` +
          "The preview will use in-memory state until a database is available.\n" +
          `[mongo] ${(error as Error).message}`,
      );
    }
    return null;
  }
}

export async function getMongoRuntime(): Promise<MongoRuntime | null> {
  if (store.__cpmisMongoRuntime) return store.__cpmisMongoRuntime;
  if (store.__cpmisMongoRetryAt && Date.now() < store.__cpmisMongoRetryAt) return null;
  if (!store.__cpmisMongoConnecting) {
    store.__cpmisMongoConnecting = openRuntime().finally(() => {
      store.__cpmisMongoConnecting = undefined;
    });
  }
  const runtime = await store.__cpmisMongoConnecting;
  store.__cpmisMongoRuntime = runtime;
  if (runtime) {
    store.__cpmisMongoWarned = false;
    store.__cpmisMongoRetryAt = 0;
  } else {
    store.__cpmisMongoRetryAt = Date.now() + RETRY_AFTER_MS;
  }
  return runtime;
}

export function mongoAvailable(): boolean {
  return Boolean(store.__cpmisMongoRuntime);
}
