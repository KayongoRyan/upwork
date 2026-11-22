/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { AdminAction } from "@/lib/data/reducer";
import { readValidatedUploadFile } from "@/lib/server/file-validation";
import { putObject, saveFileMetadata, storageKeyForDocument } from "@/lib/server/storage";
import { nextId } from "@/lib/utils";
import {
  applySessionCookieToExpress,
  clearSessionCookieOnExpress,
  destroySessionsForUser,
  getSessionUserByToken,
  portalHome,
  removeUserCredential,
  resetDemoAuth,
  sessionCookieName,
  setUserPassword,
  signInWithPassword,
  signOutByToken,
  verifyCsrfToken,
} from "../lib/auth-bridge";
import { PersistenceError } from "@/lib/server/mongo";
import {
  PortalActionError,
  applyPortalAction,
  isPortalKey,
  readState,
  scopeStateForSession,
} from "@/lib/server/portal-store";

export const cpmisRouter = Router();

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
  return { portal, session, token: token! };
}

cpmisRouter.get("/portal/:portal/state", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, String(req.params.portal));
  if (!auth) return;
  try {
    const state = await readState();
    res.setHeader("cache-control", "no-store");
    res.json(scopeStateForSession(state, auth.session));
  } catch (error) {
    console.error("[cpmis] state failed", error);
    res.status(500).json({ ok: false, error: "state-failed" });
  }
});

cpmisRouter.post("/portal/:portal/actions", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, String(req.params.portal));
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);

  const action = req.body as AdminAction | null;
  if (!action || typeof action !== "object" || typeof (action as any).type !== "string") {
    return res.status(400).json({ ok: false, error: "unknown-action" });
  }

  try {
    const secured = withActor(action, auth.session);
    if (secured.type === "create-user") {
      const pwd = "password" in secured ? (secured as any).password : undefined;
      if (typeof pwd !== "string" || pwd.length < 8) {
        return res.status(400).json({ ok: false, error: "password-required" });
      }
    }
    const state = await applyPortalAction(auth.portal, secured);
    if (secured.type === "create-user") {
      const pwd = "password" in secured ? (secured as any).password : undefined;
      if (typeof pwd === "string") {
        await setUserPassword((secured as any).stamp.id, (secured as any).input.email, pwd);
      }
    }
    if (secured.type === "update-user" && (secured as any).input.status !== "active") {
      await destroySessionsForUser((secured as any).id);
    }
    if (secured.type === "delete-user") {
      await removeUserCredential((secured as any).id);
    }
    if (secured.type === "reset") {
      await resetDemoAuth();
    }
    res.setHeader("cache-control", "no-store");
    res.json(scopeStateForSession(state, auth.session));
  } catch (error) {
    if (error instanceof PortalActionError) {
      return res.status(403).json({ ok: false, error: "action-not-allowed", action: error.action, portal: error.portal });
    }
    if (error instanceof PersistenceError) {
      return res.status(503).json({ ok: false, error: "persistence-failed" });
    }
    console.error("[cpmis] action failed", error);
    return res.status(500).json({ ok: false, error: "action-failed" });
  }
});

function withActor(action: AdminAction, actor: { id: string; firstName: string; lastName: string; role: string }): AdminAction {
  let next: AdminAction = action;
  if (actor.role === "site_engineer") {
    if ((next as any).type === "submit-report") next = { ...next, input: { ...(next as any).input, engineerId: actor.id } } as any;
    if ((next as any).type === "set-task-progress") next = { ...next, engineerId: actor.id } as any;
  }
  if (actor.role === "quantity_surveyor") {
    if (["create-boq", "update-boq", "delete-boq", "send-cost-report"].includes((next as any).type)) {
      next = { ...next, surveyorId: actor.id } as any;
    }
  }
  if (["reset", "mark-notification", "mark-all-notifications"].includes((next as any).type)) return next;
  if (!("stamp" in (next as any))) return next;
  return {
    ...next,
    stamp: {
      ...(next as any).stamp,
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      actorRole: actor.role,
    },
  } as AdminAction;
}
cpmisRouter.post("/auth/sign-in", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const portal = String(body.portal ?? "");
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!isPortalKey(portal)) return res.status(400).json({ ok: false, error: "Unknown portal." });
  if (!email || !password) return res.status(400).json({ ok: false, error: "Enter a valid email and password." });

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "local";
  const { checkLoginRateLimit, resetLoginRateLimit } = await import("../lib/auth-bridge");
  const limit = checkLoginRateLimit(`${portal}:${ip}:${email.toLowerCase()}`);
  if (!limit.ok) {
    return res.status(429).json({ ok: false, error: `Too many sign-in attempts. Try again in ${limit.retryAfterSeconds}s.` });
  }

  try {
    const result = await signInWithPassword(portal, email, password);
    if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
    resetLoginRateLimit(`${portal}:${ip}:${email.toLowerCase()}`);
    applySessionCookieToExpress(res, portal, result.token);
    return res.json({ ok: true, redirectTo: portalHome(portal) });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return res.status(503).json({ ok: false, error: "The server could not start your session. Try again." });
    }
    console.error("[cpmis] sign-in failed", error);
    return res.status(500).json({ ok: false, error: "sign-in-failed" });
  }
});

