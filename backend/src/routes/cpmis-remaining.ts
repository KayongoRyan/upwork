/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { billLines, sameBill, estimateFor, expenditureFor, lineActual, lineEstimate } from "@/lib/boq";
import { isManagerFieldNotice } from "@/lib/notices";
import { nextId, fullName, buildCsv, formatMoney } from "@/lib/utils";
import { overlapsRange } from "@/lib/metrics";
import { readValidatedUploadFile } from "@/lib/server/file-validation";
import { readCostEdits } from "@/lib/server/cost-lines";
import { costReportPdf } from "@/lib/server/cost-pdf";
import { createXlsx } from "@/lib/server/xlsx";
import { buildPredictiveAnalytics } from "@/lib/server/predictive-analytics";
import { internalService, InternalServiceError } from "../lib/internalServiceClient.js";
import { PersistenceError } from "@/lib/server/mongo";
import { readState } from "@/lib/server/memory";
import { apiError } from "../lib/api-response";
import {
  LifecycleActionError,
  applyPortalAction,
  type PortalKey,
} from "@/lib/server/portal-store";
import {
  setUserPassword,
  checkLoginRateLimit,
  hashPassword,
  createSessionForUser,
  portalHome,
  PORTAL_ROLE,
  setUserPasswordHash,
  removeUserCredential,
} from "@/lib/server/auth";
import { createSignupOtp, normalizeSignupEmail, normalizeSignupPhone, verifySignupOtp } from "@/lib/server/otp";
import { verifyCsrfToken, applySessionCookieToExpress } from "../lib/auth-bridge";
import { requireAnySession, requireSession } from "../lib/session";
import { userSchema, projectSchema, employeeSchema, engineerReportSchema } from "@/lib/validations/schemas";
import { isVertexaNotificationId, markAllVertexaNotificationsRead, markVertexaNotificationRead } from "@/lib/server/vertexa-api";
import type { AdminState, AppNotification, ReportPhoto, UserAccount, WorkKind } from "@/types";

export const cpmisRemainingRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// session validation centralized in ../lib/session

function redirect(res: Response, path: string, query: Record<string, string> = {}, hash = "") {
  const url = new URL(path, "http://localhost");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const target = url.pathname + url.search + (hash ? `#${hash}` : "");
  return res.redirect(303, target);
}

async function persistOrRedirect<T>(work: () => Promise<T>, onFailure: (message?: string) => T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof LifecycleActionError) {
      return onFailure(error.message);
    }
    if (error instanceof PersistenceError) {
      console.error("[persistence] The change was not saved.", error);
      return onFailure();
    }
    throw error;
  }
}

function stamp(session: any, id = nextId("act")) {
  return { id, at: new Date().toISOString(), notificationId: `ntf-${id}`, actorId: session.id, actorName: `${session.firstName} ${session.lastName}`, actorRole: session.role };
}
// --- state (admin diagnostics) ---
cpmisRemainingRouter.get("/state", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  res.setHeader("cache-control", "no-store");
  res.json(await readState());
});

// --- users ---
cpmisRemainingRouter.post("/users", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const parsed = userSchema.safeParse({
    firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone,
    role: form.role, projectId: form.projectId || "unassigned", status: form.status,
  });
  const password = String(form.password ?? "");
  if (!parsed.success) return redirect(res, "/admin/users", { add: "1", error: parsed.error.issues[0]?.message ?? "Check the form and try again." });
  if (password.length < 8) return redirect(res, "/admin/users", { add: "1", error: "Password must be at least 8 characters." });
  const email = parsed.data.email.trim().toLowerCase();
  const state = await readState();
  if (state.users.some((user) => user.email.toLowerCase() === email)) return redirect(res, "/admin/users", { add: "1", error: "That email is already registered." });
  const id = nextId("act");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("administrator", { type: "create-user", input: parsed.data, stamp: stamp(auth.session, id) } as any, auth.session);
      try {
        await setUserPassword(id, parsed.data.email, password);
      } catch (error) {
        console.error("[cpmis] legacy create-user credential persistence failed; rolling back user", error);
        try { await removeUserCredential(id); } catch (cleanupError) { console.error("[cpmis] legacy create-user credential cleanup failed", cleanupError); }
        try { await applyPortalAction("administrator", { type: "delete-user", id, stamp: stamp(auth.session) } as any, auth.session); } catch (rollbackError) { console.error("[cpmis] legacy create-user rollback failed", rollbackError); }
        throw error instanceof PersistenceError ? error : new PersistenceError(error);
      }
      return redirect(res, "/admin/users");
    },
    () => redirect(res, "/admin/users", { add: "1", error: "The account could not be saved. Try again." }),
  );
});

// --- projects ---
cpmisRemainingRouter.post("/projects", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const parsed = projectSchema.safeParse({
    name: form.name, code: form.code, description: form.description, client: form.client, location: form.location,
    managerId: form.managerId, startDate: form.startDate, expectedEndDate: form.expectedEndDate,
    budget: form.budget, spent: form.spent || 0, progress: form.progress || 0, status: form.status,
  });
  if (!parsed.success) return redirect(res, "/admin/projects", { create: "1", error: parsed.error.issues[0]?.message ?? "Check the form and try again." });
  const code = parsed.data.code.trim().toUpperCase();
  const state = await readState();
  if (state.projects.some((project) => project.code.toUpperCase() === code)) return redirect(res, "/admin/projects", { create: "1", error: "That project code is already in use." });
  const id = nextId("act");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("administrator", { type: "create-project", input: parsed.data, stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` } } as any, auth.session);
      return redirect(res, `/admin/projects/${id}`);
    },
    () => redirect(res, "/admin/projects", { create: "1", error: "The project could not be saved. Try again." }),
  );
});

// --- employees ---
cpmisRemainingRouter.post("/employees", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const parsed = employeeSchema.safeParse({
    employeeCode: form.employeeCode, firstName: form.firstName, lastName: form.lastName, position: form.position,
    department: form.department, phone: form.phone, email: form.email, projectId: form.projectId || "unassigned",
    status: form.status, hiredAt: form.hiredAt,
  });
  if (!parsed.success) return redirect(res, "/admin/employees", { register: "1", error: parsed.error.issues[0]?.message ?? "Check the form and try again." });
  const code = parsed.data.employeeCode.trim().toLowerCase();
  const state = await readState();
  if (state.employees.some((employee) => employee.employeeCode.toLowerCase() === code)) return redirect(res, "/admin/employees", { register: "1", error: "That employee ID is already in use." });
  const id = nextId("act");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("administrator", { type: "create-employee", input: parsed.data, stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` } } as any, auth.session);
      return redirect(res, "/admin/employees");
    },
    () => redirect(res, "/admin/employees", { register: "1", error: "The employee could not be saved. Try again." }),
  );
});

