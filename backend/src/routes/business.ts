/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { employeeSchema, engineerReportSchema, projectSchema, taskSchema, userSchema } from "@/lib/validations/schemas";
import { applyPortalAction } from "@/lib/server/portal-store";
import { readState } from "@/lib/server/memory";
import { PersistenceError } from "@/lib/server/mongo";
import { billLines, estimateFor, expenditureFor, lineActual, lineEstimate, linesActual, linesEstimate, parseBoq } from "@/lib/boq";
import { apiError } from "../lib/api-response";
import { requireAnySession, requireSession } from "../lib/session";
import { canAccessProject, isAdmin } from "../lib/rbac";
import { verifyCsrfToken, setUserPassword, removeUserCredential, destroySessionsForUser } from "../lib/auth-bridge";
import { withIdempotency } from "../lib/idempotency";
import { logger } from "../lib/logger";
import { createXlsx } from "@/lib/server/xlsx";
import { parseBoqImportFile } from "@/lib/server/boq-import";
import type { BoqInput } from "@/types";

export const businessRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function stamp(session: { id: string; firstName: string; lastName: string; role: string }) {
  const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, at: new Date().toISOString(), notificationId: `ntf-${id}`, actorId: session.id, actorName: `${session.firstName} ${session.lastName}`, actorRole: session.role };
}

function parseOr400<T>(schema: z.ZodType<T>, body: unknown, req: Request, res: Response): T | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    apiError(res, 400, "validation-failed", { message: parsed.error.issues[0]?.message ?? "Invalid request.", details: parsed.error.issues, requestId: req.requestId });
    return null;
  }
  return parsed.data;
}

function isDuplicateKeyError(error: unknown): boolean {
  const e: any = error;
  const detail: any = e?.detail;
  const code = e?.code ?? detail?.code;
  if (code === 11000) return true;
  const msg = String(e?.message ?? detail?.message ?? "");
  return /E11000|duplicate key/i.test(msg);
}

function actionErrorResult(error: unknown, req: Request): { status: number; body: any } {
  if (error && typeof error === "object" && "name" in error && (error as any).name === "PortalActionError") {
    return { status: 403, body: { ok: false, error: "forbidden", message: "You are not authorized to perform this action.", requestId: req.requestId, apiVersion: req.app.locals?.apiVersion ?? "v1" } };
  }
  if (isDuplicateKeyError(error)) {
    return { status: 409, body: { ok: false, error: "conflict", message: "A record with the same unique value already exists.", requestId: req.requestId, apiVersion: req.app.locals?.apiVersion ?? "v1" } };
  }
  if (error instanceof PersistenceError) {
    return { status: 503, body: { ok: false, error: "persistence-failed", requestId: req.requestId, apiVersion: req.app.locals?.apiVersion ?? "v1" } };
  }
  logger.error("business.action_failed", error, { requestId: req.requestId, path: req.originalUrl, method: req.method });
  return { status: 500, body: { ok: false, error: "action-failed", requestId: req.requestId, apiVersion: req.app.locals?.apiVersion ?? "v1" } };
}

function handleActionError(error: unknown, req: Request, res: Response) {
  const result = actionErrorResult(error, req);
  return res.status(result.status).json(result.body);
}

async function runAction(req: Request, portal: any, session: any, action: any, status = 200): Promise<{ status: number; body: any }> {
  try {
    const state = await applyPortalAction(portal, action, session);
    return { status, body: { ok: true, state } };
  } catch (error) {
    return actionErrorResult(error, req);
  }
}

async function withAction(req: Request, res: Response, portal: any, session: any, action: any, status = 200) {
  const result = await runAction(req, portal, session, action, status);
  res.setHeader("cache-control", "no-store");
  return res.status(result.status).json(result.body);
}

async function ensureProjectAccess(req: Request, res: Response, session: any, projectId: string, state?: any) {
  if (session.role === "administrator") return true;
  if (session.role === "site_engineer" || session.role === "quantity_surveyor") {
    if (session.projectId === projectId) return true;
    apiError(res, 403, "forbidden", { message: "You do not have access to this project.", requestId: req.requestId });
    return false;
  }
  const st = state ?? await readStateOr503(req, res);
  if (!st) return false;
  const project = st.projects.find((p: any) => p.id === projectId);
  if (project && canAccessProject(session, project)) return true;
  apiError(res, 403, "forbidden", { message: "You do not have access to this project.", requestId: req.requestId });
  return false;
}

function scopedProjects(state: any, session: any) {
  if (isAdmin(session)) return state.projects;
  if (session.role === "project_manager") return state.projects.filter((p: any) => p.managerId === session.id);
  return state.projects.filter((p: any) => p.id === session.projectId);
}

async function readStateOr503(req: Request, res: Response) {
  try {
    return await readState();
  } catch (error) {
    if (error instanceof PersistenceError) {
      apiError(res, 503, "persistence-failed", { requestId: req.requestId });
      return null;
    }
    throw error;
  }
}

function portalForSession(session: any) {
  if (session.role === "administrator") return "administrator";
  if (session.role === "project_manager") return "project_manager";
  if (session.role === "site_engineer") return "site_engineer";
  return "quantity_surveyor";
}

// 1. Users and employees
businessRouter.get("/users", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, items: state.users });
});

