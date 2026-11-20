/**
 * Adapter between the public site's inquiry route and the Express API in `backend/`.
 *
 * The browser posts multipart form data to `/api/vertexa/inquiries`, which validates
 * the submission and then forwards it here as JSON. The Express service is the single
 * source of truth: it stores the inquiry in MongoDB and creates the administrator +
 * project-manager inbox notifications. This app only translates the result back into
 * the redirect contract the forms already understand (`?saved=1` / `?error=<code>`).
 */

const DEFAULT_DEV_API_URL = "http://localhost:4000";
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
