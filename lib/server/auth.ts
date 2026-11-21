import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getMongoRuntime, type PortalKey } from "@/lib/server/mongo";
import { readState } from "@/lib/server/portal-store";
import type { SessionUser, UserAccount, UserRole } from "@/types";

export type { SessionUser };

export const SESSION_COOKIE: Record<PortalKey, string> = {
  administrator: "cpmis_session_admin",
  project_manager: "cpmis_session_pm",
  site_engineer: "cpmis_session_se",
  quantity_surveyor: "cpmis_session_qs",
};

export const PORTAL_ROLE: Record<PortalKey, UserRole> = {
  administrator: "administrator",
  project_manager: "project_manager",
  site_engineer: "site_engineer",
  quantity_surveyor: "quantity_surveyor",
};

export const PORTAL_HOME: Record<PortalKey, string> = {
  administrator: "/admin",
  project_manager: "/pm",
  site_engineer: "/se",
  quantity_surveyor: "/qs",
};

// SessionUser is defined in @/types for client/server sharing.

interface SessionRecord {
  _id: string;
  tokenHash: string;
  userId: string;
  role: UserRole;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

interface CredentialRecord {
  _id: string;
  userId: string;
  email: string;
  passwordHash: string;
  updatedAt: string;
}

interface AuthMemory {
  credentials: Map<string, CredentialRecord>;
  sessions: Record<PortalKey, Map<string, SessionRecord>>;
  seeded: boolean;
  seedPromise?: Promise<void>;
}

interface AuthGlobal {
  __cpmisAuth?: AuthMemory;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const SCRYPT_KEYLEN = 64;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function memory(): AuthMemory {
  const g = globalThis as typeof globalThis & AuthGlobal;
  g.__cpmisAuth ??= {
    credentials: new Map(),
    sessions: {
      administrator: new Map(),
      project_manager: new Map(),
      site_engineer: new Map(),
      quantity_surveyor: new Map(),
    },
    seeded: false,
  };
  return g.__cpmisAuth;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function timingSafeEqualHex(a: string, b: string) {
  const aa = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = parts[2];
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return timingSafeEqualHex(derived.toString("hex"), expected);
}

export function roleDemoPassword(role: UserRole): string {
  const env: Record<UserRole, string | undefined> = {
    administrator: process.env.DEMO_PASSWORD_ADMIN,
    project_manager: process.env.DEMO_PASSWORD_PM,
    site_engineer: process.env.DEMO_PASSWORD_SE,
    quantity_surveyor: process.env.DEMO_PASSWORD_QS,
  };
  const fallback: Record<UserRole, string> = {
    administrator: "AdminDemo2026!",
    project_manager: "PmDemo2026!",
    site_engineer: "SeDemo2026!",
    quantity_surveyor: "QsDemo2026!",
  };
  const value = env[role]?.trim();
  return value || fallback[role];
}

function sessionUser(user: UserAccount): SessionUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    projectId: user.projectId ?? null,
  };
}

async function credentialsCollection() {
  const runtime = await getMongoRuntime();
  return runtime?.dbs.administrator.collection<CredentialRecord>("credentials") ?? null;
}

async function sessionsCollection(portal: PortalKey) {
  const runtime = await getMongoRuntime();
  return runtime?.dbs[portal].collection<SessionRecord>("sessions") ?? null;
}

export async function ensureCredentialsSeeded(): Promise<void> {
  const mem = memory();
  if (mem.seeded) return;
  if (mem.seedPromise) return mem.seedPromise;
  mem.seedPromise = (async () => {
    const state = await readState();
    const collection = await credentialsCollection();
    const existing = new Set<string>();

    if (collection) {
      const docs = await collection.find({}, { projection: { userId: 1 } }).toArray();
      for (const doc of docs) existing.add(doc.userId);
    } else {
      for (const key of mem.credentials.keys()) existing.add(key);
    }

    const missing = state.users.filter((user) => !existing.has(user.id));
    if (missing.length > 0) {
      const records: CredentialRecord[] = [];
      for (const user of missing) {
        records.push({
          _id: `cred-${user.id}`,
          userId: user.id,
          email: normalizeEmail(user.email),
          passwordHash: await hashPassword(roleDemoPassword(user.role)),
          updatedAt: new Date().toISOString(),
        });
      }
      if (collection) {
        // Upsert individually to be idempotent across races.
        for (const record of records) {
          await collection.updateOne(
            { _id: record._id },
            { $setOnInsert: record },
            { upsert: true },
          );
        }
      } else {
        for (const record of records) {
          if (!mem.credentials.has(record.userId)) mem.credentials.set(record.userId, record);
        }
      }
    }

    // Keep emails in sync with users (email changes).
    if (collection) {
      for (const user of state.users) {
        await collection.updateOne({ userId: user.id }, { $set: { email: normalizeEmail(user.email) } });
      }
    } else {
      for (const user of state.users) {
        const rec = mem.credentials.get(user.id);
        if (rec) rec.email = normalizeEmail(user.email);
      }
    }

    mem.seeded = true;
  })().finally(() => {
    mem.seedPromise = undefined;
  });
  return mem.seedPromise;
}

export async function setUserPassword(userId: string, email: string, password: string): Promise<void> {
  await setUserPasswordHash(userId, email, await hashPassword(password));
}

export async function setUserPasswordHash(userId: string, email: string, passwordHash: string): Promise<void> {
  await ensureCredentialsSeeded();
  const record: CredentialRecord = {
    _id: `cred-${userId}`,
    userId,
    email: normalizeEmail(email),
    passwordHash,
    updatedAt: new Date().toISOString(),
  };
  const collection = await credentialsCollection();
  if (collection) {
    await collection.replaceOne({ _id: record._id }, record, { upsert: true });
  } else {
    memory().credentials.set(userId, record);
  }
}

export async function removeUserCredential(userId: string): Promise<void> {
  const collection = await credentialsCollection();
  if (collection) {
    await collection.deleteOne({ userId });
  } else {
    memory().credentials.delete(userId);
  }
}

async function findCredentialByEmail(email: string): Promise<CredentialRecord | null> {
  await ensureCredentialsSeeded();
  const normalized = normalizeEmail(email);
  const collection = await credentialsCollection();
  if (collection) {
    return (await collection.findOne({ email: normalized })) ?? null;
  }
  for (const record of memory().credentials.values()) {
    if (record.email === normalized) return record;
  }
  return null;
}

export function checkLoginRateLimit(key: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now > current.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { ok: true };
  }
  if (current.count >= LOGIN_MAX_ATTEMPTS) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { ok: true };
}