businessRouter.post("/users", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const schema = userSchema.extend({ password: z.string().min(8).max(200) });
  const parsed = parseOr400(schema, req.body ?? {}, req, res);
  if (!parsed) return;
  return withIdempotency(req, res, `business:users:create:${auth.session.id}`, parsed, async () => {
    let state;
    try { state = await readState(); } catch (error) { if (error instanceof PersistenceError) return { status: 503, body: { ok: false, error: "persistence-failed", requestId: req.requestId, apiVersion: "v1" } }; throw error; }
    if (state.users.some((u) => u.email.toLowerCase() === parsed.email.toLowerCase())) {
      return { status: 409, body: { ok: false, error: "conflict", message: "That email is already registered.", requestId: req.requestId, apiVersion: "v1" } };
    }
    const st = stamp(auth.session);
    try {
      await applyPortalAction("administrator", { type: "create-user", input: parsed, stamp: st } as any, auth.session);
    } catch (error) {
      return actionErrorResult(error, req);
    }
    try {
      await setUserPassword(st.id, parsed.email, parsed.password);
      res.setHeader("cache-control", "no-store");
      return { status: 201, body: { ok: true, id: st.id } };
    } catch (error) {
      logger.error("business.user_create_credential_failed", error, { requestId: req.requestId, userId: st.id, email: parsed.email });
      try { await removeUserCredential(st.id); } catch (cleanupError) { logger.error("business.user_create_credential_cleanup_failed", cleanupError, { requestId: req.requestId, userId: st.id }); }
      try { await applyPortalAction("administrator", { type: "delete-user", id: st.id, stamp: stamp(auth.session) } as any, auth.session); } catch (rollbackError) { logger.error("business.user_create_rollback_failed", rollbackError, { requestId: req.requestId, userId: st.id }); }
      return { status: 503, body: { ok: false, error: "persistence-failed", message: "The account could not be fully created. Please try again.", requestId: req.requestId, apiVersion: "v1" } };
    }
  });
});

businessRouter.patch("/users/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const parsed = parseOr400(userSchema.partial(), req.body ?? {}, req, res);
  if (!parsed) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const existing = state.users.find((u) => u.id === id);
  if (!existing) return apiError(res, 404, "not-found", { requestId: req.requestId });
  const nextEmail = String(parsed.email ?? existing.email).toLowerCase();
  if (nextEmail !== existing.email.toLowerCase() && state.users.some((u) => u.id !== id && u.email.toLowerCase() === nextEmail)) {
    return apiError(res, 409, "conflict", { message: "That email is already registered.", requestId: req.requestId });
  }
  const input = { ...existing, ...parsed, projectId: parsed.projectId ?? existing.projectId };
  const result = await withAction(req, res, "administrator", auth.session, { type: "update-user", id, input, stamp: stamp(auth.session) });
  if (res.headersSent) return result;
  if (input.status !== "active") await destroySessionsForUser(id);
  return result;
});

businessRouter.patch("/users/:id/status", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const status = String((req.body ?? {}).status);
  if (status !== "active" && status !== "inactive") return apiError(res, 400, "validation-failed", { message: "Invalid status.", requestId: req.requestId });
  try {
    const state = await applyPortalAction("administrator", { type: "set-user-status", id, status, stamp: stamp(auth.session) } as any, auth.session);
    if (status !== "active") await destroySessionsForUser(id);
    res.setHeader("cache-control", "no-store");
    return res.json({ ok: true, state });
  } catch (error) {
    return handleActionError(error, req, res);
  }
});

businessRouter.delete("/users/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  try {
    await applyPortalAction("administrator", { type: "delete-user", id, stamp: stamp(auth.session) } as any, auth.session);
    await removeUserCredential(id);
    await destroySessionsForUser(id);
    res.setHeader("cache-control", "no-store");
    res.json({ ok: true });
  } catch (error) {
    return handleActionError(error, req, res);
  }
});

businessRouter.get("/employees", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, items: state.employees });
});

businessRouter.post("/employees", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const parsed = parseOr400(employeeSchema, req.body ?? {}, req, res);
  if (!parsed) return;
  return withIdempotency(req, res, `business:employees:create:${auth.session.id}`, parsed, async () => {
    let state;
    try { state = await readState(); } catch (error) { if (error instanceof PersistenceError) return { status: 503, body: { ok: false, error: "persistence-failed", requestId: req.requestId, apiVersion: "v1" } }; throw error; }
    if (state.employees.some((e) => e.employeeCode.toLowerCase() === parsed.employeeCode.toLowerCase())) {
      return { status: 409, body: { ok: false, error: "conflict", message: "That employee ID is already in use.", requestId: req.requestId, apiVersion: "v1" } };
    }
    res.setHeader("cache-control", "no-store");
    return runAction(req, "administrator", auth.session, { type: "create-employee", input: parsed, stamp: stamp(auth.session) }, 201);
  });
});

businessRouter.patch("/employees/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readStateOr503(req, res);
  if (!state) return;
  const existing = state.employees.find((e) => e.id === id);
  if (!existing) return apiError(res, 404, "not-found", { requestId: req.requestId });
  const parsed = parseOr400(employeeSchema.partial(), req.body ?? {}, req, res);
  if (!parsed) return;
  const nextCode = String(parsed.employeeCode ?? existing.employeeCode).toLowerCase();
  if (nextCode !== existing.employeeCode.toLowerCase() && state.employees.some((e) => e.id !== id && e.employeeCode.toLowerCase() === nextCode)) {
    return apiError(res, 409, "conflict", { message: "That employee ID is already in use.", requestId: req.requestId });
  }
  return withAction(req, res, "administrator", auth.session, { type: "update-employee", id, input: { ...existing, ...parsed }, stamp: stamp(auth.session) });
});

businessRouter.delete("/employees/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  return withAction(req, res, "administrator", auth.session, { type: "delete-employee", id, stamp: stamp(auth.session) });
});

// 2. Projects and assignments
businessRouter.get("/projects", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, items: scopedProjects(state, auth.session) });
});

businessRouter.post("/projects", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const parsed = parseOr400(projectSchema, req.body ?? {}, req, res);
  if (!parsed) return;
  return withIdempotency(req, res, `business:projects:create:${auth.session.id}`, parsed, async () => {
    res.setHeader("cache-control", "no-store");
    return runAction(req, "administrator", auth.session, { type: "create-project", input: parsed, stamp: stamp(auth.session) }, 201);
  });
});

businessRouter.patch("/projects/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readStateOr503(req, res);
  if (!state) return;
  const existing = state.projects.find((p) => p.id === id);
  if (!existing) return apiError(res, 404, "not-found", { requestId: req.requestId });
  const parsed = parseOr400((projectSchema as any).innerType().partial(), req.body ?? {}, req, res);
  if (!parsed) return;
  const input = { ...existing, ...parsed };
  return withAction(req, res, "administrator", auth.session, { type: "update-project", id, input, stamp: stamp(auth.session) });
});

