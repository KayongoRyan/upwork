/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type Request, type Response } from "express";
import { apiError } from "../lib/api-response";
import { requireAnySession, requireSession } from "../lib/session";
import { verifyCsrfToken } from "../lib/auth-bridge";
import { readState } from "@/lib/server/portal-store";
import { canAccessProject } from "../lib/rbac";
import { internalService, InternalServiceError } from "../lib/internalServiceClient.js";
import { logger } from "../lib/logger.ts";

export const cpmisJobsRouter = Router();

const ALLOWED_JOB_TYPES = new Set([
  "internal.echo",
  "analytics.predictive",
  "analytics.project",
  "report.monthly-progress",
  "report.project-workbook",
  "boq.parse",
]);

function isAdmin(role: string) { return role === "administrator"; }
function canReadAnalytics(role: string) { return ["administrator", "project_manager", "quantity_surveyor"].includes(role); }

function scopeStateForReports(state: any, auth: any, projectId: string) {
  let scoped = state;
  const role = auth.session.role;
  if (role === "project_manager") {
    const ids = new Set(state.projects.filter((p: any) => p.managerId === auth.session.id).map((p: any) => p.id));
    scoped = filterStateByProjectIds(state, ids);
  } else if (role === "quantity_surveyor") {
    const ids = new Set(state.projects.filter((p: any) => p.id === auth.session.projectId).map((p: any) => p.id));
    scoped = filterStateByProjectIds(state, ids);
  } else if (role !== "administrator") {
    const ids = new Set(state.projects.filter((p: any) => canAccessProject(auth.session, p.id)).map((p: any) => p.id));
    scoped = filterStateByProjectIds(state, ids);
  }
  if (projectId !== "all") {
    const ids = new Set(scoped.projects.filter((p: any) => p.id === projectId).map((p: any) => p.id));
    scoped = filterStateByProjectIds(scoped, ids);
  }
  return scoped;
}

function filterStateByProjectIds(state: any, ids: Set<string>) {
  return {
    ...state,
    projects: state.projects.filter((p: any) => ids.has(p.id)),
    tasks: state.tasks.filter((t: any) => ids.has(t.projectId)),
    boq: (state.boq ?? []).filter((b: any) => ids.has(b.projectId)),
    progressMarks: (state.progressMarks ?? []).filter((m: any) => ids.has(m.projectId)),
    costReports: (state.costReports ?? []).filter((r: any) => ids.has(r.projectId)),
    reports: (state.reports ?? []).filter((r: any) => ids.has(r.projectId)),
    users: state.users, // names for report rendering; scoped by API response, not secret
  };
}

function handleInternalServiceError(res: Response, error: unknown, requestId?: string) {
  if (error instanceof InternalServiceError) {
    const status = error.status >= 400 && error.status < 600 ? error.status : 502;
    return apiError(res, status, error.code, { message: error.message, requestId, extra: error.details ? { details: error.details } : undefined });
  }
  logger.error("jobs.internal_service_error", error, { requestId });
  return apiError(res, 502, "internal-service-unavailable", { requestId });
}



// --- Generic job management (admin) ---

