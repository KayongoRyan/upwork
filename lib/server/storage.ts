import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getMongoRuntime, requireCollectionInProduction } from "@/lib/server/mongo";

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

export interface FileMetadataRecord {
  _id: string;
  key: string;
  fileName: string;
  contentType: string;
  size: number;
  sha256: string;
  storageDriver: StorageDriver;
  uploadedBy: string;
  uploadedAt: string;
  projectId?: string;
  documentId?: string;
  revisionId?: string;
  source: "document" | "report_photo" | "other";
}

export interface SaveFileMetadataInput {
  key: string;
  fileName: string;
  contentType: string;
  size: number;
  body: Buffer;
  uploadedBy: string;
  projectId?: string;
  documentId?: string;
  revisionId?: string;
  source: FileMetadataRecord["source"];
}

export async function saveFileMetadata(input: SaveFileMetadataInput): Promise<FileMetadataRecord | null> {
  const runtime = await getMongoRuntime();
  const collection = requireCollectionInProduction(
    runtime?.dbs.administrator.collection<FileMetadataRecord>("files") ?? null,
  );
  if (!collection) return null;

  const record: FileMetadataRecord = {
    _id: input.key,
    key: input.key,
    fileName: input.fileName,
    contentType: input.contentType || "application/octet-stream",
    size: input.size,
    sha256: createHash("sha256").update(input.body).digest("hex"),
    storageDriver: storageDriver(),
    uploadedBy: input.uploadedBy,
    uploadedAt: new Date().toISOString(),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.documentId ? { documentId: input.documentId } : {}),
    ...(input.revisionId ? { revisionId: input.revisionId } : {}),
    source: input.source,
  };

  await collection.updateOne({ _id: record._id }, { $set: record }, { upsert: true });
  return record;
}

export function storageKeyForDocument(projectId: string, documentId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
  return `documents/${assertKey(projectId)}/${assertKey(documentId)}/${Date.now()}-${safeName}`;
}