businessRouter.delete("/projects/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  return withAction(req, res, "administrator", auth.session, { type: "delete-project", id, stamp: stamp(auth.session) });
});

businessRouter.patch("/projects/:id/assignment", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readStateOr503(req, res);
  if (!state) return;
  const existing = state.projects.find((p) => p.id === id);
  if (!existing) return apiError(res, 404, "not-found", { requestId: req.requestId });
  const body = req.body ?? {};
  const managerId = typeof body.managerId === "string" ? body.managerId : existing.managerId;
  const manager = state.users.find((u) => u.id === managerId && u.role === "project_manager");
  if (!manager) return apiError(res, 400, "validation-failed", { message: "Choose a valid project manager.", requestId: req.requestId });
  return withAction(req, res, "administrator", auth.session, { type: "update-project", id, input: { ...existing, managerId }, stamp: stamp(auth.session) });
});

// 3. Tasks and schedules
const taskStatusSchema = z.enum(["todo", "pending", "done"]);
const taskPrioritySchema = z.enum(["low", "medium", "high", "critical"]);

businessRouter.get("/tasks", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  let items = state.tasks;
  if (projectId) {
    if (!(await ensureProjectAccess(req, res, auth.session, projectId))) return;
    items = items.filter((t) => t.projectId === projectId);
  } else if (!isAdmin(auth.session)) {
    const ids = new Set(scopedProjects(state, auth.session).map((p: any) => p.id));
    items = items.filter((t) => ids.has(t.projectId));
  }
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, items });
});

businessRouter.post("/tasks", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const parsed = parseOr400(taskSchema, req.body ?? {}, req, res);
  if (!parsed) return;
  if (!(await ensureProjectAccess(req, res, auth.session, parsed.projectId))) return;
  const portal = portalForSession(auth.session);
  if (portal !== "administrator" && portal !== "project_manager") return apiError(res, 403, "forbidden", { requestId: req.requestId });
  return withIdempotency(req, res, `business:tasks:create:${auth.session.id}`, parsed, async () => { res.setHeader("cache-control", "no-store"); return runAction(req, portal, auth.session, { type: "create-task", input: parsed, stamp: stamp(auth.session) }, 201); });
});

businessRouter.post("/tasks/:id/status", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(z.object({ status: taskStatusSchema }), req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, task.projectId))) return;
  const portal = portalForSession(auth.session);
  if (portal !== "administrator" && portal !== "project_manager") return apiError(res, 403, "forbidden", { requestId: req.requestId });
  return withAction(req, res, portal, auth.session, { type: "set-task-status", id, status: body.status, stamp: stamp(auth.session) });
});

businessRouter.post("/tasks/:id/assign", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(z.object({ projectId: z.string().min(1) }), req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, task.projectId)) || !(await ensureProjectAccess(req, res, auth.session, body.projectId))) return;
  const portal = portalForSession(auth.session);
  if (portal !== "administrator" && portal !== "project_manager") return apiError(res, 403, "forbidden", { requestId: req.requestId });
  return withAction(req, res, portal, auth.session, { type: "assign-task", id, projectId: body.projectId, stamp: stamp(auth.session) });
});

businessRouter.post("/tasks/:id/schedule", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(z.object({ projectId: z.string().min(1), assignee: z.string().trim().min(1), dueDate: z.string().min(1), priority: taskPrioritySchema }), req.body ?? {}, req, res);
  if (!body) return;
  if (!(await ensureProjectAccess(req, res, auth.session, body.projectId))) return;
  const portal = portalForSession(auth.session);
  if (portal !== "administrator" && portal !== "project_manager") return apiError(res, 403, "forbidden", { requestId: req.requestId });
  return withAction(req, res, portal, auth.session, { type: "schedule-task", id, projectId: body.projectId, assignee: body.assignee, dueDate: body.dueDate, priority: body.priority, stamp: stamp(auth.session) });
});

businessRouter.post("/tasks/:id/progress", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "site_engineer");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(z.object({ progress: z.coerce.number().min(0).max(100), status: taskStatusSchema.optional() }), req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, task.projectId))) return;
  const status = body.status ?? (body.progress >= 100 ? "done" : task.status);
  return withAction(req, res, "site_engineer", auth.session, { type: "set-task-progress", id, engineerId: auth.session.id, progress: body.progress, status, stamp: stamp(auth.session) });
});

businessRouter.delete("/tasks/:id", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readStateOr503(req, res);
  if (!state) return;
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, task.projectId))) return;
  const portal = portalForSession(auth.session);
  if (portal !== "administrator" && portal !== "project_manager") return apiError(res, 403, "forbidden", { requestId: req.requestId });
  return withAction(req, res, portal, auth.session, { type: "delete-task", id, stamp: stamp(auth.session) });
});

// 4. Site reports
businessRouter.get("/site-reports", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  let items = state.reports;
  if (projectId) {
    if (!(await ensureProjectAccess(req, res, auth.session, projectId))) return;
    items = items.filter((r) => r.projectId === projectId);
  } else if (!isAdmin(auth.session)) {
    const ids = new Set(scopedProjects(state, auth.session).map((p: any) => p.id));
    items = items.filter((r) => ids.has(r.projectId));
  }
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, items });
});

businessRouter.post("/site-reports", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const portal = portalForSession(auth.session);
  if (portal !== "site_engineer" && portal !== "project_manager") return apiError(res, 403, "forbidden", { requestId: req.requestId });
  const parsed = parseOr400<any>((engineerReportSchema as any).innerType().extend({ photos: z.array(z.any()).optional(), toAdmin: z.boolean().optional() }), req.body ?? {}, req, res);
  if (!parsed) return;
  if (!(await ensureProjectAccess(req, res, auth.session, parsed.projectId))) return;
  if (portal === "site_engineer" && parsed.engineerId !== auth.session.id) return apiError(res, 403, "forbidden", { message: "Site engineers can only submit their own reports.", requestId: req.requestId });
  return withIdempotency(req, res, `business:site-reports:create:${auth.session.id}`, parsed, async () => { res.setHeader("cache-control", "no-store"); return runAction(req, portal, auth.session, { type: "submit-report", input: { ...parsed, photos: parsed.photos ?? [] }, photos: parsed.photos ?? [], toAdmin: parsed.toAdmin ?? (portal === "project_manager"), stamp: stamp(auth.session) }, 201); });
});

