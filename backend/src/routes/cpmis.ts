/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { AdminAction } from "@/lib/data/reducer";
import { readValidatedUploadFile } from "@/lib/server/file-validation";
import { extractInvoiceMetadata } from "@/lib/server/invoice-extract";
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
import { apiError } from "../lib/api-response";
import { assertSameOrigin, readCookie, requireAnySession, requireSession } from "../lib/session";
import { canAccessProject } from "../lib/rbac";

export const cpmisRouter = Router();

cpmisRouter.get("/portal/:portal/state", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, String(req.params.portal));
  if (!auth) return;
  try {
    const state = await readState();
    res.setHeader("cache-control", "no-store");
    res.json(scopeStateForSession(state, auth.session));
  } catch (error) {
    console.error("[cpmis] state failed", error);
    apiError(res, 500, "state-failed", { requestId: req.requestId });
  }
});

cpmisRouter.post("/portal/:portal/actions", async (req: Request, res: Response) => {
  const auth = await requireSession(req, res, String(req.params.portal));
  if (!auth) return;
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);

  const action = req.body as AdminAction | null;
  if (!action || typeof action !== "object" || typeof (action as any).type !== "string") {
    return apiError(res, 400, "unknown-action", { requestId: req.requestId });
  }

  try {
    const secured = withActor(action, auth.session);
    if (secured.type === "create-user") {
      const pwd = "password" in secured ? (secured as any).password : undefined;
      if (typeof pwd !== "string" || pwd.length < 8) {
        return apiError(res, 400, "password-required", { requestId: req.requestId });
      }
    }
    const state = await applyPortalAction(auth.portal, secured, auth.session);
    if (secured.type === "create-user") {
      const pwd = "password" in secured ? (secured as any).password : undefined;
      if (typeof pwd === "string") {
        try {
          await setUserPassword((secured as any).stamp.id, (secured as any).input.email, pwd);
        } catch (error) {
          console.error("[cpmis] create-user credential persistence failed; rolling back user", error);
          try { await removeUserCredential((secured as any).stamp.id); } catch (cleanupError) { console.error("[cpmis] create-user credential cleanup failed", cleanupError); }
          try {
            await applyPortalAction(auth.portal, {
              type: "delete-user",
              id: (secured as any).stamp.id,
              stamp: { id: nextId("act"), at: new Date().toISOString(), notificationId: `ntf-${nextId("ntf")}`, actorId: auth.session.id, actorName: `${auth.session.firstName} ${auth.session.lastName}`, actorRole: auth.session.role },
            } as any, auth.session);
          } catch (rollbackError) {
            console.error("[cpmis] create-user rollback failed", rollbackError);
          }
          return apiError(res, 503, "persistence-failed", { message: "The account could not be fully created. Please try again.", requestId: req.requestId });
        }
      }
    }
    if (secured.type === "update-user" && (secured as any).input.status !== "active") {
      await destroySessionsForUser((secured as any).id);
    }
    if (secured.type === "set-user-status" && (secured as any).status !== "active") {
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
      return apiError(res, 403, "action-not-allowed", { requestId: req.requestId, extra: { action: error.action, portal: error.portal } });
    }
    if (error instanceof PersistenceError) {
      return apiError(res, 503, "persistence-failed", { requestId: req.requestId });
    }
    console.error("[cpmis] action failed", error);
    return apiError(res, 500, "action-failed", { requestId: req.requestId });
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
  if (assertSameOrigin(req, res)) return;
  const body = req.body ?? {};
  const portal = String(body.portal ?? "");
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!isPortalKey(portal)) return apiError(res, 400, "Unknown portal.", { requestId: req.requestId });
  if (!email || !password) return apiError(res, 400, "Enter a valid email and password.", { requestId: req.requestId });

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "local";
  const { checkLoginRateLimit, resetLoginRateLimit } = await import("../lib/auth-bridge");
  const limit = await checkLoginRateLimit(`${portal}:${ip}:${email.toLowerCase()}`);
  if (!limit.ok) {
    return apiError(res, 429, "rate-limited", { message: `Too many sign-in attempts. Try again in ${limit.retryAfterSeconds}s.`, requestId: req.requestId });
  }

  try {
    const result = await signInWithPassword(portal, email, password);
    if (!result.ok) return apiError(res, result.status, result.error, { requestId: req.requestId });
    await resetLoginRateLimit(`${portal}:${ip}:${email.toLowerCase()}`);
    applySessionCookieToExpress(res, portal, result.token);
    return res.json({ ok: true, redirectTo: portalHome(portal) });
  } catch (error) {
    if (error instanceof PersistenceError) {
      return apiError(res, 503, "The server could not start your session. Try again.", { requestId: req.requestId });
    }
    console.error("[cpmis] sign-in failed", error);
    return apiError(res, 500, "sign-in-failed", { requestId: req.requestId });
  }
});

