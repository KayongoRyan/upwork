/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { billLines, sameBill } from "@/lib/boq";
import { isManagerFieldNotice } from "@/lib/notices";
import { nextId, fullName, buildCsv } from "@/lib/utils";
import { overlapsRange } from "@/lib/metrics";
import { readValidatedUploadFile } from "@/lib/server/file-validation";
import { readCostEdits } from "@/lib/server/cost-lines";
import { costReportPdf } from "@/lib/server/cost-pdf";
import { PersistenceError } from "@/lib/server/mongo";
import { readState } from "@/lib/server/memory";
import {
  applyPortalAction,
  isPortalKey,
  type PortalKey,
} from "@/lib/server/portal-store";
import {
  getSessionUserByToken,
  sessionCookieName,
  setUserPassword,
  checkLoginRateLimit,
  hashPassword,
  createSessionForUser,
  portalHome,
  PORTAL_ROLE,
  setUserPasswordHash,
} from "@/lib/server/auth";
import { createSignupOtp, normalizeSignupEmail, normalizeSignupPhone, verifySignupOtp } from "@/lib/server/otp";
import { verifyCsrfToken, applySessionCookieToExpress } from "../lib/auth-bridge";
import { userSchema, projectSchema, employeeSchema, engineerReportSchema } from "@/lib/validations/schemas";
import { isVertexaNotificationId, markAllVertexaNotificationsRead, markVertexaNotificationRead } from "@/lib/server/vertexa-api";
import type { AdminState, AppNotification, ReportPhoto, UserAccount, WorkKind } from "@/types";

export const cpmisRemainingRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

async function requireSession(req: Request, res: Response, portal: string) {
  if (!isPortalKey(portal)) {
    res.status(404).json({ ok: false, error: "unknown-portal" });
    return null;
  }
  const token = readCookie(req, sessionCookieName(portal));
  const session = token ? await getSessionUserByToken(portal, token) : null;
  if (!session) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return { portal: portal as PortalKey, session, token: token! };
}

function redirect(res: Response, path: string, query: Record<string, string> = {}, hash = "") {
  const url = new URL(path, "http://localhost");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const target = url.pathname + url.search + (hash ? `#${hash}` : "");
  return res.redirect(303, target);
}