businessRouter.patch("/site-reports/:id/resubmit", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "site_engineer");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(z.object({ progress: z.coerce.number().min(0).max(100), summary: z.string().trim().min(12), issues: z.string().trim().optional().default(""), photos: z.array(z.any()).optional().default([]) }), req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const report = state.reports.find((r) => r.id === id);
  if (!report) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, report.projectId))) return;
  return withAction(req, res, "site_engineer", auth.session, { type: "resubmit-report", id, progress: body.progress, summary: body.summary, issues: body.issues, photos: body.photos, stamp: stamp(auth.session) });
});

businessRouter.delete("/site-reports/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  return withAction(req, res, "administrator", auth.session, { type: "delete-report", id, stamp: stamp(auth.session) });
});

// 5. Report approvals
businessRouter.post("/site-reports/:id/open", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readStateOr503(req, res);
  if (!state) return;
  const report = state.reports.find((r) => r.id === id);
  if (!report) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, report.projectId))) return;
  return withAction(req, res, "project_manager", auth.session, { type: "open-report-review", id, stamp: stamp(auth.session) });
});

businessRouter.post("/site-reports/:id/decide", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().trim().optional().default("") }), req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const report = state.reports.find((r) => r.id === id);
  if (!report) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, report.projectId))) return;
  return withAction(req, res, "project_manager", auth.session, { type: "decide-report", id, decision: body.decision, note: body.note, stamp: stamp(auth.session) });
});


// 6. BOQ and expenses
const boqSchema = z.object({
  projectId: z.string().min(1),
  code: z.string().trim().min(2),
  description: z.string().trim().min(3),
  unit: z.enum(["m3", "m2", "m", "t", "nr", "ls"]),
  estimatedQty: z.coerce.number().min(0),
  actualQty: z.coerce.number().min(0),
  unitRate: z.coerce.number().min(0),
});

businessRouter.get("/boq", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  let items = state.boq;
  if (projectId) {
    if (!(await ensureProjectAccess(req, res, auth.session, projectId))) return;
    items = items.filter((b) => b.projectId === projectId);
  } else if (!isAdmin(auth.session)) {
    const ids = new Set(scopedProjects(state, auth.session).map((p: any) => p.id));
    items = items.filter((b) => ids.has(b.projectId));
  }
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, items });
});