cpmisRouter.post("/auth/sign-out", async (req: Request, res: Response) => {
  if (assertSameOrigin(req, res)) return;
  const body = req.body ?? {};
  const portal = String(body.portal ?? "");
  if (!isPortalKey(portal)) return apiError(res, 400, "Unknown portal.", { requestId: req.requestId });
  const token = readCookie(req, sessionCookieName(portal));
  const session = token ? await getSessionUserByToken(portal, token) : null;
  if (session) {
    const csrfError = verifyCsrfToken(req, session, typeof body.csrfToken === "string" ? body.csrfToken : null);
    if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  }
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
    await applyPortalAction("administrator", { type: "register-document",
      document: { projectId, number, title, category, discipline, ownerId, access: Array.isArray(form.access) ? form.access : form.access ? [form.access] : [] },
      revision: { fileName, fileType, size, note: String(form.note ?? "").trim(), status, uploadedBy: auth.session.id, fileKey },
      stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}`, actorId: auth.session.id, actorName: `${auth.session.firstName} ${auth.session.lastName}`, actorRole: auth.session.role },
    } as any, auth.session);
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
    } as any, auth.session);
    return res.redirect(303, `/admin/documents?doc=${encodeURIComponent(documentId)}`);
  } catch (error) {
    if (error instanceof PersistenceError) return res.redirect(303, back + encodeURIComponent("The revision could not be saved. Try again."));
    console.error("[cpmis] document revise failed", error);
    return res.redirect(303, back + encodeURIComponent("The revision could not be saved. Try again."));
  }
});

cpmisRouter.post("/documents/extract-invoice", upload.single("file"), async (req: Request, res: Response) => {
  const auth = await requireAnySession(req, res);
  if (!auth) return;
  if (auth.session.role !== "administrator" && auth.session.role !== "quantity_surveyor") {
    return apiError(res, 403, "forbidden", { message: "Only administrators and quantity surveyors can extract invoice metadata.", requestId: req.requestId });
  }
  const csrfError = verifyCsrfToken(req, auth.session);
  if (csrfError) return res.status(csrfError.status).json(csrfError.body);
  const file = req.file;
  if (!file) return apiError(res, 400, "validation-failed", { message: "Choose a document file to extract invoice metadata.", requestId: req.requestId });
  const fileObj = new File([new Uint8Array(file.buffer)], file.originalname || "upload", { type: file.mimetype || "application/octet-stream" });
  const validated = await readValidatedUploadFile(fileObj);
  if (!validated.ok) return apiError(res, 400, "validation-failed", { message: validated.error, requestId: req.requestId });
  try {
    const extraction = extractInvoiceMetadata(validated.value.fileName, validated.value.contentType, validated.value.bytes);
    res.setHeader("cache-control", "no-store");
    return res.json({ ok: true, extraction });
  } catch (error) {
    console.error("[cpmis] invoice extraction failed", error);
    return apiError(res, 500, "extraction-failed", { message: "Invoice metadata extraction failed.", requestId: req.requestId });
  }
});

cpmisRouter.get("/documents/file", async (req: Request, res: Response) => {
  const documentId = String(req.query.documentId ?? "");
  const revisionId = String(req.query.revisionId ?? "");
  if (!documentId || !revisionId) return apiError(res, 400, "missing-params", { requestId: req.requestId });

  const auth = await requireAnySession(req, res);
  if (!auth) return;
  const { session } = auth;

  const state = await readState();
  const document = (state.documents ?? []).find((item: any) => item.id === documentId);
  if (!document) return apiError(res, 404, "not-found", { requestId: req.requestId });
  const isAdmin = session.role === "administrator";
  const hasAccess = isAdmin || document.access.includes(session.role);
  if (!hasAccess) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  if (!isAdmin) {
    const project = (state.projects ?? []).find((p: any) => p.id === document.projectId);
    if (!project || !canAccessProject(session, project)) return apiError(res, 403, "forbidden", { requestId: req.requestId });
  }
  const revision = document.revisions.find((item: any) => item.id === revisionId);
  if (!revision) return apiError(res, 404, "not-found", { requestId: req.requestId });
  if (revision.dataUrl) return res.redirect(302, revision.dataUrl);
  if (!revision.fileKey) return apiError(res, 404, "no-file", { requestId: req.requestId });
  const { getObject } = await import("@/lib/server/storage");
  const object = await getObject(revision.fileKey);
  if (!object) return apiError(res, 404, "not-found", { requestId: req.requestId });
  res.setHeader("Content-Type", revision.fileType || "application/octet-stream");
  res.setHeader("Content-Length", String(object.size));
  res.setHeader("Cache-Control", "private, no-store");
  const safeName = String(revision.fileName || "download").replace(/[\r\n"]/g, "");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  return res.status(200).send(object.body);
});