// --- help ---
cpmisRemainingRouter.post("/help", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const topics = new Map([["access", "Account access"], ["project", "Project record"], ["data", "Demonstration data"], ["other", "Something else"]]);
  const topic = topics.get(String(form.topic ?? ""));
  const message = String(form.message ?? "").trim();
  if (!topic) return redirect(res, "/admin/help", { error: "Choose a topic." });
  if (message.length < 12 || message.length > 2000) return redirect(res, "/admin/help", { error: "Write the note in a sentence or more." });
  const id = nextId("hlp");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("administrator", { type: "support-request", topic, message, stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` } } as any, auth.session);
      return redirect(res, "/admin/help", { saved: "1" }, `ntf-${id}`);
    },
    () => redirect(res, "/admin/help", { error: "The note could not be saved. Try again." }),
  );
});

// --- admin comments ---
const PORTALS = new Set(["project_manager", "site_engineer", "quantity_surveyor"]);
const TYPES = new Set(["unread", "project", "user", "status", "delay", "system"]);
const KINDS = new Set<WorkKind>(["project", "task", "report", "cost", "progress", "boq", "event"]);

function projectFor(state: AdminState, kind: WorkKind, workId: string) {
  if (kind === "project") return state.projects.some((project) => project.id === workId) ? workId : null;
  if (kind === "task") return state.tasks.find((task) => task.id === workId)?.projectId ?? null;
  if (kind === "report") return state.reports.find((report) => report.id === workId)?.projectId ?? null;
  if (kind === "cost") return (state.costReports ?? []).find((report) => report.id === workId)?.projectId ?? null;
  if (kind === "progress") return (state.progressMarks ?? []).find((mark) => mark.id === workId)?.projectId ?? null;
  if (kind === "boq") return state.boq.find((line) => line.id === workId)?.projectId ?? null;
  if (kind === "event") return (state.calendarEvents ?? []).some((event) => event.id === workId) ? "" : null;
  return null;
}
function onPortal(state: AdminState, portal: string, kind: WorkKind, workId: string, projectId: string) {
  if (portal === "project_manager") {
    if (kind === "event") return true;
    const project = state.projects.find((item) => item.id === projectId);
    return Boolean(project && state.users.some((user) => user.id === project.managerId && user.role === "project_manager"));
  }
  if (portal === "site_engineer") {
    if (kind === "report") {
      const report = state.reports.find((item) => item.id === workId);
      return Boolean(report && state.users.some((user) => user.id === report.engineerId && user.role === "site_engineer"));
    }
    if (kind === "task") {
      const task = state.tasks.find((item) => item.id === workId);
      return Boolean(task && state.users.some((user) => user.role === "site_engineer" && fullName(user) === task.assignee));
    }
    if (kind === "project") return state.users.some((user) => user.role === "site_engineer" && user.projectId === projectId);
    return false;
  }
  if (kind === "boq" || kind === "cost" || kind === "project") {
    return state.users.some((user) => user.role === "quantity_surveyor" && user.projectId === projectId);
  }
  return false;
}

cpmisRemainingRouter.post("/admin/comments", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const portal = String(form.portal ?? "");
  const type = String(form.type ?? "");
  const kind = String(form.kind ?? "") as WorkKind;
  const workId = String(form.workId ?? "");
  const body = String(form.body ?? "").trim();
  const query: Record<string, string> = {};
  if (PORTALS.has(portal)) query.portal = portal;
  if (TYPES.has(type)) query.type = type;
  const fail = (error: string) => redirect(res, "/admin/notifications", { ...query, error }, workId);
  if (!PORTALS.has(portal) || !KINDS.has(kind)) return fail("That work is not on this portal.");
  if (body.length < 3 || body.length > 500) return fail("Write a comment for the project manager.");
  const state = await readState();
  const projectId = projectFor(state, kind, workId);
  if (projectId == null || !onPortal(state, portal, kind, workId, projectId)) return fail("That work is not on this portal.");
  const id = nextId("cmt");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("administrator", { type: "add-work-comment", kind, workId, projectId, body, stamp: { id, at: new Date().toISOString() } } as any, auth.session);
      return redirect(res, "/admin/notifications", { ...query, commented: "1" }, workId);
    },
    () => fail("The comment could not be saved. Try again."),
  );
});

// --- notifications ---
const RETURNS = new Set(["/admin/notifications", "/pm/notifications", "/qs/notices"]);
const NOTIF_PORTALS = new Set(["project_manager", "site_engineer", "quantity_surveyor", "vertexa"]);
const NOTIF_TYPES = new Set(["unread", "project", "user", "status", "delay", "system"]);

function portalForReturn(back: string): PortalKey {
  if (back === "/pm/notifications") return "project_manager";
  if (back === "/qs/notices") return "quantity_surveyor";
  return "administrator";
}
function keptFilters(form: any) {
  const query: Record<string, string> = {};
  const portal = String(form.portal ?? "");
  const type = String(form.type ?? "");
  if (NOTIF_PORTALS.has(portal)) query.portal = portal;
  if (NOTIF_TYPES.has(type)) query.type = type;
  return query;
}
function notifVisible(state: AdminState, back: string, item: AppNotification, sessionId: string) {
  if (back === "/admin/notifications") return true;
  if (back === "/pm/notifications") {
    const projects = state.projects.filter((project) => project.managerId === sessionId);
    return isManagerFieldNotice(item, projects, sessionId);
  }
  const surveyor = state.users.find((user) => user.id === sessionId);
  const project = state.projects.find((p) => p.id === surveyor?.projectId);
  return project ? isManagerFieldNotice(item, [project]) : false;
}

cpmisRemainingRouter.post("/notifications", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const back = String(form.return ?? "");
  if (!RETURNS.has(back)) return redirect(res, "/admin/notifications");
  const query = back === "/admin/notifications" ? keptFilters(form) : {};

  const state = await readState();
  if (form.all === "1" || form.all === 1) {
    if (back !== "/admin/notifications") return redirect(res, back);
    return persistOrRedirect(
      async () => {
        await applyPortalAction("administrator", { type: "mark-all-notifications" } as any, auth.session);
        await markAllVertexaNotificationsRead();
        return redirect(res, back, { ...query, read: "all" });
      },
      () => redirect(res, back, { ...query, error: "The notices could not be marked read. Try again." }),
    );
  }

  const id = String(form.id ?? "");
  const readFlag = !(form.read === "0" || form.read === 0 || form.read === false);
  if (isVertexaNotificationId(id)) {
    await markVertexaNotificationRead(id, readFlag);
    return redirect(res, back, query, id);
  }

  const item = state.notifications.find((notice) => notice.id === id);
  if (!item || !notifVisible(state, back, item, auth.session.id)) return redirect(res, back, query);
  return persistOrRedirect(
    async () => {
      await applyPortalAction(portalForReturn(back), { type: "mark-notification", id, read: readFlag } as any, auth.session);
      return redirect(res, back, query, id);
    },
    () => redirect(res, back, { ...query, error: "The notice could not be updated. Try again." }, id),
  );
});

// --- reports CSV ---
cpmisRemainingRouter.get("/reports", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const from = String(req.query.from ?? "2025-01-01");
  const to = String(req.query.to ?? "2027-12-31");
  const projectId = String(req.query.project ?? "all");
  const state = await readState();
  const invalid = from > to;
  const projects = state.projects.filter((project) => {
    if (projectId !== "all" && project.id !== projectId) return false;
    if (invalid) return false;
    return overlapsRange(project, from, to);
  });
  const ids = new Set(projects.map((project) => project.id));
  const projectRows = projects.map((project) => {
    const manager = state.users.find((user) => user.id === project.managerId);
    return {
      Code: project.code, Name: project.name, Status: project.status, Progress: project.progress,
      BudgetRWF: project.budget, SpentRWF: project.spent,
      Manager: manager ? `${manager.firstName} ${manager.lastName}` : "Unassigned",
      Location: project.location, Start: project.startDate, ExpectedCompletion: project.expectedEndDate,
    };
  });
  const activityRows = state.tasks.filter((task) => ids.has(task.projectId)).map((task) => ({
    Activity: task.title,
    Project: state.projects.find((project) => project.id === task.projectId)?.code ?? "",
    Assignee: task.assignee, Status: task.status, Due: task.dueDate, TaskProgress: task.progress,
  }));
  const csv = `${buildCsv(projectRows)}\n\n${buildCsv(activityRows)}\n`;
  const stampName = projectId === "all" ? "all" : (projects[0]?.code ?? projectId);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="cpmis-${stampName}.csv"`);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(csv);
});

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }

function daysBetween(a: string | Date, b: string | Date) {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.round((db - da) / 86400000);
}

function plannedProgress(startDate: string, endDate: string, now = new Date()) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const t = now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (t <= start) return 0;
  if (t >= end) return 100;
  return clamp(((t - start) / (end - start)) * 100, 0, 100);
}

