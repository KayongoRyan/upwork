/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { employeeSchema, engineerReportSchema, projectSchema, taskSchema, userSchema } from "@/lib/validations/schemas";
import { applyPortalAction, isPortalKey } from "@/lib/server/portal-store";
import { readState } from "@/lib/server/memory";
import { PersistenceError } from "@/lib/server/mongo";
import { apiError } from "../lib/api-response";
import { requireAnySession, requireSession } from "../lib/session";
import { canAccessProject, isAdmin } from "../lib/rbac";
import { verifyCsrfToken, setUserPassword, removeUserCredential, destroySessionsForUser } from "../lib/auth-bridge";

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
  console.error("[business] action failed", error);
  return apiError(res, 500, "action-failed", { requestId: req.requestId });
}

async function withAction(req: Request, res: Response, portal: any, session: any, action: any) {
  try {
    const state = await applyPortalAction(portal, action, session);
    res.setHeader("cache-control", "no-store");
    return res.json({ ok: true, state });
  } catch (error) {
    return handleActionError(error, req, res);
  }
}

// 1. Users and employees
businessRouter.get("/users", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const state = await readState();
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, items: state.users });
});

businessRouter.post("/users", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const body = req.body ?? {};
  const schema = userSchema.extend({ password: z.string().min(8).max(200) });
  const parsed = parseOr400(schema, body, req, res);
  if (!parsed) return;
  const state = await readState();
  if (state.users.some((u) => u.email.toLowerCase() === parsed.email.toLowerCase())) {
    return apiError(res, 409, "conflict", { message: "That email is already registered.", requestId: req.requestId });
  }
  const id = stamp(auth.session).id;
  try {
    await applyPortalAction("administrator", { type: "create-user", input: parsed, stamp: stamp(auth.session) } as any, auth.session);
    await setUserPassword(id, parsed.email, parsed.password);
    res.status(201).json({ ok: true, id });
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
  const parsed = parseOr400(userSchema.partial().extend({ email: z.string().trim().email().optional() }), req.body ?? {}, req, res);
  if (!parsed) return;
  const state = await readState();
  const existing = state.users.find((u) => u.id === id);
  if (!existing) return apiError(res, 404, "not-found", { requestId: req.requestId });
  const input = { ...existing, ...parsed, projectId: parsed.projectId ?? existing.projectId };
  return withAction(req, res, "administrator", auth.session, { type: "update-user", id, input, stamp: stamp(auth.session) });
});

businessRouter.patch("/users/:id/status", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const status = String((req.body ?? {}).status);
  if (status !== "active" && status !== "inactive") return apiError(res, 400, "validation-failed", { message: "Invalid status.", requestId: req.requestId });
  const result = await withAction(req, res, "administrator", auth.session, { type: "set-user-status", id, status, stamp: stamp(auth.session) });
  if (status !== "active") await destroySessionsForUser(id);
  return result;
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
    res.json({ ok: true });
  } catch (error) {
    return handleActionError(error, req, res);
  }
});

businessRouter.get("/employees", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const state = await readState();
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
  const state = await readState();
  if (state.employees.some((e) => e.employeeCode.toLowerCase() === parsed.employeeCode.toLowerCase())) {
    return apiError(res, 409, "conflict", { message: "That employee ID is already in use.", requestId: req.requestId });
  }
  return withAction(req, res, "administrator", auth.session, { type: "create-employee", input: parsed, stamp: stamp(auth.session) });
});

businessRouter.patch("/employees/:id", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.params.id);
  const state = await readState();
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