cpmisRouter.post("/auth/sign-out", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const portal = String(body.portal ?? "");
  if (!isPortalKey(portal)) return res.status(400).json({ ok: false, error: "Unknown portal." });
  const token = readCookie(req, sessionCookieName(portal));
  if (token) await signOutByToken(portal, token);
  clearSessionCookieOnExpress(res, portal);
  return res.json({ ok: true });
});

cpmisRouter.get("/auth/session/:portal", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, String(req.params.portal));
  if (!auth) return;
  res.setHeader("cache-control", "no-store");
  res.json({ ok: true, user: auth.session });
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

cpmisRouter.post("/documents", upload.single("file"), async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const file = req.file;
  const number = String(form.number ?? "").trim();
  const title = String(form.title ?? "").trim();
  const projectId = String(form.projectId ?? "");
  const category = String(form.category ?? "");
  const discipline = String(form.discipline ?? "").trim() || "General";
  const ownerId = String(form.ownerId ?? "");
  const status = String(form.status ?? "in_review");
  const back = "/admin/documents?register=1&error=";
  if (!file) return res.redirect(303, back + encodeURIComponent("Choose a file."));
  if (!number || !title) return res.redirect(303, back + encodeURIComponent("Number and title are required."));
  const state = await readState();
  if (!state.projects.some((p: any) => p.id === projectId)) return res.redirect(303, back + encodeURIComponent("Choose a project."));
  if (!state.users.some((u: any) => u.id === ownerId)) return res.redirect(303, back + encodeURIComponent("Choose an owner."));
  const fileObj = new File([new Uint8Array(file.buffer)], file.originalname || "upload", { type: file.mimetype || "application/octet-stream" });
  const validated = await readValidatedUploadFile(fileObj);
  if (!validated.ok) return res.redirect(303, back + encodeURIComponent(validated.error));
  const { bytes, fileName, contentType: fileType, size } = validated.value;
  const fileId = nextId("file");
  let fileKey: string;
  try {
    const stored = await putObject({ key: storageKeyForDocument(projectId, fileId, fileName), body: bytes, contentType: fileType, fileName });
    fileKey = stored.key;
  } catch {
    return res.redirect(303, back + encodeURIComponent("The file could not be stored. Try again."));
  }
  const id = nextId("act");
  try {
    await saveFileMetadata({ key: fileKey, fileName, contentType: fileType, size, body: bytes, uploadedBy: auth.session.id, projectId, documentId: id, revisionId: `${id}-rev`, source: "document" });
  } catch {
    return res.redirect(303, back + encodeURIComponent("The file metadata could not be saved. Try again."));
  }
  try {
    await applyPortalAction("administrator", {
      type: "register-document",
      document: { projectId, number, title, category, discipline, ownerId, access: Array.isArray(form.access) ? form.access : form.access ? [form.access] : [] },
      revision: { fileName, fileType, size, note: String(form.note ?? "").trim(), status, uploadedBy: auth.session.id, fileKey },
      stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}`, actorId: auth.session.id, actorName: `${auth.session.firstName} ${auth.session.lastName}`, actorRole: auth.session.role },
    } as any);
    return res.redirect(303, `/admin/documents?doc=${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof PersistenceError) return res.redirect(303, back + encodeURIComponent("The document could not be saved. Try again."));
    console.error("[cpmis] document register failed", error);
    return res.redirect(303, back + encodeURIComponent("The document could not be saved. Try again."));
  }
});