cpmisRemainingRouter.get("/reports/analytics", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const role = auth.session.role;
  if (!["administrator", "project_manager", "quantity_surveyor"].includes(role)) {
    return apiError(res, 403, "forbidden", { message: "You do not have access to project analytics.", requestId: req.requestId });
  }

  const projectId = String(req.query.projectId ?? req.query.project ?? "all");
  const state = await readState();
  const now = new Date();

  let projects = state.projects as any[];
  if (role === "project_manager") projects = projects.filter((p) => p.managerId === auth.session.id);
  if (role === "quantity_surveyor") projects = projects.filter((p) => p.id === auth.session.projectId);
  if (projectId !== "all") projects = projects.filter((p) => p.id === projectId);

  if (String(req.query.async) === "true") {
    const ids = new Set(projects.map((p: any) => p.id));
    const scoped = {
      ...state,
      projects: state.projects.filter((p: any) => ids.has(p.id)),
      tasks: (state.tasks as any[]).filter((t: any) => ids.has(t.projectId)),
      boq: ((state as any).boq ?? []).filter((b: any) => ids.has(b.projectId)),
      progressMarks: ((state as any).progressMarks ?? []).filter((m: any) => ids.has(m.projectId)),
      costReports: ((state as any).costReports ?? []).filter((r: any) => ids.has(r.projectId)),
      reports: ((state as any).reports ?? []).filter((r: any) => ids.has(r.projectId)),
      users: state.users,
    };
    try {
      const result = await internalService.createJob({
        type: "analytics.project",
        payload: { state: scoped, projectId },
        metadata: { source: "express", workflow: "reports.analytics", requestedBy: auth.session.id, requestId: req.requestId, async: true },
      });
      res.setHeader("cache-control", "no-store");
      return res.status(result?.deduped ? 200 : 202).json(result);
    } catch (error) {
      if (error instanceof InternalServiceError) return apiError(res, error.status >= 400 && error.status < 600 ? error.status : 502, error.code, { message: error.message, requestId: req.requestId });
      return apiError(res, 502, "internal-service-unavailable", { requestId: req.requestId });
    }
  }

  const tasks = (state.tasks as any[]).filter((t) => projects.some((p) => p.id === t.projectId));
  const boq = (state.boq as any[]).filter((b) => projects.some((p) => p.id === b.projectId));

  const projectMetrics = projects.map((project) => {
    const projectTasks = tasks.filter((t) => t.projectId === project.id);
    const projectBoq = boq.filter((b) => b.projectId === project.id);
    const completedTasks = projectTasks.filter((t) => t.status === "completed").length;
    const overdueTasks = projectTasks.filter((t) => t.status !== "completed" && t.dueDate && new Date(t.dueDate).getTime() < now.getTime()).length;
    const inProgressTasks = projectTasks.filter((t) => t.status === "in_progress").length;

    const planned = plannedProgress(project.startDate, project.expectedEndDate, now);
    const actualProgress = Number(project.progress ?? 0);
    const progressDeviation = planned === null ? null : Number((actualProgress - planned).toFixed(2));
    const scheduleDays = daysBetween(now, project.expectedEndDate);
    const scheduleStatus = project.status === "completed"
      ? "completed"
      : scheduleDays === null
        ? "unknown"
        : scheduleDays < 0
          ? "behind_schedule"
          : progressDeviation !== null && progressDeviation < -10
            ? "at_risk"
            : "on_track";

    const boqEstimated = projectBoq.reduce((sum, item) => sum + lineEstimate(item), 0);
    const boqActual = projectBoq.reduce((sum, item) => sum + lineActual(item), 0);
    const measurementVariance = boqActual - boqEstimated;
    const measurementVariancePct = boqEstimated === 0 ? null : Number(((measurementVariance / boqEstimated) * 100).toFixed(2));

    const budget = Number(project.budget ?? 0);
    const spent = Number(project.spent ?? 0);
    const costVariance = spent - budget;
    const costVariancePct = budget === 0 ? null : Number(((costVariance / budget) * 100).toFixed(2));

    const insights: string[] = [];
    if (progressDeviation !== null && progressDeviation <= -15) insights.push(`Progress is ${Math.abs(progressDeviation).toFixed(1)}% behind planned schedule.`);
    if (progressDeviation !== null && progressDeviation >= 10) insights.push(`Progress is ${progressDeviation.toFixed(1)}% ahead of planned schedule.`);
    if (scheduleDays !== null && scheduleDays < 0 && project.status !== "completed") insights.push(`Project is ${Math.abs(scheduleDays)} day(s) past expected completion.`);
    if (overdueTasks > 0) insights.push(`${overdueTasks} task(s) are overdue.`);
    if (costVariance > 0) insights.push(`Spent is ${formatMoney(costVariance, "RWF")} over budget.`);
    if (measurementVariance > 0) insights.push(`Actual BOQ measurements exceed estimate by ${formatMoney(measurementVariance, "RWF")}.`);
    if (budget > 0 && spent / budget >= 0.9 && project.status !== "completed") insights.push("Budget utilization is at or above 90%.");
    if (insights.length === 0) insights.push("No major deviation detected from current records.");

    return {
      projectId: project.id,
      code: project.code,
      name: project.name,
      status: project.status,
      managerId: project.managerId,
      startDate: project.startDate,
      expectedEndDate: project.expectedEndDate,
      progress: {
        actualPercent: actualProgress,
        plannedPercent: planned === null ? null : Number(planned.toFixed(2)),
        deviationPercent: progressDeviation,
        completedTasks,
        inProgressTasks,
        overdueTasks,
        totalTasks: projectTasks.length,
        taskCompletionPercent: projectTasks.length === 0 ? null : Number(((completedTasks / projectTasks.length) * 100).toFixed(2)),
      },
      measurements: {
        boqLineCount: projectBoq.length,
        estimatedAmount: boqEstimated,
        actualAmount: boqActual,
        varianceAmount: measurementVariance,
        variancePercent: measurementVariancePct,
      },
      cost: {
        budget,
        spent,
        varianceAmount: costVariance,
        variancePercent: costVariancePct,
        utilizationPercent: budget === 0 ? null : Number(((spent / budget) * 100).toFixed(2)),
      },
      schedule: {
        daysToExpectedEnd: scheduleDays,
        status: scheduleStatus,
        overdueTasks,
      },
      insights,
    };
  });

  const portfolio = {
    projectCount: projectMetrics.length,
    activeProjects: projectMetrics.filter((p) => p.status === "active").length,
    completedProjects: projectMetrics.filter((p) => p.status === "completed").length,
    delayedProjects: projectMetrics.filter((p) => p.status === "delayed" || p.schedule.status === "behind_schedule").length,
    atRiskProjects: projectMetrics.filter((p) => p.schedule.status === "at_risk").length,
    averageProgress: projectMetrics.length === 0 ? 0 : Number((projectMetrics.reduce((s, p) => s + p.progress.actualPercent, 0) / projectMetrics.length).toFixed(2)),
    averagePlannedProgress: (() => { const vals = projectMetrics.map((p) => p.progress.plannedPercent).filter((v): v is number => v !== null); return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null; })(),
    totalBudget: projectMetrics.reduce((s, p) => s + p.cost.budget, 0),
    totalSpent: projectMetrics.reduce((s, p) => s + p.cost.spent, 0),
    totalCostVariance: projectMetrics.reduce((s, p) => s + p.cost.varianceAmount, 0),
    totalEstimatedMeasurement: projectMetrics.reduce((s, p) => s + p.measurements.estimatedAmount, 0),
    totalActualMeasurement: projectMetrics.reduce((s, p) => s + p.measurements.actualAmount, 0),
    totalMeasurementVariance: projectMetrics.reduce((s, p) => s + p.measurements.varianceAmount, 0),
    overdueTasks: projectMetrics.reduce((s, p) => s + p.progress.overdueTasks, 0),
  };

  const deviations = {
    costOverruns: projectMetrics.filter((p) => p.cost.varianceAmount > 0).map((p) => ({ projectId: p.projectId, code: p.code, name: p.name, varianceAmount: p.cost.varianceAmount, variancePercent: p.cost.variancePercent })),
    scheduleBehind: projectMetrics.filter((p) => (p.progress.deviationPercent ?? 0) < 0 || p.schedule.status === "behind_schedule").map((p) => ({ projectId: p.projectId, code: p.code, name: p.name, deviationPercent: p.progress.deviationPercent, daysToExpectedEnd: p.schedule.daysToExpectedEnd, status: p.schedule.status })),
    measurementOverruns: projectMetrics.filter((p) => p.measurements.varianceAmount > 0).map((p) => ({ projectId: p.projectId, code: p.code, name: p.name, varianceAmount: p.measurements.varianceAmount, variancePercent: p.measurements.variancePercent })),
  };

  res.setHeader("cache-control", "no-store");
  return res.json({
    ok: true,
    generatedAt: now.toISOString(),
    scope: { role, projectId },
    portfolio,
    deviations,
    projects: projectMetrics,
  });
});

