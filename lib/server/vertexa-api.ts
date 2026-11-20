/**
 * Adapter between the public site's inquiry route and the Express API in `backend/`.
 *
 * The browser posts multipart form data to `/api/vertexa/inquiries`, which validates
 * the submission and then forwards it here as JSON. The Express service is the single
 * source of truth: it stores the inquiry in MongoDB and creates the administrator +
 * project-manager inbox notifications. This app only translates the result back into
 * the redirect contract the forms already understand (`?saved=1` / `?error=<code>`).
 * It also reads the notifications the API wrote to MongoDB so the CPMIS inboxes can
 * show public-site inquiries alongside the demo workspace's notices, and exposes the
 * inquiry record to the administrator's ops screen.
 */

import type { AppNotification, InquiryStatus, NotificationType, VertexaInquiry } from "@/types";

const DEFAULT_DEV_API_URL = "http://localhost:4000";
const DEV_API_KEY = "dev-vertexa-api-key";
const REQUEST_TIMEOUT_MS = 8_000;

/** Connection-level failures mean nothing reached the API, so a retry elsewhere is safe. */
const OFFLINE_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

export type VertexaInquiryPayload = {
  scope: string;
  service: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  budget: string | null;
  startDate: string | null;
  message: string;
};

export type VertexaForwardResult =
  /** The API stored the inquiry and queued the notifications. */
  | { status: "created"; id: string }
  /** The API rejected the payload; `error` is one of the shared validation codes. */
  | { status: "rejected"; error: string }
  /** The request may or may not have been processed — never retry without an id. */
  | { status: "unavailable" }
  /** Nothing was listening. Safe to use the local fallback in development. */
  | { status: "offline" };

/**
 * `VERTEXA_API_URL` wins. In development the local API is assumed so `npm run
 * dev:backend` starts persisting without extra configuration; production must be
 * explicit, otherwise the in-memory store is used.
 */
export function vertexaApiBaseUrl(): string | null {
  const configured = process.env.VERTEXA_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production") return DEFAULT_DEV_API_URL;
  return null;
}

/** Development may fall back to the in-memory store when the API is not running. */
export function canUseInMemoryFallback(): boolean {
  return process.env.NODE_ENV !== "production";
}

function adminApiKey(): string {
  const configured = process.env.VERTEXA_API_KEY?.trim() || process.env.API_KEY?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return DEV_API_KEY;
  return "";
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json", ...extra };
  const key = adminApiKey();
  if (key) headers["x-api-key"] = key;
  return headers;
}

function readError(body: unknown, fallback = "unavailable"): string {
  if (!body || typeof body !== "object") return fallback;
  const value = (body as { error?: unknown }).error;
  return typeof value === "string" && value ? value : fallback;
}

function failureStatus(response: Response): number {
  if (response.status === 401 || response.status === 403 || response.status === 429) return response.status;
  return response.status >= 400 && response.status < 500 ? response.status : 502;
}

