import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export type StorageDriver = "local";

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
  fileName: string;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  fileName: string;
}

function storageDriver(): StorageDriver {
  const value = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (value === "local") return "local";
  throw new Error(`Unsupported STORAGE_DRIVER: ${value}`);
}

function localRoot(): string {
  const configured = process.env.STORAGE_LOCAL_DIR?.trim();
  return path.resolve(configured || path.join(process.cwd(), "data", "uploads"));
}

function assertKey(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\0")) {
    throw new Error("Invalid storage key.");
  }
  return normalized;
}

function resolveLocalPath(key: string): string {
  const root = localRoot();
  const normalized = assertKey(key);
  const full = path.resolve(root, normalized);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Invalid storage key.");
  }
  return full;
}

async function putLocal(input: PutObjectInput): Promise<StoredObject> {
  const key = assertKey(input.key);
  const full = resolveLocalPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, input.body);
  return {
    key,
    size: input.body.byteLength,
    contentType: input.contentType || "application/octet-stream",
    fileName: input.fileName,
  };
}

async function getLocal(key: string): Promise<{ body: Buffer; size: number } | null> {
  try {
    const full = resolveLocalPath(key);
    const body = await readFile(full);
    return { body, size: body.byteLength };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function statLocal(key: string): Promise<{ size: number } | null> {
  try {
    const full = resolveLocalPath(key);
    const info = await stat(full);
    if (!info.isFile()) return null;
    return { size: info.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function putObject(input: PutObjectInput): Promise<StoredObject> {
  const driver = storageDriver();
  if (driver === "local") return putLocal(input);
  throw new Error(`Unsupported storage driver: ${driver}`);
}

export async function getObject(key: string): Promise<{ body: Buffer; size: number } | null> {
  const driver = storageDriver();
  if (driver === "local") return getLocal(key);
  throw new Error(`Unsupported storage driver: ${driver}`);
}

export async function getObjectStat(key: string): Promise<{ size: number } | null> {
  const driver = storageDriver();
  if (driver === "local") return statLocal(key);
  throw new Error(`Unsupported storage driver: ${driver}`);
}

export function getObjectStream(key: string): Readable | null {
  const driver = storageDriver();
  if (driver !== "local") throw new Error(`Unsupported storage driver: ${driver}`);
  try {
    const full = resolveLocalPath(key);
    return createReadStream(full);
  } catch {
    return null;
  }
}

export function storageKeyForDocument(projectId: string, documentId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
  return `documents/${assertKey(projectId)}/${assertKey(documentId)}/${Date.now()}-${safeName}`;
}