cpmisRemainingRouter.get("/reports/predictive", async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const role = auth.session.role;
  if (!["administrator", "project_manager", "quantity_surveyor"].includes(role)) {
    return apiError(res, 403, "forbidden", { message: "You do not have access to predictive analytics.", requestId: req.requestId });
  }
  const projectId = String(req.query.projectId ?? req.query.project ?? "all");
  const state = await readState();
  let scoped = state;
  if (role === "project_manager") {
    const ids = new Set(state.projects.filter((p) => p.managerId === auth.session.id).map((p) => p.id));
    scoped = { ...state, projects: state.projects.filter((p) => ids.has(p.id)), tasks: state.tasks.filter((t) => ids.has(t.projectId)), boq: state.boq.filter((b) => ids.has(b.projectId)), progressMarks: (state.progressMarks ?? []).filter((m) => ids.has(m.projectId)), costReports: (state.costReports ?? []).filter((r) => ids.has(r.projectId)), reports: state.reports.filter((r) => ids.has(r.projectId)) } as any;
  } else if (role === "quantity_surveyor") {
    const ids = new Set(state.projects.filter((p) => p.id === auth.session.projectId).map((p) => p.id));
    scoped = { ...state, projects: state.projects.filter((p) => ids.has(p.id)), tasks: state.tasks.filter((t) => ids.has(t.projectId)), boq: state.boq.filter((b) => ids.has(b.projectId)), progressMarks: (state.progressMarks ?? []).filter((m) => ids.has(m.projectId)), costReports: (state.costReports ?? []).filter((r) => ids.has(r.projectId)), reports: state.reports.filter((r) => ids.has(r.projectId)) } as any;
  }
  if (projectId !== "all") {
    const ids = new Set(scoped.projects.filter((p) => p.id === projectId).map((p) => p.id));
    scoped = { ...scoped, projects: scoped.projects.filter((p) => ids.has(p.id)), tasks: scoped.tasks.filter((t) => ids.has(t.projectId)), boq: scoped.boq.filter((b) => ids.has(b.projectId)), progressMarks: (scoped.progressMarks ?? []).filter((m) => ids.has(m.projectId)), costReports: (scoped.costReports ?? []).filter((r) => ids.has(r.projectId)), reports: scoped.reports.filter((r) => ids.has(r.projectId)) } as any;
  }

  if (String(req.query.async) === "true") {
    try {
      const result = await internalService.createJob({
        type: "analytics.predictive",
        payload: { state: { ...scoped, users: state.users }, projectId },
        metadata: { source: "express", workflow: "reports.predictive", requestedBy: auth.session.id, requestId: req.requestId, async: true },
      });
      res.setHeader("cache-control", "no-store");
      return res.status(result?.deduped ? 200 : 202).json(result);
    } catch (error) {
      if (error instanceof InternalServiceError) return apiError(res, error.status >= 400 && error.status < 600 ? error.status : 502, error.code, { message: error.message, requestId: req.requestId });
      return apiError(res, 502, "internal-service-unavailable", { requestId: req.requestId });
    }
  }

  const analytics = buildPredictiveAnalytics(scoped);
  res.setHeader("cache-control", "no-store");
  return res.json({ ...analytics, scope: { role, projectId } });
});