export async function forwardVertexaInquiry(
  baseUrl: string,
  payload: VertexaInquiryPayload,
): Promise<VertexaForwardResult> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/v1/inquiries`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code && OFFLINE_ERROR_CODES.has(code)) {
      console.warn(`[vertexa] inquiry API unreachable at ${baseUrl} (${code})`);
      return { status: "offline" };
    }

    console.error("[vertexa] inquiry API request failed", error);
    return { status: "unavailable" };
  }

  const body = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; inquiry?: { id?: string } }
    | null;

  if (response.ok && body?.ok === true && typeof body.inquiry?.id === "string") {
    return { status: "created", id: body.inquiry.id };
  }

  if (response.status === 400 && typeof body?.error === "string") {
    return { status: "rejected", error: body.error };
  }

  console.error(
    `[vertexa] inquiry API returned ${response.status}`,
    body ?? "(unreadable body)",
  );
  return { status: "unavailable" };
}

const NOTIFICATION_TYPES = new Set<NotificationType>([
  "project",
  "user",
  "status",
  "delay",
  "system",
]);

/** Backend notice ids: `ntf-${inquiryId}-${audience}`, e.g. `ntf-inq-abc123-pm`. */
const VERTEXA_NOTICE_ID = /^ntf-inq-[a-z0-9]+-(admin|pm)$/;

type ApiNotification = {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  message?: unknown;
  senderName?: unknown;
  recipientId?: unknown;
  audience?: unknown;
  read?: unknown;
  createdAt?: unknown;
  source?: unknown;
};

export function isVertexaNotificationId(id: string): boolean {
  return VERTEXA_NOTICE_ID.test(id);
}

/**
 * Returns an empty list (rather than throwing) when the API is not configured or
 * not reachable: the CPMIS demo workspace must keep working on its own store.
 */
export type VertexaNotificationsResult = {
  items: AppNotification[];
  error?: string;
  status?: number;
};

export async function listVertexaNotifications(): Promise<VertexaNotificationsResult> {
  const base = vertexaApiBaseUrl();
  if (!base) return { items: [], error: "not_configured", status: 503 };

  let response: Response;
  try {
    response = await fetch(`${base}/api/v1/notifications?limit=100`, {
      cache: "no-store",
      headers: adminHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.warn("[vertexa] inbox notifications unavailable", error);
    return { items: [], error: "unavailable", status: 502 };
  }

  const body = (await response.json().catch(() => null)) as
    | { items?: ApiNotification[]; error?: string }
    | null;

  if (!response.ok) {
    console.warn(`[vertexa] inbox notifications returned ${response.status}`, body ?? "");
    return { items: [], error: readError(body), status: failureStatus(response) };
  }

  if (!Array.isArray(body?.items)) return { items: [] };

  const items = body.items.flatMap((item) => {
    if (
      item.source !== "vertexa" ||
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.createdAt !== "string" ||
      Number.isNaN(Date.parse(item.createdAt))
    ) {
      return [];
    }

    const notice: AppNotification = {
      id: item.id,
      title: item.title,
      message: typeof item.message === "string" ? item.message : "",
      type: NOTIFICATION_TYPES.has(item.type as NotificationType)
        ? (item.type as NotificationType)
        : "system",
      source: "vertexa",
      senderName: typeof item.senderName === "string" ? item.senderName : "Vertexa site",
      projectId: null,
      recipientId: typeof item.recipientId === "string" ? item.recipientId : null,
      audience: item.audience === "admin" || item.audience === "pm" ? item.audience : undefined,
      read: item.read === true,
      createdAt: new Date(item.createdAt).toISOString(),
    };
    return [notice];
  });

  return { items };
}

export type VertexaNotificationWriteResult = { ok: boolean; error?: string; status?: number };

export async function markVertexaNotificationRead(
  id: string,
  read: boolean,
): Promise<VertexaNotificationWriteResult> {
  const base = vertexaApiBaseUrl();
  if (!base || !isVertexaNotificationId(id)) {
    return { ok: false, error: "invalid-request", status: 400 };
  }

  try {
    const response = await fetch(`${base}/api/v1/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
      headers: adminHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ read }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      return { ok: false, error: readError(body), status: failureStatus(response) };
    }
    return { ok: true };
  } catch (error) {
    console.warn("[vertexa] could not update notification", id, error);
    return { ok: false, error: "unavailable", status: 502 };
  }
}

/**
 * Used by the administrator's "mark all as read": the backend has no bulk endpoint.
 * Only admin-audience notices are changed; PM notices belong to the manager's inbox.
 */
export async function markAllVertexaNotificationsRead(): Promise<{
  updated: number;
  error?: string;
  status?: number;
}> {
  const listed = await listVertexaNotifications();
  if (listed.error) {
    return { updated: 0, error: listed.error, status: listed.status ?? 502 };
  }

  const targets = listed.items.filter((notice) => notice.audience === "admin" && !notice.read);
  let updated = 0;
  let firstError: { error?: string; status?: number } | null = null;

  for (const notice of targets) {
    const result = await markVertexaNotificationRead(notice.id, true);
    if (result.ok) updated += 1;
    else if (!firstError) firstError = { error: result.error, status: result.status };
  }

  return firstError ? { updated, ...firstError } : { updated };
}

const INQUIRY_ID = /^inq-[a-z0-9]+$/;
const INQUIRY_STATUSES = new Set<InquiryStatus>(["received", "assigned", "closed"]);

