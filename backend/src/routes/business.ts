/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { employeeSchema, engineerReportSchema, projectSchema, taskSchema, userSchema } from "@/lib/validations/schemas";
import { applyPortalAction } from "@/lib/server/portal-store";
import { readState } from "@/lib/server/memory";
import { PersistenceError } from "@/lib/server/mongo";
import { billLines, linesActual, linesEstimate, parseBoq } from "@/lib/boq";
import { apiError } from "../lib/api-response";
import { requireAnySession, requireSession } from "../lib/session";
import { canAccessProject, isAdmin } from "../lib/rbac";
import { verifyCsrfToken, setUserPassword, removeUserCredential, destroySessionsForUser } from "../lib/auth-bridge";
import { logger } from "../lib/logger";

export const businessRouter = Router();

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

function handleActionError(error: unknown, req: Request, res: Response) {
  if (error && typeof error === "object" && "name" in error && (error as any).name === "PortalActionError") {
    return apiError(res, 403, "forbidden", { message: "You are not authorized to perform this action.", requestId: req.requestId });
  }
  if (error instanceof PersistenceError) {
    return apiError(res, 503, "persistence-failed", { requestId: req.requestId });
  }
  logger.error("business.action_failed", error, { requestId: req.requestId, path: req.originalUrl, method: req.method });
  return apiError(res, 500, "action-failed", { requestId: req.requestId });
}

async function withAction(req: Request, res: Response, portal: any, session: any, action: any, status = 200) {
  try {
    const state = await applyPortalAction(portal, action, session);
    res.setHeader("cache-control", "no-store");
    return res.status(status).json({ ok: true, state });
  } catch (error) {
    return handleActionError(error, req, res);
  }
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
  const state = await readStateOr503(req, res);
  if (!state) return;
  if (state.users.some((u) => u.email.toLowerCase() === parsed.email.toLowerCase())) {
    return apiError(res, 409, "conflict", { message: "That email is already registered.", requestId: req.requestId });
  }
  const st = stamp(auth.session);
  try {
    await applyPortalAction("administrator", { type: "create-user", input: parsed, stamp: st } as any, auth.session);
    await setUserPassword(st.id, parsed.email, parsed.password);
    res.setHeader("cache-control", "no-store");
    res.status(201).json({ ok: true, id: st.id });
  } catch (error) {
    return handleActionError(error, req, res);
  }
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
  const input = { ...existing, ...parsed, projectId: parsed.projectId ?? existing.projectId };
  const result = await withAction(req, res, "administrator", auth.session, { type: "update-user", id, input, stamp: stamp(auth.session) });
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
  const state = await readStateOr503(req, res);
  if (!state) return;
  if (state.employees.some((e) => e.employeeCode.toLowerCase() === parsed.employeeCode.toLowerCase())) {
    return apiError(res, 409, "conflict", { message: "That employee ID is already in use.", requestId: req.requestId });
  }
  return withAction(req, res, "administrator", auth.session, { type: "create-employee", input: parsed, stamp: stamp(auth.session) }, 201);
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
  return withAction(req, res, "administrator", auth.session, { type: "create-project", input: parsed, stamp: stamp(auth.session) }, 201);
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
  return withAction(req, res, portal, auth.session, { type: "create-task", input: parsed, stamp: stamp(auth.session) }, 201);
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
  return withAction(req, res, portal, auth.session, { type: "submit-report", input: { ...parsed, photos: parsed.photos ?? [] }, photos: parsed.photos ?? [], toAdmin: parsed.toAdmin ?? (portal === "project_manager"), stamp: stamp(auth.session) }, 201);
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
  return withAction(req, res, "quantity_surveyor", auth.session, { type: "create-boq", surveyorId: auth.session.id, input, stamp: stamp(auth.session) }, 201);
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
  return withAction(req, res, "quantity_surveyor", auth.session, { type: "send-cost-report", surveyorId, stamp: stamp(auth.session) }, 201);
});

businessRouter.post("/cost-reports/submit", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const body = parseOr400(z.object({ projectId: z.string().min(1), surveyorId: z.string().min(1) }), req.body ?? {}, req, res);
  if (!body) return;
  if (!(await ensureProjectAccess(req, res, auth.session, body.projectId))) return;
  return withAction(req, res, "project_manager", auth.session, { type: "submit-cost-report", projectId: body.projectId, surveyorId: body.surveyorId, stamp: stamp(auth.session) }, 201);
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