cpmisRemainingRouter.get("/reports/workbook", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const from = String(req.query.from ?? "2025-01-01");
  const to = String(req.query.to ?? "2027-12-31");
  const projectId = String(req.query.project ?? "all");
  const state = await readState();
  const invalid = from > to;
  const projects = state.projects.filter((project) => {
    if (projectId !== "all" && project.id !== projectId) return false;
    if (invalid) return false;
    return overlapsRange(project, from, to);
  });
  const ids = new Set(projects.map((project) => project.id));

  if (String(req.query.async) === "true") {
    const scoped = {
      ...state,
      projects: state.projects.filter((p: any) => ids.has(p.id)),
      tasks: (state.tasks as any[]).filter((t: any) => ids.has(t.projectId)),
      boq: ((state as any).boq ?? []).filter((b: any) => ids.has(b.projectId)),
      progressMarks: ((state as any).progressMarks ?? []).filter((m: any) => ids.has(m.projectId)),
      costReports: ((state as any).costReports ?? []).filter((r: any) => ids.has(r.projectId)),
      reports: ((state as any).reports ?? []).filter((r: any) => ids.has(r.projectId)),
      users: state.users,
    };
    try {
      const result = await internalService.createJob({
        type: "report.project-workbook",
        payload: { state: scoped, projectId, from, to },
        metadata: { source: "express", workflow: "reports.workbook", requestedBy: auth.session.id, requestId: req.requestId, async: true },
      });
      res.setHeader("cache-control", "no-store");
      return res.status(result?.deduped ? 200 : 202).json(result);
    } catch (error) {
      if (error instanceof InternalServiceError) return apiError(res, error.status >= 400 && error.status < 600 ? error.status : 502, error.code, { message: error.message, requestId: req.requestId });
      return apiError(res, 502, "internal-service-unavailable", { requestId: req.requestId });
    }
  }

  const usersById = new Map(state.users.map((u) => [u.id, u]));
  const projectRows: (string | number)[][] = [[
    "Code","Name","Status","Progress %","Budget (RWF)","Spent (RWF)","Measured Estimate (RWF)","Measured Actual (RWF)","Variance (RWF)","Manager","Location","Start","Expected Completion"
  ]];
  let totalBudget = 0, totalSpent = 0, totalEstimate = 0, totalActual = 0;
  for (const project of projects) {
    const manager = usersById.get(project.managerId);
    const estimate = estimateFor(state.boq, project.id);
    const actual = expenditureFor(state.boq, project.id);
    const variance = actual - estimate;
    totalBudget += project.budget; totalSpent += project.spent; totalEstimate += estimate; totalActual += actual;
    projectRows.push([
      project.code, project.name, project.status, project.progress,
      project.budget, project.spent, estimate, actual, variance,
      manager ? `${manager.firstName} ${manager.lastName}` : "Unassigned",
      project.location, project.startDate, project.expectedEndDate,
    ]);
  }
  projectRows.push(["TOTAL","","","", totalBudget, totalSpent, totalEstimate, totalActual, totalActual - totalEstimate, "", "", "", ""]);

  const boqRows: (string | number)[][] = [[
    "Project Code","Project","BOQ Code","Description","Unit","Estimated Qty","Actual Qty","Unit Rate (RWF)","Estimated (RWF)","Actual (RWF)","Variance (RWF)"
  ]];
  for (const item of state.boq.filter((b) => ids.has(b.projectId)).sort((a,b)=> (a.projectId+a.code).localeCompare(b.projectId+b.code))) {
    const project = projects.find((p) => p.id === item.projectId);
    const est = lineEstimate(item); const act = lineActual(item);
    boqRows.push([project?.code ?? "", project?.name ?? "", item.code, item.description, item.unit, item.estimatedQty, item.actualQty, item.unitRate, est, act, act - est]);
  }

  const costRows: (string | number)[][] = [[
    "Report ID","Project Code","Project","Status","Submitted By","Submitted At","Line Code","Description","Unit","Estimated Qty","Actual Qty","Unit Rate (RWF)","Estimated (RWF)","Actual (RWF)","Variance (RWF)"
  ]];
  for (const report of (state.costReports ?? []).filter((r) => ids.has(r.projectId))) {
    const project = projects.find((p) => p.id === report.projectId);
    const submitter = report.submittedBy ? usersById.get(report.submittedBy) : null;
    const submitterName = submitter ? `${submitter.firstName} ${submitter.lastName}` : "";
    const submittedAt = report.submittedAt ?? "";
    const lines = report.lines?.length ? report.lines : billLines(state.boq, report.projectId);
    if (lines.length === 0) {
      costRows.push([report.id, project?.code ?? "", project?.name ?? "", report.status, submitterName, submittedAt, "", "", "", 0, 0, 0, 0, 0, 0]);
      continue;
    }
    for (const line of lines) {
      const est = lineEstimate(line); const act = lineActual(line);
      costRows.push([report.id, project?.code ?? "", project?.name ?? "", report.status, submitterName, submittedAt, line.code, line.description, line.unit, line.estimatedQty, line.actualQty, line.unitRate, est, act, act - est]);
    }
  }

  const summaryRows: (string | number)[][] = [
    ["CPMIS Financial Workbook"],
    ["Generated At", new Date().toISOString()],
    ["From", from],
    ["To", to],
    ["Project Filter", projectId === "all" ? "All projects" : (projects[0]?.code ?? projectId)],
    [],
    ["Metric", "Value (RWF / %)"],
    ["Projects Included", projects.length],
    ["Total Budget (RWF)", totalBudget],
    ["Total Spent (RWF)", totalSpent],
    ["Total Measured Estimate (RWF)", totalEstimate],
    ["Total Measured Actual (RWF)", totalActual],
    ["Total Variance (RWF)", totalActual - totalEstimate],
    ["Budget Utilization (Actual/Budget %)", totalBudget > 0 ? Math.round((totalActual / totalBudget) * 10000) / 100 : 0],
  ];

  const workbook = createXlsx([
    { name: "Summary", rows: summaryRows },
    { name: "Projects", rows: projectRows },
    { name: "BOQ", rows: boqRows },
    { name: "Cost Reports", rows: costRows },
  ]);
  const stampName = projectId === "all" ? "all" : (projects[0]?.code ?? projectId);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="cpmis-financial-${stampName}.xlsx"`);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(workbook);
});

cpmisRemainingRouter.get("/reports/monthly-progress", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const monthRaw = String(req.query.month ?? new Date().toISOString().slice(0, 7));
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(monthRaw);
  if (!monthMatch) return apiError(res, 400, "validation-failed", { message: "month must be YYYY-MM.", requestId: req.requestId });
  const year = Number(monthMatch[1]);
  const monthIndex = Number(monthMatch[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return apiError(res, 400, "validation-failed", { message: "month must be YYYY-MM.", requestId: req.requestId });
  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
  const from = monthStart.toISOString().slice(0, 10);
  const to = monthEnd.toISOString().slice(0, 10);
  const projectId = String(req.query.project ?? "all");
  const state = await readState();
  const projects = state.projects.filter((project) => {
    if (projectId !== "all" && project.id !== projectId) return false;
    return overlapsRange(project, from, to);
  });
  const ids = new Set(projects.map((project) => project.id));

  if (String(req.query.async) === "true") {
    const scoped = {
      ...state,
      projects: state.projects.filter((p: any) => ids.has(p.id)),
      tasks: (state.tasks as any[]).filter((t: any) => ids.has(t.projectId)),
      boq: ((state as any).boq ?? []).filter((b: any) => ids.has(b.projectId)),
      progressMarks: ((state as any).progressMarks ?? []).filter((m: any) => ids.has(m.projectId)),
      costReports: ((state as any).costReports ?? []).filter((r: any) => ids.has(r.projectId)),
      reports: ((state as any).reports ?? []).filter((r: any) => ids.has(r.projectId)),
      users: state.users,
    };
    try {
      const result = await internalService.createJob({
        type: "report.monthly-progress",
        payload: { state: scoped, month: monthRaw, projectId },
        metadata: { source: "express", workflow: "reports.monthly-progress", requestedBy: auth.session.id, requestId: req.requestId, async: true },
      });
      res.setHeader("cache-control", "no-store");
      return res.status(result?.deduped ? 200 : 202).json(result);
    } catch (error) {
      if (error instanceof InternalServiceError) return apiError(res, error.status >= 400 && error.status < 600 ? error.status : 502, error.code, { message: error.message, requestId: req.requestId });
      return apiError(res, 502, "internal-service-unavailable", { requestId: req.requestId });
    }
  }

  const usersById = new Map(state.users.map((u) => [u.id, u]));

  const inMonth = (value?: string | null) => {
    if (!value) return false;
    const t = Date.parse(value);
    return Number.isFinite(t) && t >= monthStart.getTime() && t <= monthEnd.getTime();
  };

  const summaryRows: (string | number)[][] = [
    ["CPMIS Monthly Progress Report"],
    ["Generated At", new Date().toISOString()],
    ["Month", monthRaw],
    ["Period Start", from],
    ["Period End", to],
    ["Project Filter", projectId === "all" ? "All projects" : (projects[0]?.code ?? projectId)],
    [],
    ["Metric", "Value"],
    ["Projects Included", projects.length],
    ["Total Tasks", state.tasks.filter((t) => ids.has(t.projectId)).length],
    ["Tasks Completed", state.tasks.filter((t) => ids.has(t.projectId) && t.status === "done").length],
    ["Site Reports In Month", state.reports.filter((r) => ids.has(r.projectId) && inMonth(r.submittedAt ?? r.periodEnd ?? r.periodStart)).length],
    ["Progress Marks In Month", (state.progressMarks ?? []).filter((m) => ids.has(m.projectId) && inMonth(m.recordedAt)).length],
  ];

  const projectRows: (string | number)[][] = [[
    "Code", "Name", "Manager", "Status", "Current Progress %", "Budget (RWF)", "Spent (RWF)", "BOQ Estimated (RWF)", "BOQ Actual (RWF)", "BOQ Variance (RWF)",
    "Tasks Total", "Tasks Done", "Tasks Open", "Task Completion %", "Site Reports (Month)", "Approved Reports (Month)", "Pending Review Reports (Month)", "Rejected Reports (Month)", "Progress Marks (Month)", "Latest Progress Mark %", "Latest Progress Note"
  ]];
  for (const project of projects) {
    const manager = usersById.get(project.managerId);
    const projectTasks = state.tasks.filter((t) => t.projectId === project.id);
    const doneTasks = projectTasks.filter((t) => t.status === "done").length;
    const openTasks = projectTasks.length - doneTasks;
    const taskCompletion = projectTasks.length > 0 ? Math.round((doneTasks / projectTasks.length) * 10000) / 100 : 0;
    const monthReports = state.reports.filter((r) => r.projectId === project.id && inMonth(r.submittedAt ?? r.periodEnd ?? r.periodStart));
    const approved = monthReports.filter((r) => r.status === "approved").length;
    const pending = monthReports.filter((r) => r.status === "submitted" || r.status === "in_review").length;
    const rejected = monthReports.filter((r) => r.status === "rejected").length;
    const marks = (state.progressMarks ?? []).filter((m) => m.projectId === project.id && inMonth(m.recordedAt)).sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
    const latestMark = marks[0];
    const estimate = estimateFor(state.boq, project.id);
    const actual = expenditureFor(state.boq, project.id);
    projectRows.push([
      project.code,
      project.name,
      manager ? `${manager.firstName} ${manager.lastName}` : "Unassigned",
      project.status,
      project.progress,
      project.budget,
      project.spent,
      estimate,
      actual,
      actual - estimate,
      projectTasks.length,
      doneTasks,
      openTasks,
      taskCompletion,
      monthReports.length,
      approved,
      pending,
      rejected,
      marks.length,
      latestMark?.progress ?? "",
      latestMark?.note ?? "",
    ]);
  }

  const taskRows: (string | number)[][] = [[
    "Project Code", "Project", "Task", "Assignee", "Priority", "Status", "Due Date", "Progress %", "Completed In Month"
  ]];
  for (const task of state.tasks.filter((t) => ids.has(t.projectId))) {
    const project = projects.find((p) => p.id === task.projectId);
    const completedInMonth = task.status === "done" && inMonth((task as any).completedAt ?? task.dueDate);
    taskRows.push([project?.code ?? "", project?.name ?? "", task.title, task.assignee ?? "", (task as any).priority ?? "", task.status, task.dueDate, task.progress, completedInMonth ? "Yes" : "No"]);
  }

  const reportRows: (string | number)[][] = [[
    "Project Code", "Project", "Report ID", "Engineer", "Period Start", "Period End", "Submitted At", "Status", "Progress %", "Summary", "Issues"
  ]];
  for (const report of state.reports.filter((r) => ids.has(r.projectId) && inMonth(r.submittedAt ?? r.periodEnd ?? r.periodStart)).sort((a, b) => Date.parse(b.submittedAt ?? b.periodEnd) - Date.parse(a.submittedAt ?? a.periodEnd))) {
    const project = projects.find((p) => p.id === report.projectId);
    const engineer = usersById.get(report.engineerId);
    reportRows.push([
      project?.code ?? "", project?.name ?? "", report.id,
      engineer ? `${engineer.firstName} ${engineer.lastName}` : report.engineerId,
      report.periodStart, report.periodEnd, report.submittedAt ?? "", report.status, report.progress,
      report.summary ?? "", report.issues ?? "",
    ]);
  }

  const workbook = createXlsx([
    { name: "Summary", rows: summaryRows },
    { name: "Project Progress", rows: projectRows },
    { name: "Tasks", rows: taskRows },
    { name: "Site Reports", rows: reportRows },
  ]);
  const stampName = projectId === "all" ? "all" : (projects[0]?.code ?? projectId);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="monthly-progress-${monthRaw}-${stampName}.xlsx"`);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(workbook);
});