type ApiInquiry = Record<string, unknown>;

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseInquiry(value: unknown): VertexaInquiry | null {
  if (!value || typeof value !== "object") return null;
  const item = value as ApiInquiry;
  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    typeof item.email !== "string" ||
    typeof item.createdAt !== "string" ||
    Number.isNaN(Date.parse(item.createdAt))
  ) {
    return null;
  }

  const notes = Array.isArray(item.notes)
    ? item.notes.flatMap((note) => {
        if (!note || typeof note !== "object") return [];
        const entry = note as ApiInquiry;
        if (
          typeof entry.id !== "string" ||
          typeof entry.body !== "string" ||
          typeof entry.createdAt !== "string" ||
          Number.isNaN(Date.parse(entry.createdAt))
        ) {
          return [];
        }
        return [{
          id: entry.id,
          author: text(entry.author, "Administrator"),
          body: entry.body,
          createdAt: new Date(entry.createdAt).toISOString(),
        }];
      })
    : [];

  return {
    id: item.id,
    scope: text(item.scope, "service"),
    serviceId: text(item.serviceId),
    serviceName: text(item.serviceName, "Inquiry"),
    name: item.name,
    email: item.email,
    phone: text(item.phone),
    location: text(item.location),
    budget: typeof item.budget === "string" ? item.budget : null,
    startDate: typeof item.startDate === "string" ? item.startDate : null,
    message: text(item.message),
    recipientId: text(item.recipientId),
    projectId: typeof item.projectId === "string" ? item.projectId : null,
    status: INQUIRY_STATUSES.has(item.status as InquiryStatus) ? (item.status as InquiryStatus) : "received",
    notes,
    createdAt: new Date(item.createdAt).toISOString(),
    updatedAt: typeof item.updatedAt === "string" && !Number.isNaN(Date.parse(item.updatedAt))
      ? new Date(item.updatedAt).toISOString()
      : item.createdAt,
  };
}

export type VertexaInquiriesResult = {
  items: VertexaInquiry[];
  error?: string;
  status?: number;
};

export async function listVertexaInquiries(query?: {
  status?: string;
  search?: string;
}): Promise<VertexaInquiriesResult> {
  const base = vertexaApiBaseUrl();
  if (!base) return { items: [], error: "not_configured", status: 503 };

  const params = new URLSearchParams({ limit: "100" });
  if (query?.status) params.set("status", query.status);
  if (query?.search) params.set("search", query.search);

  try {
    const response = await fetch(`${base}/api/v1/inquiries?${params}`, {
      cache: "no-store",
      headers: adminHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as
      | { items?: unknown[]; error?: string }
      | null;

    if (!response.ok) {
      return { items: [], error: readError(body), status: failureStatus(response) };
    }

    const items = Array.isArray(body?.items)
      ? body.items.flatMap((item) => {
          const inquiry = parseInquiry(item);
          return inquiry ? [inquiry] : [];
        })
      : [];
    return { items };
  } catch (error) {
    console.warn("[vertexa] inquiry list unavailable", error);
    return { items: [], error: "unavailable", status: 502 };
  }
}

export type VertexaInquiryResult = {
  inquiry: VertexaInquiry | null;
  error?: string;
  status?: number;
};

export async function getVertexaInquiry(id: string): Promise<VertexaInquiryResult> {
  const base = vertexaApiBaseUrl();
  if (!base || !INQUIRY_ID.test(id)) {
    return { inquiry: null, error: "invalid-request", status: 400 };
  }

  try {
    const response = await fetch(`${base}/api/v1/inquiries/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: adminHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as
      | { inquiry?: unknown; error?: string }
      | null;

    if (response.status === 404) {
      return { inquiry: null, error: "not_found", status: 404 };
    }
    if (!response.ok) {
      return { inquiry: null, error: readError(body), status: failureStatus(response) };
    }

    return { inquiry: parseInquiry(body?.inquiry) };
  } catch (error) {
    console.warn("[vertexa] inquiry detail unavailable", id, error);
    return { inquiry: null, error: "unavailable", status: 502 };
  }
}

export type InquiryUpdatePatch = {
  status?: InquiryStatus;
  recipientId?: string;
  projectId?: string | null;
  note?: string;
  author?: string;
};

export type InquiryUpdateResult =
  | { ok: true; inquiry: VertexaInquiry }
  | { ok: false; error: string; status: number };

export async function updateVertexaInquiry(id: string, patch: InquiryUpdatePatch): Promise<InquiryUpdateResult> {
  const base = vertexaApiBaseUrl();
  if (!base || !INQUIRY_ID.test(id)) return { ok: false, error: "invalid-request", status: 400 };

  try {
    const response = await fetch(`${base}/api/v1/inquiries/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: adminHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as
      | { ok?: unknown; inquiry?: unknown; error?: unknown }
      | null;

    if (response.ok && body?.ok === true) {
      const inquiry = parseInquiry(body.inquiry);
      return inquiry ? { ok: true, inquiry } : { ok: false, error: "invalid-response", status: 502 };
    }

    const error = typeof body?.error === "string" ? body.error : "unavailable";
    return { ok: false, error, status: failureStatus(response) };
  } catch (error) {
    console.warn("[vertexa] inquiry update failed", id, error);
    return { ok: false, error: "unavailable", status: 502 };
  }
}