cpmisJobsRouter.post("/", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  if (!isAdmin(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  const type = String(req.body?.type ?? "");
  if (!ALLOWED_JOB_TYPES.has(type)) return apiError(res, 400, "unsupported-job-type", { requestId: req.requestId, extra: { allowedTypes: Array.from(ALLOWED_JOB_TYPES) } });
  const payload = req.body?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return apiError(res, 400, "validation-failed", { message: "payload object is required.", requestId: req.requestId });
  try {
    const result = await internalService.createJob({
      type,
      payload,
      priority: typeof req.body?.priority === "number" ? req.body.priority : undefined,
      maxAttempts: typeof req.body?.maxAttempts === "number" ? req.body.maxAttempts : undefined,
      retryDelaySeconds: typeof req.body?.retryDelaySeconds === "number" ? req.body.retryDelaySeconds : undefined,
      executionTimeoutSeconds: typeof req.body?.executionTimeoutSeconds === "number" ? req.body.executionTimeoutSeconds : undefined,
      idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : undefined,
      runAt: typeof req.body?.runAt === "string" ? req.body.runAt : undefined,
      metadata: { ...(typeof req.body?.metadata === "object" && req.body.metadata ? req.body.metadata : {}), source: "express", requestedBy: auth.session.id, requestId: req.requestId },
    });
    res.setHeader("cache-control", "no-store");
    return res.status(result?.deduped ? 200 : 201).json(result);
  } catch (error) {
    return handleInternalServiceError(res, error, req.requestId);
  }
});

cpmisJobsRouter.get("/", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  if (!isAdmin(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  try {
    const qs = new URLSearchParams();
    if (typeof req.query.status === "string") qs.set("status", req.query.status);
    if (typeof req.query.type === "string") qs.set("type", req.query.type);
    if (typeof req.query.limit === "string") qs.set("limit", req.query.limit);
    const result = await internalService.listJobs(qs.toString());
    res.setHeader("cache-control", "no-store");
    return res.json(result);
  } catch (error) {
    return handleInternalServiceError(res, error, req.requestId);
  }
});

cpmisJobsRouter.get("/:jobId", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  try {
    const result = await internalService.getJob(String(req.params.jobId));
    const requestedBy = result?.job?.metadata?.requestedBy;
    if (!isAdmin(auth.session.role) && requestedBy !== auth.session.id) {
      return apiError(res, 403, "forbidden", { requestId: req.requestId });
    }
    res.setHeader("cache-control", "no-store");
    return res.json(result);
  } catch (error) {
    return handleInternalServiceError(res, error, req.requestId);
  }
});

cpmisJobsRouter.post("/:jobId/cancel", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  if (!isAdmin(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  try {
    const result = await internalService.cancelJob(String(req.params.jobId), { reason: typeof req.body?.reason === "string" ? req.body.reason : "cancelled-by-admin" });
    res.setHeader("cache-control", "no-store");
    return res.json(result);
  } catch (error) {
    return handleInternalServiceError(res, error, req.requestId);
  }
});

cpmisJobsRouter.post("/:jobId/retry", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  if (!isAdmin(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  try {
    const result = await internalService.retryJob(String(req.params.jobId), {});
    res.setHeader("cache-control", "no-store");
    return res.json(result);
  } catch (error) {
    return handleInternalServiceError(res, error, req.requestId);
  }
});

// --- Business workflow job creation ---

cpmisJobsRouter.post("/reports/analytics", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  if (!canReadAnalytics(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  const projectId = String(req.body?.projectId ?? req.body?.project ?? req.query.projectId ?? req.query.project ?? "all");
  const state = await readState();
  const scoped = scopeStateForReports(state, auth, projectId);
  if (projectId !== "all" && scoped.projects.length === 0) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  try {
    const result = await internalService.createJob({
      type: "analytics.project",
      payload: { state: scoped, projectId },
      idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : undefined,
      metadata: { source: "express", workflow: "reports.analytics", requestedBy: auth.session.id, requestId: req.requestId },
    });
    res.setHeader("cache-control", "no-store");
    return res.status(result?.deduped ? 200 : 201).json(result);
  } catch (error) {
    return handleInternalServiceError(res, error, req.requestId);
  }
});

cpmisJobsRouter.post("/reports/predictive", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  if (!canReadAnalytics(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  const projectId = String(req.body?.projectId ?? req.body?.project ?? req.query.projectId ?? req.query.project ?? "all");
  const state = await readState();
  const scoped = scopeStateForReports(state, auth, projectId);
  if (projectId !== "all" && scoped.projects.length === 0) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  try {
    const result = await internalService.createJob({
      type: "analytics.predictive",
      payload: { state: scoped, projectId },
      idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : undefined,
      metadata: { source: "express", workflow: "reports.predictive", requestedBy: auth.session.id, requestId: req.requestId },
    });
    res.setHeader("cache-control", "no-store");
    return res.status(result?.deduped ? 200 : 201).json(result);
  } catch (error) {
    return handleInternalServiceError(res, error, req.requestId);
  }
});

cpmisJobsRouter.post("/reports/monthly-progress", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const month = String(req.body?.month ?? new Date().toISOString().slice(0, 7));
  if (!/^\d{4}-\d{2}$/.test(month)) return apiError(res, 400, "validation-failed", { message: "month must be YYYY-MM.", requestId: req.requestId });
  const projectId = String(req.body?.projectId ?? req.body?.project ?? "all");
  const state = await readState();
  const scoped = scopeStateForReports(state, auth, projectId);
  try {
    const result = await internalService.createJob({
      type: "report.monthly-progress",
      payload: { state: scoped, month, projectId },
      idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : undefined,
      metadata: { source: "express", workflow: "reports.monthly-progress", requestedBy: auth.session.id, requestId: req.requestId },
    });
    res.setHeader("cache-control", "no-store");
    return res.status(result?.deduped ? 200 : 201).json(result);
  } catch (error) {
    return handleInternalServiceError(res, error, req.requestId);
  }
});

cpmisJobsRouter.post("/reports/workbook", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const projectId = String(req.body?.projectId ?? req.body?.project ?? "all");
  const from = typeof req.body?.from === "string" ? req.body.from : undefined;
  const to = typeof req.body?.to === "string" ? req.body.to : undefined;
  const state = await readState();
  const scoped = scopeStateForReports(state, auth, projectId);
  try {
    const result = await internalService.createJob({
      type: "report.project-workbook",
      payload: { state: scoped, projectId, from, to },
      idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : undefined,
      metadata: { source: "express", workflow: "reports.workbook", requestedBy: auth.session.id, requestId: req.requestId },
    });
    res.setHeader("cache-control", "no-store");
    return res.status(result?.deduped ? 200 : 201).json(result);
  } catch (error) {
    return handleInternalServiceError(res, error, req.requestId);
  }
});

cpmisJobsRouter.post("/boq/parse", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  if (!["administrator", "quantity_surveyor"].includes(auth.session.role)) {
    return apiError(res, 403, "forbidden", { requestId: req.requestId });
  }
  const contentBase64 = req.body?.contentBase64;
  if (typeof contentBase64 !== "string" || contentBase64.length === 0) {
    return apiError(res, 400, "validation-failed", { message: "contentBase64 is required.", requestId: req.requestId });
  }
  // Guard against excessively large payloads being relayed through job system.
  if (contentBase64.length > 15_000_000) {
    return apiError(res, 413, "payload-too-large", { message: "BOQ file payload is too large for async parsing.", requestId: req.requestId });
  }
  try {
    const result = await internalService.createJob({
      type: "boq.parse",
      payload: {
        contentBase64,
        fileName: typeof req.body?.fileName === "string" ? req.body.fileName : "upload",
        format: typeof req.body?.format === "string" ? req.body.format : undefined,
      },
      idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : undefined,
      metadata: { source: "express", workflow: "boq.parse", requestedBy: auth.session.id, requestId: req.requestId },
    });
    res.setHeader("cache-control", "no-store");
    return res.status(result?.deduped ? 200 : 201).json(result);
  } catch (error) {
    return handleInternalServiceError(res, error, req.requestId);
  }
});