// --- pm reports ---
cpmisRemainingRouter.post("/pm/reports", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const parsed = engineerReportSchema.safeParse({
    projectId: form.projectId, engineerId: form.engineerId, periodStart: form.periodStart, periodEnd: form.periodEnd,
    progress: form.progress, summary: form.summary, issues: form.issues ?? "",
  });
  if (!parsed.success) return redirect(res, "/pm/reports", { error: parsed.error.issues[0]?.message ?? "Check the form and try again." });
  const state = await readState();
  const project = state.projects.find((item) => item.id === parsed.data.projectId && item.managerId === auth.session.id);
  const engineer = state.users.find((user) => user.id === parsed.data.engineerId && user.role === "site_engineer" && user.status === "active");
  if (!project) return redirect(res, "/pm/reports", { error: "Choose one of your projects." });
  if (!engineer) return redirect(res, "/pm/reports", { error: "Choose an active site engineer." });
  const id = nextId("act");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("project_manager", { type: "submit-report", input: parsed.data, toAdmin: true, stamp: stamp(auth.session, id) } as any, auth.session);
      return redirect(res, "/pm/reports", { sent: state.settings.profileName });
    },
    (msg) => redirect(res, "/pm/reports", { error: msg ?? "The report could not be saved. Try again." }),
  );
});

cpmisRemainingRouter.post("/pm/reports/open", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const id = String(req.body?.id ?? "");
  const state = await readState();
  const report = state.reports.find((item) => item.id === id);
  const project = report ? state.projects.find((item) => item.id === report.projectId) : undefined;
  const engineer = report ? state.users.find((user) => user.id === report.engineerId) : undefined;
  if (!report || !project || project.managerId !== auth.session.id) return redirect(res, "/pm/reports", { error: "That report is not on your portfolio." });
  if (report.status !== "submitted") return redirect(res, "/pm/reports", { error: "Only a submitted report can be opened for review." });
  const stampId = nextId("act");
  const sender = engineer ? `${engineer.firstName} ${engineer.lastName}` : "the sender";
  return persistOrRedirect(
    async () => {
      await applyPortalAction("project_manager", { type: "open-report-review", id, stamp: stamp(auth.session, stampId) } as any, auth.session);
      return redirect(res, "/pm/reports", { opened: sender }, id);
    },
    (msg) => redirect(res, "/pm/reports", { error: msg ?? "The review could not be opened. Try again." }, id),
  );
});

cpmisRemainingRouter.post("/pm/reports/decide", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const id = String(form.id ?? "");
  const note = String(form.note ?? "");
  const decision = String(form.decision ?? "");
  const state = await readState();
  const report = state.reports.find((item) => item.id === id);
  const project = report ? state.projects.find((item) => item.id === report.projectId) : undefined;
  const engineer = report ? state.users.find((user) => user.id === report.engineerId) : undefined;
  const sender = engineer ? `${engineer.firstName} ${engineer.lastName}` : "the sender";
  if (!report || !project || project.managerId !== auth.session.id) return redirect(res, "/pm/reports", { error: "That report is not on your portfolio." });
  if (report.status !== "in_review") return redirect(res, "/pm/reports", { error: "Start the review before you send a comment." }, id);
  if (decision !== "approved" && decision !== "rejected") return redirect(res, "/pm/reports", { error: "Choose send review or send rejection." }, id);
  if (note.trim().length < 3) return redirect(res, "/pm/reports", { error: "Write a comment for the person who sent this report." }, id);
  const stampId = nextId("act");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("project_manager", { type: "decide-report", id, decision, note, stamp: stamp(auth.session, stampId) } as any, auth.session);
      return redirect(res, "/pm/reports", { reviewSent: sender }, id);
    },
    (msg) => redirect(res, "/pm/reports", { error: msg ?? "The review could not be saved. Try again." }, id),
  );
});

// --- pm progress ---
cpmisRemainingRouter.post("/pm/progress", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const projectId = String(form.projectId ?? "");
  const raw = String(form.progress ?? "").trim();
  const note = String(form.note ?? "").trim();
  const state = await readState();
  const project = state.projects.find((item) => item.id === projectId && item.managerId === auth.session.id);
  if (!project) return redirect(res, "/pm/progress", { error: "That project is not on your portfolio." });
  if (project.status === "completed") return redirect(res, "/pm/progress", { error: "A completed project keeps its recorded progress." });
  if (!/^\d{1,3}$/.test(raw)) return redirect(res, "/pm/progress", { error: "Progress must be a whole number from 0 to 100." });
  const progress = Number(raw);
  if (progress > 100) return redirect(res, "/pm/progress", { error: "Progress must be a whole number from 0 to 100." });
  const id = nextId("act");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("project_manager", { type: "set-progress", id: project.id, progress, note, stamp: stamp(auth.session, id) } as any, auth.session);
      return redirect(res, "/pm/progress", { saved: project.code });
    },
    () => redirect(res, "/pm/progress", { error: "The progress update could not be saved. Try again." }),
  );
});