export function resetLoginRateLimit(key: string) {
  loginAttempts.delete(key);
}

export async function signInWithPassword(
  portal: PortalKey,
  email: string,
  password: string,
): Promise<{ ok: true; user: SessionUser; token: string } | { ok: false; error: string; status: number }> {
  await ensureCredentialsSeeded();
  const credential = await findCredentialByEmail(email);
  if (!credential) {
    return { ok: false, error: "Invalid email or password.", status: 401 };
  }
  const valid = await verifyPassword(password, credential.passwordHash);
  if (!valid) {
    return { ok: false, error: "Invalid email or password.", status: 401 };
  }

  const state = await readState();
  const user = state.users.find((item) => item.id === credential.userId);
  if (!user) {
    return { ok: false, error: "Invalid email or password.", status: 401 };
  }
  if (user.status !== "active") {
    return { ok: false, error: "This account is inactive.", status: 403 };
  }
  if (user.role !== PORTAL_ROLE[portal]) {
    return { ok: false, error: "This account does not have access to this portal.", status: 403 };
  }

  const token = await createSessionForUser(portal, user);
  return { ok: true, user: sessionUser(user), token };
}

export async function createSessionForUser(portal: PortalKey, user: UserAccount): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const record: SessionRecord = {
    _id: `sess-${crypto.randomUUID()}`,
    tokenHash: hashToken(token),
    userId: user.id,
    role: user.role,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  };
  const collection = await sessionsCollection(portal);
  if (collection) {
    await collection.insertOne(record);
  } else {
    memory().sessions[portal].set(record.tokenHash, record);
  }
  return token;
}

export async function getSessionUser(portal: PortalKey): Promise<SessionUser | null> {
  await ensureCredentialsSeeded();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE[portal])?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);

  const collection = await sessionsCollection(portal);
  let record: SessionRecord | null = null;
  if (collection) {
    record = (await collection.findOne({ tokenHash })) ?? null;
  } else {
    record = memory().sessions[portal].get(tokenHash) ?? null;
  }

  if (!record) return null;
  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    await destroySessionByHash(portal, tokenHash);
    return null;
  }

  const state = await readState();
  const user = state.users.find((item) => item.id === record.userId);
  if (!user || user.status !== "active" || user.role !== PORTAL_ROLE[portal]) {
    await destroySessionByHash(portal, tokenHash);
    return null;
  }

  // Refresh lastSeenAt occasionally; avoid write on every request.
  const lastSeen = new Date(record.lastSeenAt).getTime();
  if (Date.now() - lastSeen > 5 * 60 * 1000) {
    const nextSeen = new Date().toISOString();
    if (collection) {
      await collection.updateOne({ tokenHash }, { $set: { lastSeenAt: nextSeen } });
    } else {
      record.lastSeenAt = nextSeen;
    }
  }

  return sessionUser(user);
}

async function destroySessionByHash(portal: PortalKey, tokenHash: string) {
  const collection = await sessionsCollection(portal);
  if (collection) {
    await collection.deleteOne({ tokenHash });
  } else {
    memory().sessions[portal].delete(tokenHash);
  }
}

export async function signOut(portal: PortalKey): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE[portal])?.value;
  if (token) {
    await destroySessionByHash(portal, hashToken(token));
  }
  cookieStore.delete(SESSION_COOKIE[portal]);
}

export async function requirePortalSession(portal: PortalKey): Promise<SessionUser> {
  const user = await getSessionUser(portal);
  if (!user) redirect(`${PORTAL_HOME[portal]}/login`);
  return user;
}

export function applySessionCookie(response: NextResponse, portal: PortalKey, token: string) {
  response.cookies.set(SESSION_COOKIE[portal], token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(response: NextResponse, portal: PortalKey) {
  response.cookies.set(SESSION_COOKIE[portal], "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

export function portalHome(portal: PortalKey) {
  return PORTAL_HOME[portal];
}

export async function requireApiSession(portal: PortalKey): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser(portal);
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return user;
}

export async function resetDemoAuth(): Promise<void> {
  const mem = memory();
  mem.credentials.clear();
  for (const portal of Object.keys(mem.sessions) as PortalKey[]) mem.sessions[portal].clear();
  mem.seeded = false;
  const collection = await credentialsCollection();
  if (collection) await collection.deleteMany({});
  for (const portal of Object.keys(SESSION_COOKIE) as PortalKey[]) {
    const col = await sessionsCollection(portal);
    if (col) await col.deleteMany({});
  }
  await ensureCredentialsSeeded();
}