cpmisRouter.post("/documents/revise", upload.single("file"), async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, "administrator");
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const form = req.body ?? {};
  const file = req.file;
  const documentId = String(form.documentId ?? "");
  const back = `/admin/documents?revise=${encodeURIComponent(documentId || "1")}&error=`;
  const state = await readState();
  const current = (state.documents ?? []).find((item: any) => item.id === documentId);
  if (!current) return res.redirect(303, back + encodeURIComponent("That document is not on the register."));
  if (!file) return res.redirect(303, back + encodeURIComponent("Choose a file."));
  const fileObj = new File([new Uint8Array(file.buffer)], file.originalname || "upload", { type: file.mimetype || "application/octet-stream" });
  const validated = await readValidatedUploadFile(fileObj);
  if (!validated.ok) return res.redirect(303, back + encodeURIComponent(validated.error));
  const { bytes, fileName, contentType: fileType, size } = validated.value;
  let fileKey: string;
  try {
    const stored = await putObject({ key: storageKeyForDocument(current.projectId, documentId, fileName), body: bytes, contentType: fileType, fileName });
    fileKey = stored.key;
  } catch {
    return res.redirect(303, back + encodeURIComponent("The file could not be stored. Try again."));
  }
  const id = nextId("act");
  try {
    await saveFileMetadata({ key: fileKey, fileName, contentType: fileType, size, body: bytes, uploadedBy: auth.session.id, projectId: current.projectId, documentId, revisionId: id, source: "document" });
  } catch {
    return res.redirect(303, back + encodeURIComponent("The file metadata could not be saved. Try again."));
  }
  try {
    await applyPortalAction("administrator", {
      type: "revise-document",
      documentId,
      revision: { fileName, fileType, size, note: String(form.note ?? "").trim(), uploadedBy: auth.session.id, fileKey },
      stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}`, actorId: auth.session.id, actorName: `${auth.session.firstName} ${auth.session.lastName}`, actorRole: auth.session.role },
    } as any);
    return res.redirect(303, `/admin/documents?doc=${encodeURIComponent(documentId)}`);
  } catch (error) {
    if (error instanceof PersistenceError) return res.redirect(303, back + encodeURIComponent("The revision could not be saved. Try again."));
    console.error("[cpmis] document revise failed", error);
    return res.redirect(303, back + encodeURIComponent("The revision could not be saved. Try again."));
  }
});

cpmisRouter.get("/documents/file", async (req: Request, res: Response) => {
  const documentId = String(req.query.documentId ?? "");
  const revisionId = String(req.query.revisionId ?? "");
  if (!documentId || !revisionId) return res.status(400).json({ ok: false, error: "missing-params" });

  // Find session across portals
  let session: any = null;
  for (const portal of ["administrator", "project_manager", "site_engineer", "quantity_surveyor"] as const) {
    const token = readCookie(req, sessionCookieName(portal));
    if (!token) continue;
    session = await getSessionUserByToken(portal, token);
    if (session) break;
  }
  if (!session) return res.status(401).json({ ok: false, error: "unauthorized" });

  const state = await readState();
  const document = (state.documents ?? []).find((item: any) => item.id === documentId);
  if (!document) return res.status(404).json({ ok: false, error: "not-found" });
  const isAdmin = session.role === "administrator";
  const hasAccess = isAdmin || document.access.includes(session.role);
  if (!hasAccess) return res.status(403).json({ ok: false, error: "forbidden" });
  if (!isAdmin) {
    if (session.role === "site_engineer" || session.role === "quantity_surveyor") {
      if (session.projectId !== document.projectId) return res.status(403).json({ ok: false, error: "forbidden" });
    }
    if (session.role === "project_manager") {
      const manages = state.projects.some((p: any) => p.id === document.projectId && p.managerId === session.id);
      if (!manages) return res.status(403).json({ ok: false, error: "forbidden" });
    }
  }
  const revision = document.revisions.find((item: any) => item.id === revisionId);
  if (!revision) return res.status(404).json({ ok: false, error: "not-found" });
  if (revision.dataUrl) return res.redirect(302, revision.dataUrl);
  if (!revision.fileKey) return res.status(404).json({ ok: false, error: "no-file" });
  const { getObject } = await import("@/lib/server/storage");
  const object = await getObject(revision.fileKey);
  if (!object) return res.status(404).json({ ok: false, error: "not-found" });
  res.setHeader("Content-Type", revision.fileType || "application/octet-stream");
  res.setHeader("Content-Length", String(object.size));
  res.setHeader("Cache-Control", "private, no-store");
  const safeName = String(revision.fileName || "download").replace(/[\r\n"]/g, "");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  return res.status(200).send(object.body);
});