// --- pm events ---
cpmisRemainingRouter.post("/pm/events", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const period = String(form.period ?? "monthly");
  const title = String(form.title ?? "").trim();
  const date = String(form.date ?? "");
  const kind = form.kind === "other" ? "other" : "meeting";
  const back = { period, event: "1", day: date };
  if (title.length < 3 || title.length > 80) return redirect(res, "/pm", { ...back, error: "Name the event in a few words." }, "calendar");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return redirect(res, "/pm", { ...back, error: "Click a date on the calendar." }, "calendar");
  const id = nextId("evt");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("project_manager", { type: "add-calendar-event", title, kind, date, stamp: { id, at: new Date().toISOString() } } as any, auth.session);
      return redirect(res, "/pm", { period, day: date, added: title }, "calendar");
    },
    () => redirect(res, "/pm", { ...back, error: "The event could not be saved. Try again." }, "calendar"),
  );
});

// --- pm costs ---
cpmisRemainingRouter.post("/pm/costs", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(req.body ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => form.append(k, String(x)));
    else form.append(k, String(v));
  }
  const projectId = String(req.body?.projectId ?? "");
  const state = await readState();
  const project = state.projects.find((item) => item.id === projectId && item.managerId === auth.session.id);
  const surveyor = state.users.find((user) => user.role === "quantity_surveyor" && user.status === "active" && user.projectId === projectId);
  const rows = state.boq.filter((item) => item.projectId === projectId);
  if (!project) return redirect(res, "/pm/costs", { error: "That project is not on your portfolio." });
  if (!surveyor) return redirect(res, "/pm/costs", { error: "No quantity surveyor is assigned to that project." });
  if (rows.length === 0) return redirect(res, "/pm/costs", { error: "There is no bill to submit." });
  const fd = toFormData(req.body ?? {});
  const parsed = readCostEdits(fd, rows);
  if (!parsed.ok) return redirect(res, "/pm/costs", { error: parsed.error });
  const edited = nextId("act");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("project_manager", { type: "revise-cost-bill", projectId, lines: parsed.lines, stamp: stamp(auth.session, edited) } as any, auth.session);
      const fresh = await readState();
      const live = billLines(fresh.boq, projectId);
      const latest = (fresh.costReports ?? []).find((report) => report.projectId === projectId && ["submitted", "in_review", "approved"].includes(report.status));
      if (latest && sameBill(latest.lines, live)) return redirect(res, "/pm/costs", { error: "These figures are already with the administrator. Change a quantity or rate to send an update." });
      const id = nextId("act");
      await applyPortalAction("project_manager", { type: "submit-cost-report", projectId, surveyorId: surveyor.id, stamp: stamp(auth.session, id) } as any, auth.session);
      return redirect(res, "/pm/costs", { sent: fresh.settings.profileName });
    },
    (msg) => redirect(res, "/pm/costs", { error: msg ?? "The cost bill could not be saved. Try again." }),
  );
});

function toFormData(body: any): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, String(x)));
    else if (v !== undefined && v !== null) fd.append(k, String(v));
  }
  return fd;
}

cpmisRemainingRouter.post("/pm/costs/edit", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const projectId = String(req.body?.projectId ?? "");
  const state = await readState();
  const project = state.projects.find((item) => item.id === projectId && item.managerId === auth.session.id);
  if (!project) return redirect(res, "/pm/costs", { error: "That project is not on your portfolio." });
  const rows = state.boq.filter((item) => item.projectId === project.id);
  if (rows.length === 0) return redirect(res, "/pm/costs", { error: "There is no bill to edit." });
  const parsed = readCostEdits(toFormData(req.body ?? {}), rows);
  if (!parsed.ok) return redirect(res, "/pm/costs", { error: parsed.error });
  const id = nextId("act");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("project_manager", { type: "revise-cost-bill", projectId, lines: parsed.lines, stamp: stamp(auth.session, id) } as any, auth.session);
      return redirect(res, "/pm/costs", { edited: project.code });
    },
    (msg) => redirect(res, "/pm/costs", { error: msg ?? "The cost lines could not be saved. Try again." }),
  );
});

cpmisRemainingRouter.post("/pm/costs/pdf", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "project_manager");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const projectId = String(req.body?.projectId ?? "");
  const state = await readState();
  const project = state.projects.find((item) => item.id === projectId && item.managerId === auth.session.id);
  const rows = state.boq.filter((item) => item.projectId === projectId);
  if (!project) return redirect(res, "/pm/costs", { error: "That project is not on your portfolio." });
  if (rows.length === 0) return redirect(res, "/pm/costs", { error: "There is no bill to save." });
  const parsed = readCostEdits(toFormData(req.body ?? {}), rows);
  if (!parsed.ok) return redirect(res, "/pm/costs", { error: parsed.error });
  const surveyor = state.users.find((user) => user.role === "quantity_surveyor" && user.projectId === project.id);
  const pdf = costReportPdf({ code: project.code, name: project.name, surveyor: surveyor ? fullName(surveyor) : "Quantity surveyor", lines: parsed.lines });
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `attachment; filename="${project.code}-cost-report.pdf"`);
  return res.status(200).send(Buffer.from(pdf));
});

// --- qs reports ---
cpmisRemainingRouter.post("/qs/reports", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "quantity_surveyor");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const state = await readState();
  const surveyor = state.users.find((user) => user.id === auth.session.id && user.role === "quantity_surveyor" && user.status === "active");
  const project = surveyor?.projectId ? state.projects.find((item) => item.id === surveyor.projectId) : undefined;
  const manager = project ? state.users.find((user) => user.id === project.managerId) : undefined;
  if (!surveyor || !project || !manager) return redirect(res, "/qs/reports", { error: "No project is assigned to this account." });
  const lines = billLines(state.boq, project.id);
  if (lines.length === 0) return redirect(res, "/qs/reports", { error: "There is no bill to send." });
  const already = (state.costReports ?? []).some((report) => report.projectId === project.id && report.submittedBy === surveyor.id && sameBill(report.lines, lines));
  if (already) return redirect(res, "/qs/reports", { error: "These figures are already with your project manager." });
  const id = nextId("cst");
  return persistOrRedirect(
    async () => {
      await applyPortalAction("quantity_surveyor", { type: "send-cost-report", surveyorId: surveyor.id, stamp: stamp(auth.session, id) } as any, auth.session);
      return redirect(res, "/qs/reports", { sent: `${manager.firstName} ${manager.lastName}` });
    },
    (msg) => redirect(res, "/qs/reports", { error: msg ?? "The cost report could not be saved. Try again." }),
  );
});


// --- SE reports ---
const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 1_500_000;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