async function persistOrRedirect<T>(work: () => Promise<T>, onFailure: () => T): Promise<T> {
  try {
    return await work();
  } catch (error) {
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
      await applyPortalAction("administrator", { type: "create-user", input: parsed.data, stamp: stamp(auth.session, id) } as any);
      await setUserPassword(id, parsed.data.email, password);
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
      await applyPortalAction("administrator", { type: "create-project", input: parsed.data, stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` } } as any);
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
      await applyPortalAction("administrator", { type: "create-employee", input: parsed.data, stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` } } as any);
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
      await applyPortalAction("administrator", { type: "support-request", topic, message, stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` } } as any);
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
      await applyPortalAction("administrator", { type: "add-work-comment", kind, workId, projectId, body, stamp: { id, at: new Date().toISOString() } } as any);
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
        await applyPortalAction("administrator", { type: "mark-all-notifications" } as any);
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
      await applyPortalAction(portalForReturn(back), { type: "mark-notification", id, read: readFlag } as any);
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
      await applyPortalAction("project_manager", { type: "submit-report", input: parsed.data, toAdmin: true, stamp: stamp(auth.session, id) } as any);
      return redirect(res, "/pm/reports", { sent: state.settings.profileName });
    },
    () => redirect(res, "/pm/reports", { error: "The report could not be saved. Try again." }),
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
      await applyPortalAction("project_manager", { type: "open-report-review", id, stamp: stamp(auth.session, stampId) } as any);
      return redirect(res, "/pm/reports", { opened: sender }, id);
    },
    () => redirect(res, "/pm/reports", { error: "The review could not be opened. Try again." }, id),
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
      await applyPortalAction("project_manager", { type: "decide-report", id, decision, note, stamp: stamp(auth.session, stampId) } as any);
      return redirect(res, "/pm/reports", { reviewSent: sender }, id);
    },
    () => redirect(res, "/pm/reports", { error: "The review could not be saved. Try again." }, id),
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
      await applyPortalAction("project_manager", { type: "set-progress", id: project.id, progress, note, stamp: stamp(auth.session, id) } as any);
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
      await applyPortalAction("project_manager", { type: "add-calendar-event", title, kind, date, stamp: { id, at: new Date().toISOString() } } as any);
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
      await applyPortalAction("project_manager", { type: "revise-cost-bill", projectId, lines: parsed.lines, stamp: stamp(auth.session, edited) } as any);
      const fresh = await readState();
      const live = billLines(fresh.boq, projectId);
      const latest = (fresh.costReports ?? []).find((report) => report.projectId === projectId && report.status === "submitted");
      if (latest && sameBill(latest.lines, live)) return redirect(res, "/pm/costs", { error: "These figures are already with the administrator. Change a quantity or rate to send an update." });
      const id = nextId("act");
      await applyPortalAction("project_manager", { type: "submit-cost-report", projectId, surveyorId: surveyor.id, stamp: stamp(auth.session, id) } as any);
      return redirect(res, "/pm/costs", { sent: fresh.settings.profileName });
    },
    () => redirect(res, "/pm/costs", { error: "The cost bill could not be saved. Try again." }),
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
      await applyPortalAction("project_manager", { type: "revise-cost-bill", projectId, lines: parsed.lines, stamp: stamp(auth.session, id) } as any);
      return redirect(res, "/pm/costs", { edited: project.code });
    },
    () => redirect(res, "/pm/costs", { error: "The cost lines could not be saved. Try again." }),
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
      await applyPortalAction("quantity_surveyor", { type: "send-cost-report", surveyorId: surveyor.id, stamp: stamp(auth.session, id) } as any);
      return redirect(res, "/qs/reports", { sent: `${manager.firstName} ${manager.lastName}` });
    },
    () => redirect(res, "/qs/reports", { error: "The cost report could not be saved. Try again." }),
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
        input: { projectId: actor.projectId!, engineerId: actor.id, periodStart: date, periodEnd: date, progress, summary, issues },
        photos,
        stamp: stamp(auth.session, stampId),
      } as any);
      return redirect(res, "/se/reports", { sent: "1" }, stampId);
    },
    () => redirect(res, "/se/reports", { error: "The report could not be saved. Try again." }),
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
  try { originHost = new URL(origin).host; } catch { res.status(403).json({ ok: false, error: "Invalid origin." }); return true; }
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
  if (host && originHost !== host) { res.status(403).json({ ok: false, error: "Invalid origin." }); return true; }
  return null;
}

cpmisRemainingRouter.post("/auth/signup/request-otp", async (req: Request, res: Response) => {
  if (expressOriginError(req, res)) return;
  const parsed = signupSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." });
  const input = parsed.data;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "local";
  const limit = checkLoginRateLimit(`signup:${ip}:${normalizeSignupEmail(input.email)}`);
  if (!limit.ok) return res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` });

  const state = await readState();
  const email = normalizeSignupEmail(input.email);
  const phone = normalizeSignupPhone(input.phone);
  if (state.users.some((u) => u.email.toLowerCase() === email)) {
    return res.status(409).json({ ok: false, error: "An account with this email already exists. Sign in instead." });
  }
  if (state.users.some((u) => (u as any).phone && normalizeSignupPhone(String((u as any).phone)) === phone)) {
    return res.status(409).json({ ok: false, error: "An account with this phone number already exists." });
  }

  try {
    const passwordHash = await hashPassword(input.password);
    const result = await createSignupOtp({ portal: input.portal as PortalKey, firstName: input.firstName, lastName: input.lastName, phone, email, passwordHash });
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
    return res.json({ ok: true, challengeId: result.challengeId, expiresAt: result.expiresAt, ...(result.demoOtp ? { demoOtp: result.demoOtp } : {}) });
  } catch (error) {
    if (error instanceof PersistenceError) return res.status(503).json({ ok: false, error: "Sign-up could not be started. Try again." });
    console.error("[cpmis] signup request-otp failed", error);
    return res.status(500).json({ ok: false, error: "signup-failed" });
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
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? "Check the code." });
  const { portal, challengeId, otp } = parsed.data;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "local";
  const limit = checkLoginRateLimit(`signup-verify:${ip}:${challengeId}`);
  if (!limit.ok) return res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.` });

  try {
    const verified = await verifySignupOtp(challengeId, otp, portal as PortalKey);
    if (!verified.ok) return res.status(verified.status).json({ ok: false, error: verified.error });

    const state = await readState();
    const email = normalizeSignupEmail(verified.challenge.email);
    if (state.users.some((u) => u.email.toLowerCase() === email)) {
      return res.status(409).json({ ok: false, error: "An account with this email already exists. Sign in instead." });
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
    await setUserPasswordHash(id, user.email, verified.challenge.passwordHash);

    const session = await createSessionForUser(portal as PortalKey, { ...user, id });
    applySessionCookieToExpress(res, portal as PortalKey, session.token);
    return res.json({ ok: true, redirectTo: portalHome(portal as PortalKey) });
  } catch (error) {
    if (error instanceof PersistenceError) return res.status(503).json({ ok: false, error: "Sign-up could not be completed. Try again." });
    console.error("[cpmis] signup verify-otp failed", error);
    return res.status(500).json({ ok: false, error: "signup-failed" });
  }
});
