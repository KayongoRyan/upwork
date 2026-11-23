import crypto from "node:crypto";
import type { Request, Response } from "express";
import { getMongoRuntime, requireCollectionInProduction } from "@/lib/server/mongo";
import { apiError } from "./api-response";

type IdempotencyRecord = {
  _id: string;
  scope: string;
  key: string;
  requestHash: string;
  status: "in-progress" | "completed";
  statusCode?: number;
  body?: unknown;
  createdAt: string;
  updatedAt: string;
  expiresAt: Date;
};

type IdempotentResult = { status: number; body: unknown };

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const memory = new Map<string, IdempotencyRecord>();
let indexReady: Promise<void> | null = null;

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function hashRequest(body: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(body)).digest("hex");
}

function getHeaderKey(req: Request): string | null {
  const raw = req.get("idempotency-key") ?? req.get("x-idempotency-key");
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  if (!key) return null;
  return key.slice(0, 200);
}

async function collection() {
  const runtime = await getMongoRuntime();
  const col = runtime?.dbs.administrator.collection<IdempotencyRecord>("idempotency_keys") ?? null;
  return requireCollectionInProduction(col);
}

async function ensureIndexes() {
  if (indexReady) return indexReady;
  indexReady = (async () => {
    const col = await collection();
    if (!col) return;
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => undefined);
    await col.createIndex({ scope: 1, key: 1 }, { unique: true }).catch(() => undefined);
  })();
  return indexReady;
}

function memGet(id: string): IdempotencyRecord | null {
  const rec = memory.get(id);
  if (!rec) return null;
  if (rec.expiresAt.getTime() <= Date.now()) { memory.delete(id); return null; }
  return rec;
}

export async function withIdempotency(
  req: Request,
  res: Response,
  scope: string,
  requestBody: unknown,
  run: () => Promise<IdempotentResult>,
): Promise<Response | void> {
  const key = getHeaderKey(req);
  if (!key) {
    const result = await run();
    return res.status(result.status).json(result.body);
  }

  await ensureIndexes();
  const id = `${scope}:${key}`;
  const requestHash = hashRequest(requestBody);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
  const col = await collection();

  if (col) {
    const existing = await col.findOne({ _id: id });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return apiError(res, 409, "idempotency-key-reused", { message: "Idempotency key was already used with a different request.", requestId: req.requestId });
      }
      if (existing.status === "completed") {
        res.setHeader("idempotency-replayed", "true");
        return res.status(existing.statusCode ?? 200).json(existing.body);
      }
      return apiError(res, 409, "idempotency-in-progress", { message: "A request with this idempotency key is already in progress.", requestId: req.requestId });
    }
    try {
      await col.insertOne({ _id: id, scope, key, requestHash, status: "in-progress", createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt });
    } catch (error: any) {
      if (error?.code === 11000) {
        const raced = await col.findOne({ _id: id });
        if (raced?.requestHash !== requestHash) return apiError(res, 409, "idempotency-key-reused", { message: "Idempotency key was already used with a different request.", requestId: req.requestId });
        if (raced?.status === "completed") { res.setHeader("idempotency-replayed", "true"); return res.status(raced.statusCode ?? 200).json(raced.body); }
        return apiError(res, 409, "idempotency-in-progress", { message: "A request with this idempotency key is already in progress.", requestId: req.requestId });
      }
      throw error;
    }
  } else {
    const existing = memGet(id);
    if (existing) {
      if (existing.requestHash !== requestHash) return apiError(res, 409, "idempotency-key-reused", { message: "Idempotency key was already used with a different request.", requestId: req.requestId });
      if (existing.status === "completed") { res.setHeader("idempotency-replayed", "true"); return res.status(existing.statusCode ?? 200).json(existing.body); }
      return apiError(res, 409, "idempotency-in-progress", { message: "A request with this idempotency key is already in progress.", requestId: req.requestId });
    }
    memory.set(id, { _id: id, scope, key, requestHash, status: "in-progress", createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt });
  }

  try {
    const result = await run();
    if (result.status >= 500) {
      // Server-side failures should be retryable with the same idempotency key.
      if (col) await col.deleteOne({ _id: id, status: "in-progress" }).catch(() => undefined);
      else { const rec = memory.get(id); if (rec?.status === "in-progress") memory.delete(id); }
      return res.status(result.status).json(result.body);
    }
    const completed: Partial<IdempotencyRecord> = { status: "completed", statusCode: result.status, body: result.body, updatedAt: new Date().toISOString() };
    if (col) await col.updateOne({ _id: id }, { $set: completed });
    else Object.assign(memory.get(id) ?? {}, completed);
    return res.status(result.status).json(result.body);
  } catch (error) {
    // Allow retry after a failed attempt by removing the in-progress marker.
    if (col) await col.deleteOne({ _id: id, status: "in-progress" }).catch(() => undefined);
    else { const rec = memory.get(id); if (rec?.status === "in-progress") memory.delete(id); }
    throw error;
  }
}