cpmisRemainingRouter.post("/se/reports", upload.array("photos", MAX_PHOTOS), async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "site_engineer");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const date = String(form.date ?? "");
  const summary = String(form.summary ?? "").trim();
  const issues = String(form.issues ?? "").trim();
  const progressRaw = String(form.progress ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) {
    return redirect(res, "/se/reports", { error: "Choose the report date." });
  }
  if (!/^\d{1,3}$/.test(progressRaw)) return redirect(res, "/se/reports", { error: "Enter project progress from 0 to 100." });
  const progress = Number(progressRaw);
  if (progress < 0 || progress > 100) return redirect(res, "/se/reports", { error: "Enter project progress from 0 to 100." });
  if (summary.length < 10) return redirect(res, "/se/reports", { error: "Describe the work done in at least 10 characters." });

  const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
  if (files.length > MAX_PHOTOS) return redirect(res, "/se/reports", { error: "Upload up to 4 photos." });
  const photos: ReportPhoto[] = [];
  const stampId = nextId("act");
  for (const file of files) {
    const fileObj = new File([new Uint8Array(file.buffer)], file.originalname || "photo.jpg", { type: file.mimetype || "application/octet-stream" });
    const mime = (file.mimetype || "").toLowerCase();
    if (mime && !ALLOWED_PHOTO_TYPES.has(mime)) {
      return redirect(res, "/se/reports", { error: "Photos must be JPG, PNG, GIF, or WebP." });
    }
    const validated = await readValidatedUploadFile(fileObj, MAX_PHOTO_BYTES);
    if (!validated.ok) return redirect(res, "/se/reports", { error: validated.error });
    const { bytes, fileName, contentType: fileType, size } = validated.value;
    if (!ALLOWED_PHOTO_TYPES.has(fileType.toLowerCase())) {
      return redirect(res, "/se/reports", { error: "Photos must be JPG, PNG, GIF, or WebP." });
    }
    let fileKey: string;
    try {
      const { putObject, saveFileMetadata, storageKeyForDocument } = await import("@/lib/server/storage");
      const stored = await putObject({ key: storageKeyForDocument("report", stampId, fileName), body: bytes, contentType: fileType, fileName });
      fileKey = stored.key;
      await saveFileMetadata({ key: fileKey, fileName, contentType: fileType, size, body: bytes, uploadedBy: auth.session.id, projectId: "report", documentId: stampId, revisionId: nextId("ph"), source: "report_photo" });
    } catch {
      return redirect(res, "/se/reports", { error: "The photo could not be stored. Try again." });
    }
    photos.push({ id: nextId("ph"), fileKey, name: fileName, type: fileType, size });
  }

  const state = await readState();
  const actor = state.users.find((user) => user.id === auth.session.id);
  if (!actor || !actor.projectId) return redirect(res, "/se/reports", { error: "Your account is not assigned to a project." });
  const pmId = state.users.find((user) => user.role === "project_manager" && user.status === "active" && user.projectId === actor.projectId)?.id;
  if (!pmId) return redirect(res, "/se/reports", { error: "No project manager is assigned to your project." });

  return persistOrRedirect(
    async () => {
      await applyPortalAction("site_engineer", {
        type: "submit-report",
        toAdmin: false,
        input: { projectId: actor.projectId!, engineerId: actor.id, periodStart: date, periodEnd: date, progress, summary, issues, photos },
        stamp: stamp(auth.session, stampId),
      } as any, auth.session);
      return redirect(res, "/se/reports", { sent: "1" }, stampId);
    },
    (msg) => redirect(res, "/se/reports", { error: msg ?? "The report could not be saved. Try again." }),
  );
});

// --- signup OTP ---
const signupSchema = z.object({
  portal: z.enum(["project_manager", "site_engineer", "quantity_surveyor"]),
  firstName: z.string().trim().min(2, "First name is required").max(80),
  lastName: z.string().trim().min(2, "Last name is required").max(80),
  phone: z.string().trim().min(8, "Enter a valid phone number").max(30).regex(/^[+\d\s().-]+$/, "Enter a valid phone number"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

function expressOriginError(req: Request, res: Response) {
  const origin = req.get("origin");
  if (!origin) return null;
  let originHost = "";
  try { originHost = new URL(origin).host; } catch { apiError(res, 403, "Invalid origin.", { requestId: req.requestId }); return true; }
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
  if (host && originHost !== host) { apiError(res, 403, "Invalid origin.", { requestId: req.requestId }); return true; }
  return null;
}

cpmisRemainingRouter.post("/auth/signup/request-otp", async (req: Request, res: Response) => {
  if (expressOriginError(req, res)) return;
  const parsed = signupSchema.safeParse(req.body ?? {});
  if (!parsed.success) return apiError(res, 400, "validation-failed", { message: parsed.error.issues[0]?.message ?? "Check the form.", requestId: req.requestId });
  const input = parsed.data;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "local";
  const limit = await checkLoginRateLimit(`signup:${ip}:${normalizeSignupEmail(input.email)}`);
  if (!limit.ok) return apiError(res, 429, "rate-limited", { message: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`, requestId: req.requestId });

  const state = await readState();
  const email = normalizeSignupEmail(input.email);
  const phone = normalizeSignupPhone(input.phone);
  if (state.users.some((u) => u.email.toLowerCase() === email)) {
    return apiError(res, 409, "An account with this email already exists. Sign in instead.", { requestId: req.requestId });
  }
  if (state.users.some((u) => (u as any).phone && normalizeSignupPhone(String((u as any).phone)) === phone)) {
    return apiError(res, 409, "An account with this phone number already exists.", { requestId: req.requestId });
  }

  try {
    const passwordHash = await hashPassword(input.password);
    const result = await createSignupOtp({ portal: input.portal as PortalKey, firstName: input.firstName, lastName: input.lastName, phone, email, passwordHash });
    if (!result.ok) return apiError(res, result.status, result.error, { requestId: req.requestId });
    return res.json({ ok: true, challengeId: result.challengeId, expiresAt: result.expiresAt, ...(result.demoOtp ? { demoOtp: result.demoOtp } : {}) });
  } catch (error) {
    if (error instanceof PersistenceError) return apiError(res, 503, "Sign-up could not be started. Try again.", { requestId: req.requestId });
    console.error("[cpmis] signup request-otp failed", error);
    return apiError(res, 500, "signup-failed", { requestId: req.requestId });
  }
});

const verifySchema = z.object({
  portal: z.enum(["project_manager", "site_engineer", "quantity_surveyor"]),
  challengeId: z.string().min(1),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

cpmisRemainingRouter.post("/auth/signup/verify-otp", async (req: Request, res: Response) => {
  if (expressOriginError(req, res)) return;
  const parsed = verifySchema.safeParse(req.body ?? {});
  if (!parsed.success) return apiError(res, 400, "validation-failed", { message: parsed.error.issues[0]?.message ?? "Check the code.", requestId: req.requestId });
  const { portal, challengeId, otp } = parsed.data;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "local";
  const limit = await checkLoginRateLimit(`signup-verify:${ip}:${challengeId}`);
  if (!limit.ok) return apiError(res, 429, "rate-limited", { message: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`, requestId: req.requestId });

  try {
    const verified = await verifySignupOtp(challengeId, otp, portal as PortalKey);
    if (!verified.ok) return apiError(res, verified.status, verified.error, { requestId: req.requestId });

    const state = await readState();
    const email = normalizeSignupEmail(verified.challenge.email);
    if (state.users.some((u) => u.email.toLowerCase() === email)) {
      return apiError(res, 409, "An account with this email already exists. Sign in instead.", { requestId: req.requestId });
    }

    const id = nextId("usr");
    const role = PORTAL_ROLE[portal as PortalKey];
    const user: UserAccount = {
      id,
      firstName: verified.challenge.firstName,
      lastName: verified.challenge.lastName,
      email,
      phone: verified.challenge.phone,
      role,
      projectId: null,
      status: "active",
    } as UserAccount;

    await applyPortalAction("administrator", { type: "create-user", input: { firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, role: user.role, projectId: "unassigned", status: "active" }, stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` } } as any);
    try {
      await setUserPasswordHash(id, user.email, verified.challenge.passwordHash);
    } catch (error) {
      console.error("[cpmis] signup credential persistence failed; rolling back user", error);
      try { await removeUserCredential(id); } catch (cleanupError) { console.error("[cpmis] signup credential cleanup failed", cleanupError); }
      try { await applyPortalAction("administrator", { type: "delete-user", id, stamp: { id: nextId("act"), at: new Date().toISOString(), notificationId: `ntf-${nextId("ntf")}` } } as any); } catch (rollbackError) { console.error("[cpmis] signup user rollback failed", rollbackError); }
      throw error instanceof PersistenceError ? error : new PersistenceError(error);
    }

    const session = await createSessionForUser(portal as PortalKey, { ...user, id });
    applySessionCookieToExpress(res, portal as PortalKey, session.token);
    return res.json({ ok: true, redirectTo: portalHome(portal as PortalKey) });
  } catch (error) {
    if (error instanceof PersistenceError) return apiError(res, 503, "Sign-up could not be completed. Try again.", { requestId: req.requestId });
    console.error("[cpmis] signup verify-otp failed", error);
    return apiError(res, 500, "signup-failed", { requestId: req.requestId });
  }
});