businessRouter.get("/boq/export", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  let projects = state.projects;
  if (projectId) {
    if (!(await ensureProjectAccess(req, res, auth.session, projectId))) return;
    projects = projects.filter((p: any) => p.id === projectId);
  } else if (!isAdmin(auth.session)) {
    projects = scopedProjects(state, auth.session);
  }
  const ids = new Set(projects.map((p: any) => p.id));
  const items = state.boq.filter((b: any) => ids.has(b.projectId)).sort((a: any, b: any) => (a.projectId + a.code).localeCompare(b.projectId + b.code));
  const projectsById = new Map(projects.map((p: any) => [p.id, p]));

  const summaryRows: (string | number)[][] = [
    ["BOQ Summary Export"],
    ["Generated At", new Date().toISOString()],
    ["Project Filter", projectId ? (projectsById.get(projectId)?.code ?? projectId) : "All accessible projects"],
    [],
    ["Project Code", "Project", "BOQ Lines", "Estimated Total (RWF)", "Actual Total (RWF)", "Variance (RWF)"],
  ];
  let grandEst = 0;
  let grandAct = 0;
  for (const project of projects) {
    const pItems = items.filter((i: any) => i.projectId === project.id);
    const est = estimateFor(state.boq, project.id);
    const act = expenditureFor(state.boq, project.id);
    grandEst += est;
    grandAct += act;
    summaryRows.push([project.code, project.name, pItems.length, est, act, act - est]);
  }
  summaryRows.push(["TOTAL", "", items.length, grandEst, grandAct, grandAct - grandEst]);

  const lineRows: (string | number)[][] = [
    ["Project Code", "Project", "Item Code", "Description", "Unit", "Estimated Qty", "Actual Qty", "Unit Rate (RWF)", "Estimated Amount (RWF)", "Actual Amount (RWF)", "Variance (RWF)"],
  ];
  for (const item of items) {
    const project = projectsById.get(item.projectId);
    const est = lineEstimate(item);
    const act = lineActual(item);
    lineRows.push([project?.code ?? "", project?.name ?? "", item.code, item.description, item.unit, item.estimatedQty, item.actualQty, item.unitRate, est, act, act - est]);
  }

  const workbook = createXlsx([
    { name: "Summary", rows: summaryRows },
    { name: "BOQ Lines", rows: lineRows },
  ]);
  const stampName = projectId ? (projectsById.get(projectId)?.code ?? projectId) : "all";
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="boq-summary-${stampName}.xlsx"`);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(workbook);
});

businessRouter.post("/boq/import/preview", upload.single("file"), async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "quantity_surveyor");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const projectId = String(req.body?.projectId ?? "");
  if (!projectId) return apiError(res, 400, "validation-failed", { message: "projectId is required.", requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, projectId))) return;
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return apiError(res, 400, "validation-failed", { message: "Choose an Excel (.xlsx) or CSV file to import.", requestId: req.requestId });
  const lower = file.originalname.toLowerCase();
  if (!(lower.endsWith(".xlsx") || lower.endsWith(".csv") || lower.endsWith(".pdf") || lower.endsWith(".txt"))) {
    return apiError(res, 400, "validation-failed", { message: "Unsupported file type. Upload a .xlsx, .csv, .pdf, or .txt file.", requestId: req.requestId });
  }
  try {
    const preview = parseBoqImportFile(file.originalname, file.buffer, projectId);
    res.setHeader("cache-control", "no-store");
    return res.json({ ok: true, preview });
  } catch (error: any) {
    logger.error("business.boq_import_preview_failed", error, { requestId: req.requestId, fileName: file.originalname });
    return apiError(res, 400, "validation-failed", { message: error?.message || "Could not parse the import file.", requestId: req.requestId });
  }
});

const boqImportAcceptSchema = z.object({
  projectId: z.string().min(1),
  rows: z.array(z.object({
    code: z.string().trim().min(2),
    description: z.string().trim().min(3),
    unit: z.enum(["m3", "m2", "m", "t", "nr", "ls"]),
    estimatedQty: z.coerce.number().min(0),
    actualQty: z.coerce.number().min(0),
    unitRate: z.coerce.number().min(0),
  })).min(1).max(500),
});

businessRouter.post("/boq/import/accept", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "quantity_surveyor");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const parsed = parseOr400(boqImportAcceptSchema, req.body ?? {}, req, res);
  if (!parsed) return;
  if (!(await ensureProjectAccess(req, res, auth.session, parsed.projectId))) return;

  const inputs: BoqInput[] = [];
  const rowErrors: { index: number; message: string }[] = [];
  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i]!;
    const input = parseBoq({ ...row, projectId: parsed.projectId } as any);
    if (!input) { rowErrors.push({ index: i, message: "Row failed BOQ validation." }); continue; }
    inputs.push(input);
  }
  if (inputs.length === 0) {
    return apiError(res, 400, "validation-failed", { message: "No valid BOQ rows to import.", details: rowErrors, requestId: req.requestId });
  }

  return withIdempotency(req, res, `business:boq:import:${auth.session.id}`, parsed, async () => {
    res.setHeader("cache-control", "no-store");
    const result = await runAction(req, "quantity_surveyor", auth.session, {
      type: "create-boq-batch",
      surveyorId: auth.session.id,
      projectId: parsed.projectId,
      inputs,
      stamp: stamp(auth.session),
    }, 201);
    if (result.status >= 400) return result;
    return {
      status: 201,
      body: { ...(result.body ?? {}), imported: inputs.length, skipped: rowErrors.length, rowErrors },
    };
  });
});

businessRouter.post("/boq", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "quantity_surveyor");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const parsed = parseOr400(boqSchema, req.body ?? {}, req, res);
  if (!parsed) return;
  if (!(await ensureProjectAccess(req, res, auth.session, parsed.projectId))) return;
  const input = parseBoq(parsed as any);
  if (!input) return apiError(res, 400, "validation-failed", { message: "Invalid BOQ line.", requestId: req.requestId });
  return withIdempotency(req, res, `business:boq:create:${auth.session.id}`, parsed, async () => { res.setHeader("cache-control", "no-store"); return runAction(req, "quantity_surveyor", auth.session, { type: "create-boq", surveyorId: auth.session.id, input, stamp: stamp(auth.session) }, 201); });
});

businessRouter.patch("/boq/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "quantity_surveyor");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readStateOr503(req, res);
  if (!state) return;
  const existing = state.boq.find((b) => b.id === id);
  if (!existing) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, existing.projectId))) return;
  const parsed = parseOr400(boqSchema.partial(), req.body ?? {}, req, res);
  if (!parsed) return;
  const input = parseBoq({ ...existing, ...parsed, projectId: existing.projectId } as any);
  if (!input) return apiError(res, 400, "validation-failed", { message: "Invalid BOQ line.", requestId: req.requestId });
  return withAction(req, res, "quantity_surveyor", auth.session, { type: "update-boq", surveyorId: auth.session.id, id, input, stamp: stamp(auth.session) });
});

businessRouter.delete("/boq/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "quantity_surveyor");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readStateOr503(req, res);
  if (!state) return;
  const existing = state.boq.find((b) => b.id === id);
  if (!existing) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, existing.projectId))) return;
  return withAction(req, res, "quantity_surveyor", auth.session, { type: "delete-boq", surveyorId: auth.session.id, id, stamp: stamp(auth.session) });
});

businessRouter.get("/projects/:id/expenses", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const projectId = String(req.params.id);
  if (!(await ensureProjectAccess(req, res, auth.session, projectId))) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return apiError(res, 404, "not-found", { requestId: req.requestId });
  const lines = billLines(state.boq, projectId);
  res.setHeader("cache-control", "no-store");
  res.json({
    ok: true,
    projectId,
    budget: project.budget,
    spent: project.spent,
    estimated: linesEstimate(lines),
    actual: linesActual(lines),
    lines: lines.map((l) => ({ ...l, estimatedAmount: Math.round(l.estimatedQty * l.unitRate), actualAmount: Math.round(l.actualQty * l.unitRate) })),
  });
});

// 7. Cost reports
businessRouter.get("/cost-reports", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  let items = state.costReports ?? [];
  if (projectId) {
    if (!(await ensureProjectAccess(req, res, auth.session, projectId))) return;
    items = items.filter((r) => r.projectId === projectId);
  } else if (!isAdmin(auth.session)) {
    const ids = new Set(scopedProjects(state, auth.session).map((p: any) => p.id));
    items = items.filter((r) => ids.has(r.projectId));
  }
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, items });
});

businessRouter.post("/cost-reports/send", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "quantity_surveyor");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const body = parseOr400(z.object({ surveyorId: z.string().min(1).optional() }), req.body ?? {}, req, res);
  if (!body) return;
  const surveyorId = body.surveyorId ?? auth.session.id;
  if (surveyorId !== auth.session.id) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  return withIdempotency(req, res, `business:cost-reports:send:${auth.session.id}`, body, async () => { res.setHeader("cache-control", "no-store"); return runAction(req, "quantity_surveyor", auth.session, { type: "send-cost-report", surveyorId, stamp: stamp(auth.session) }, 201); });
});

businessRouter.post("/cost-reports/submit", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const body = parseOr400(z.object({ projectId: z.string().min(1), surveyorId: z.string().min(1) }), req.body ?? {}, req, res);
  if (!body) return;
  if (!(await ensureProjectAccess(req, res, auth.session, body.projectId))) return;
  return withIdempotency(req, res, `business:cost-reports:submit:${auth.session.id}`, body, async () => { res.setHeader("cache-control", "no-store"); return runAction(req, "project_manager", auth.session, { type: "submit-cost-report", projectId: body.projectId, surveyorId: body.surveyorId, stamp: stamp(auth.session) }, 201); });
});

businessRouter.patch("/cost-reports/revise-bill", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const body = parseOr400(z.object({ projectId: z.string().min(1), lines: z.array(z.object({ id: z.string().min(1), estimatedQty: z.coerce.number().min(0), actualQty: z.coerce.number().min(0), unitRate: z.coerce.number().min(0) })).min(1) }), req.body ?? {}, req, res);
  if (!body) return;
  if (!(await ensureProjectAccess(req, res, auth.session, body.projectId))) return;
  return withAction(req, res, "project_manager", auth.session, { type: "revise-cost-bill", projectId: body.projectId, lines: body.lines, stamp: stamp(auth.session) });
});

businessRouter.delete("/cost-reports/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  return withAction(req, res, "administrator", auth.session, { type: "delete-cost-report", id, stamp: stamp(auth.session) });
});

// 8. Expense transactions (financial lifecycle).
// NOTE: GET /projects/:id/expenses remains the legacy BOQ expense summary for compatibility.
const expenseCategorySchema = z.enum(["labor", "material", "equipment", "subcontractor", "service", "other"]);
const expenseCreateSchema = z.object({
  projectId: z.string().min(1),
  category: expenseCategorySchema,
  description: z.string().trim().min(3).max(500),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().min(1).max(8).optional(),
  vendor: z.string().trim().max(200).optional(),
  incurredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const expenseDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1000).optional(),
});
const expenseCancelSchema = z.object({ note: z.string().trim().max(1000).optional() });

businessRouter.get("/expenses", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  if (projectId && !(await ensureProjectAccess(req, res, auth.session, projectId))) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const allowed = new Set(scopedProjects(state, auth.session).map((p: any) => p.id));
  const expenses = (state.expenses ?? []).filter((e: any) => allowed.has(e.projectId) && (!projectId || e.projectId === projectId));
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, expenses });
});

businessRouter.get("/projects/:id/expense-transactions", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const projectId = String(req.params.id);
  if (!(await ensureProjectAccess(req, res, auth.session, projectId))) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const expenses = (state.expenses ?? []).filter((e: any) => e.projectId === projectId);
  const payments = (state.payments ?? []).filter((p: any) => p.projectId === projectId);
  const variations = (state.variations ?? []).filter((v: any) => v.projectId === projectId);
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, projectId, expenses, payments, variations });
});

businessRouter.get("/projects/:id/reconciliation", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const projectId = String(req.params.id);
  if (!(await ensureProjectAccess(req, res, auth.session, projectId))) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const project = state.projects.find((p: any) => p.id === projectId);
  if (!project) return apiError(res, 404, "not-found", { requestId: req.requestId });

  const currency = state.settings?.currency ?? "RWF";
  const lines = billLines(state.boq, projectId);
  const boqEstimated = linesEstimate(lines);
  const boqValuation = linesActual(lines); // measured/actual BOQ valuation

  const variations = (state.variations ?? []).filter((v: any) => v.projectId === projectId);
  const approvedVariations = variations.filter((v: any) => v.status === "approved");
  const approvedVariationAdditions = approvedVariations.filter((v: any) => v.type === "addition").reduce((s: number, v: any) => s + (Number(v.amount) || 0), 0);
  const approvedVariationOmissions = approvedVariations.filter((v: any) => v.type === "omission").reduce((s: number, v: any) => s + (Number(v.amount) || 0), 0);
  const approvedVariationNet = approvedVariationAdditions - approvedVariationOmissions;
  const adjustedBudget = (Number(project.budget) || 0) + approvedVariationNet;

  const expenses = (state.expenses ?? []).filter((e: any) => e.projectId === projectId);
  const expenseTotals = {
    draft: expenses.filter((e: any) => e.status === "draft").reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0),
    submitted: expenses.filter((e: any) => e.status === "submitted").reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0),
    approved: expenses.filter((e: any) => e.status === "approved").reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0),
    rejected: expenses.filter((e: any) => e.status === "rejected").reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0),
    cancelled: expenses.filter((e: any) => e.status === "cancelled").reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0),
  };

  const payments = (state.payments ?? []).filter((p: any) => p.projectId === projectId);
  const paymentTotals = {
    pending: payments.filter((p: any) => p.status === "pending").reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0),
    approved: payments.filter((p: any) => p.status === "approved").reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0),
    paid: payments.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0),
    failed: payments.filter((p: any) => p.status === "failed").reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0),
    cancelled: payments.filter((p: any) => p.status === "cancelled").reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0),
    reversed: payments.filter((p: any) => p.status === "reversed").reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0),
  };
  const netPaid = paymentTotals.paid - paymentTotals.reversed;
  const outstandingApprovedExpense = Math.max(0, expenseTotals.approved - paymentTotals.pending - paymentTotals.approved - paymentTotals.paid);

  res.setHeader("cache-control", "no-store");
  res.json({
    ok: true,
    projectId,
    currency,
    budget: {
      baseline: Number(project.budget) || 0,
      approvedVariationAdditions,
      approvedVariationOmissions,
      approvedVariationNet,
      adjusted: adjustedBudget,
    },
    valuation: {
      boqEstimated,
      boqMeasured: boqValuation,
      boqVariance: boqValuation - boqEstimated,
      projectSpent: Number(project.spent) || 0,
    },
    expenses: {
      totals: expenseTotals,
      approvedCommitted: expenseTotals.approved,
      outstandingApproved: outstandingApprovedExpense,
      count: expenses.length,
    },
    payments: {
      totals: paymentTotals,
      netPaid,
      outstandingApproved: paymentTotals.pending + paymentTotals.approved,
      count: payments.length,
    },
    reconciliation: {
      adjustedBudgetMinusValuation: adjustedBudget - boqValuation,
      valuationMinusNetPaid: boqValuation - netPaid,
      approvedExpensesMinusNetPaid: expenseTotals.approved - netPaid,
      baselineBudgetMinusValuation: (Number(project.budget) || 0) - boqValuation,
    },
    notes: [
      "Budget baseline is Project.budget; adjusted budget includes approved variation additions minus omissions.",
      "Valuation uses BOQ measured actuals (actualQty * unitRate). Project.spent is the denormalized BOQ measured cache.",
      "Expenses and payments are transaction records; approved expenses are commitments, net paid excludes reversed payments.",
    ],
  });
});

businessRouter.post("/expenses", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  if (!["administrator", "project_manager"].includes(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const body = parseOr400(expenseCreateSchema, req.body ?? {}, req, res);
  if (!body) return;
  if (!(await ensureProjectAccess(req, res, auth.session, body.projectId))) return;
  const portal = portalForSession(auth.session);
  return withIdempotency(req, res, `business:expenses:create:${auth.session.id}`, body, async () => {
    res.setHeader("cache-control", "no-store");
    return runAction(req, portal, auth.session, {
      type: "create-expense",
      input: { ...body, currency: body.currency ?? "RWF", vendor: body.vendor ?? "" },
      stamp: stamp(auth.session),
    }, 201);
  });
});

businessRouter.post("/expenses/:id/submit", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  if (!["administrator", "project_manager"].includes(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readStateOr503(req, res);
  if (!state) return;
  const expense = (state.expenses ?? []).find((e: any) => e.id === id);
  if (!expense) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, expense.projectId, state))) return;
  return withAction(req, res, portalForSession(auth.session), auth.session, { type: "submit-expense", id, stamp: stamp(auth.session) });
});

businessRouter.post("/expenses/:id/decide", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(expenseDecisionSchema, req.body ?? {}, req, res);
  if (!body) return;
  if (body.decision === "rejected" && (body.note ?? "").trim().length < 3) {
    return apiError(res, 400, "validation-failed", { message: "Rejection note must be at least 3 characters.", requestId: req.requestId });
  }
  const state = await readStateOr503(req, res);
  if (!state) return;
  const expense = (state.expenses ?? []).find((e: any) => e.id === id);
  if (!expense) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, expense.projectId, state))) return;
  return withAction(req, res, "administrator", auth.session, { type: "decide-expense", id, decision: body.decision, note: body.note ?? "", stamp: stamp(auth.session) });
});

businessRouter.post("/expenses/:id/cancel", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(expenseCancelSchema, req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const expense = (state.expenses ?? []).find((e: any) => e.id === id);
  if (!expense) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, expense.projectId, state))) return;
  return withAction(req, res, "administrator", auth.session, { type: "cancel-expense", id, note: body.note ?? "", stamp: stamp(auth.session) });
});

// 9. Payment transactions (financial lifecycle).
const paymentMethodSchema = z.enum(["cash", "bank_transfer", "mobile_money", "cheque", "other"]);
const paymentCreateSchema = z.object({
  projectId: z.string().min(1),
  expenseId: z.string().min(1),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().min(1).max(8).optional(),
  method: paymentMethodSchema,
  reference: z.string().trim().max(200).optional(),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
const paymentNoteSchema = z.object({ note: z.string().trim().max(1000).optional() });
const paymentPaidSchema = z.object({ note: z.string().trim().max(1000).optional(), paidAt: z.string().datetime().nullable().optional() });
const paymentFailSchema = z.object({ note: z.string().trim().min(3).max(1000) });

businessRouter.get("/payments", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const expenseId = typeof req.query.expenseId === "string" ? req.query.expenseId : undefined;
  if (projectId && !(await ensureProjectAccess(req, res, auth.session, projectId))) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const allowed = new Set(scopedProjects(state, auth.session).map((p: any) => p.id));
  const payments = (state.payments ?? []).filter((p: any) =>
    allowed.has(p.projectId) && (!projectId || p.projectId === projectId) && (!expenseId || p.expenseId === expenseId));
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, payments });
});

businessRouter.post("/payments", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  if (!["administrator", "project_manager"].includes(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const body = parseOr400(paymentCreateSchema, req.body ?? {}, req, res);
  if (!body) return;
  if (!(await ensureProjectAccess(req, res, auth.session, body.projectId))) return;
  const portal = portalForSession(auth.session);
  return withIdempotency(req, res, `business:payments:create:${auth.session.id}`, body, async () => {
    res.setHeader("cache-control", "no-store");
    return runAction(req, portal, auth.session, {
      type: "create-payment",
      input: { ...body, currency: body.currency ?? "RWF", reference: body.reference ?? "", scheduledFor: body.scheduledFor ?? null },
      stamp: stamp(auth.session),
    }, 201);
  });
});

businessRouter.post("/payments/:id/approve", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(paymentNoteSchema, req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const payment = (state.payments ?? []).find((p: any) => p.id === id);
  if (!payment) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, payment.projectId, state))) return;
  return withAction(req, res, "administrator", auth.session, { type: "approve-payment", id, note: body.note ?? "", stamp: stamp(auth.session) });
});

businessRouter.post("/payments/:id/paid", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(paymentPaidSchema, req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const payment = (state.payments ?? []).find((p: any) => p.id === id);
  if (!payment) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, payment.projectId, state))) return;
  return withAction(req, res, "administrator", auth.session, { type: "mark-payment-paid", id, note: body.note ?? "", paidAt: body.paidAt ?? null, stamp: stamp(auth.session) });
});

businessRouter.post("/payments/:id/fail", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(paymentFailSchema, req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const payment = (state.payments ?? []).find((p: any) => p.id === id);
  if (!payment) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, payment.projectId, state))) return;
  return withAction(req, res, "administrator", auth.session, { type: "fail-payment", id, note: body.note, stamp: stamp(auth.session) });
});

businessRouter.post("/payments/:id/cancel", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(paymentNoteSchema, req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const payment = (state.payments ?? []).find((p: any) => p.id === id);
  if (!payment) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, payment.projectId, state))) return;
  return withAction(req, res, "administrator", auth.session, { type: "cancel-payment", id, note: body.note ?? "", stamp: stamp(auth.session) });
});

businessRouter.post("/payments/:id/reverse", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(paymentFailSchema, req.body ?? {}, req, res);
  if (!body) return; // note min 3 required by schema
  const state = await readStateOr503(req, res);
  if (!state) return;
  const payment = (state.payments ?? []).find((p: any) => p.id === id);
  if (!payment) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, payment.projectId, state))) return;
  return withAction(req, res, "administrator", auth.session, { type: "reverse-payment", id, note: body.note, stamp: stamp(auth.session) });
});

// 10. Approved variation records (QS submits, management reviews).
const variationCreateSchema = z.object({
  projectId: z.string().min(1),
  boqItemId: z.string().min(1).nullable().optional(),
  reference: z.string().trim().max(120).optional(),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(2000),
  reason: z.string().trim().min(3).max(2000),
  type: z.enum(["addition", "omission"]),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().min(1).max(8).optional(),
});
const variationDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1000).optional(),
});
const variationNoteSchema = z.object({ note: z.string().trim().max(1000).optional() });

businessRouter.get("/variations", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  if (projectId && !(await ensureProjectAccess(req, res, auth.session, projectId))) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const allowed = new Set(scopedProjects(state, auth.session).map((p: any) => p.id));
  const variations = (state.variations ?? []).filter((v: any) => allowed.has(v.projectId) && (!projectId || v.projectId === projectId));
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, variations });
});

businessRouter.post("/variations", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  if (!["administrator", "quantity_surveyor"].includes(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const body = parseOr400(variationCreateSchema, req.body ?? {}, req, res);
  if (!body) return;
  if (!(await ensureProjectAccess(req, res, auth.session, body.projectId))) return;
  const portal = portalForSession(auth.session);
  return withIdempotency(req, res, `business:variations:create:${auth.session.id}`, body, async () => {
    res.setHeader("cache-control", "no-store");
    return runAction(req, portal, auth.session, {
      type: "create-variation",
      input: {
        ...body,
        boqItemId: body.boqItemId ?? null,
        reference: body.reference ?? "",
        currency: body.currency ?? "RWF",
      },
      stamp: stamp(auth.session),
    }, 201);
  });
});

businessRouter.patch("/variations/:id", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  if (!["administrator", "quantity_surveyor"].includes(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(variationCreateSchema, req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const variation = (state.variations ?? []).find((v: any) => v.id === id);
  if (!variation) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, variation.projectId, state))) return;
  if (body.projectId !== variation.projectId) return apiError(res, 400, "validation-failed", { message: "projectId cannot be changed.", requestId: req.requestId });
  return withAction(req, res, portalForSession(auth.session), auth.session, {
    type: "update-variation",
    id,
    input: { ...body, boqItemId: body.boqItemId ?? null, reference: body.reference ?? "", currency: body.currency ?? variation.currency ?? "RWF" },
    stamp: stamp(auth.session),
  });
});

businessRouter.post("/variations/:id/submit", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  if (!["administrator", "quantity_surveyor"].includes(auth.session.role)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readStateOr503(req, res);
  if (!state) return;
  const variation = (state.variations ?? []).find((v: any) => v.id === id);
  if (!variation) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, variation.projectId, state))) return;
  return withAction(req, res, portalForSession(auth.session), auth.session, { type: "submit-variation", id, stamp: stamp(auth.session) });
});

businessRouter.post("/variations/:id/open-review", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readStateOr503(req, res);
  if (!state) return;
  const variation = (state.variations ?? []).find((v: any) => v.id === id);
  if (!variation) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, variation.projectId, state))) return;
  return withAction(req, res, "administrator", auth.session, { type: "open-variation-review", id, stamp: stamp(auth.session) });
});

businessRouter.post("/variations/:id/decide", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(variationDecisionSchema, req.body ?? {}, req, res);
  if (!body) return;
  if (body.decision === "rejected" && (body.note ?? "").trim().length < 3) {
    return apiError(res, 400, "validation-failed", { message: "Rejection note must be at least 3 characters.", requestId: req.requestId });
  }
  const state = await readStateOr503(req, res);
  if (!state) return;
  const variation = (state.variations ?? []).find((v: any) => v.id === id);
  if (!variation) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, variation.projectId, state))) return;
  return withAction(req, res, "administrator", auth.session, { type: "decide-variation", id, decision: body.decision, note: body.note ?? "", stamp: stamp(auth.session) });
});

businessRouter.post("/variations/:id/cancel", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const body = parseOr400(variationNoteSchema, req.body ?? {}, req, res);
  if (!body) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const variation = (state.variations ?? []).find((v: any) => v.id === id);
  if (!variation) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, variation.projectId, state))) return;
  return withAction(req, res, "administrator", auth.session, { type: "cancel-variation", id, note: body.note ?? "", stamp: stamp(auth.session) });
});

businessRouter.delete("/variations/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readStateOr503(req, res);
  if (!state) return;
  const variation = (state.variations ?? []).find((v: any) => v.id === id);
  if (!variation) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (!(await ensureProjectAccess(req, res, auth.session, variation.projectId, state))) return;
  return withAction(req, res, "administrator", auth.session, { type: "delete-variation", id, stamp: stamp(auth.session) });
});

// 11. Historical cost changes (append-only).
businessRouter.get("/cost-changes", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const sourceType = typeof req.query.sourceType === "string" ? req.query.sourceType : undefined;
  const sourceId = typeof req.query.sourceId === "string" ? req.query.sourceId : undefined;
  if (projectId && !(await ensureProjectAccess(req, res, auth.session, projectId))) return;
  const state = await readStateOr503(req, res);
  if (!state) return;
  const allowed = new Set(scopedProjects(state, auth.session).map((p: any) => p.id));
  const costChanges = (state.costChanges ?? []).filter((c: any) =>
    allowed.has(c.projectId) &&
    (!projectId || c.projectId === projectId) &&
    (!sourceType || c.sourceType === sourceType) &&
    (!sourceId || c.sourceId === sourceId),
  );
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, costChanges });
});
