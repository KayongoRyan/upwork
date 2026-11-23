import crypto from "node:crypto";
import { config } from "../config.js";

function timingSafeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function verifyInternalServiceKey(provided) {
  const expected = config.internalService.key;
  if (!expected) return false;
  if (!provided) return false;
  return timingSafeEqual(expected, provided);
}

export class InternalServiceError extends Error {
  constructor(message, { status = 502, code = "internal-service-error", details = null, cause = null } = {}) {
    super(message);
    this.name = "InternalServiceError";
    this.status = status;
    this.code = code;
    this.details = details;
    if (cause) this.cause = cause;
  }
}

async function request(path, { method = "GET", body, headers = {}, timeoutMs } = {}) {
  const base = config.internalService.url;
  const key = config.internalService.key;
  if (!base) throw new InternalServiceError("Internal service URL is not configured", { status: 503, code: "internal-service-not-configured" });
  if (!key) throw new InternalServiceError("Internal service key is not configured", { status: 503, code: "internal-service-not-configured" });

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? config.internalService.timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        "x-internal-service-key": key,
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }

    if (!res.ok) {
      throw new InternalServiceError(
        data?.detail?.message || data?.message || data?.error || `Internal service request failed (${res.status})`,
        { status: res.status >= 400 && res.status < 500 ? res.status : 502, code: data?.detail?.error || data?.error || "internal-service-request-failed", details: data },
      );
    }
    return data;
  } catch (error) {
    if (error instanceof InternalServiceError) throw error;
    if (error?.name === "AbortError") {
      throw new InternalServiceError("Internal service request timed out", { status: 504, code: "internal-service-timeout", cause: error });
    }
    throw new InternalServiceError("Internal service request failed", { status: 502, code: "internal-service-unavailable", cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

export const internalService = {
  health: () => request("/health"),
  ready: () => request("/ready"),
  status: () => request("/coordination/status"),
  listWorkers: () => request("/workers"),
  registerWorker: (body) => request("/workers/register", { method: "POST", body }),
  heartbeatWorker: (workerId, body = {}) => request(`/workers/${encodeURIComponent(workerId)}/heartbeat`, { method: "POST", body }),
  deregisterWorker: (workerId) => request(`/workers/${encodeURIComponent(workerId)}/deregister`, { method: "POST" }),
  acquireLock: (name, body) => request(`/coordination/locks/${encodeURIComponent(name)}/acquire`, { method: "POST", body }),
  releaseLock: (name, body) => request(`/coordination/locks/${encodeURIComponent(name)}/release`, { method: "POST", body }),
  createJob: (body) => request("/jobs", { method: "POST", body }),
  listJobs: (query = "") => request(`/jobs${query ? `?${query}` : ""}`),
  getJob: (jobId) => request(`/jobs/${encodeURIComponent(jobId)}`),
  claimJob: (jobId, body) => request(`/jobs/${encodeURIComponent(jobId)}/claim`, { method: "POST", body }),
  claimNextJob: (body) => request("/jobs/claim-next", { method: "POST", body }),
  heartbeatJob: (jobId, body) => request(`/jobs/${encodeURIComponent(jobId)}/heartbeat`, { method: "POST", body }),
  completeJob: (jobId, body) => request(`/jobs/${encodeURIComponent(jobId)}/complete`, { method: "POST", body }),
  failJob: (jobId, body) => request(`/jobs/${encodeURIComponent(jobId)}/fail`, { method: "POST", body }),
  cancelJob: (jobId, body = {}) => request(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", body }),
  retryJob: (jobId, body = {}) => request(`/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST", body }),
};
