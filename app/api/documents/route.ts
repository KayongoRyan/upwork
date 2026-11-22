import { NextResponse } from "next/server";
import { requireApiSession, verifyCsrf } from "@/lib/server/auth";
import { readState } from "@/lib/server/memory";
import { applyPortalAction } from "@/lib/server/portal-store";
import { persistOr } from "@/lib/server/redirect";
import { readValidatedUploadFile } from "@/lib/server/file-validation";
import { putObject, saveFileMetadata, storageKeyForDocument } from "@/lib/server/storage";
import { nextId } from "@/lib/utils";
import type { DocumentCategory, RevisionStatus, UserRole } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categories = new Set<DocumentCategory>(["drawing", "contract", "boq", "photograph", "technical", "minutes", "inspection", "correspondence"]);
const statuses = new Set<RevisionStatus>(["draft", "in_review", "approved"]);
const roles = new Set<UserRole>(["administrator", "project_manager", "site_engineer", "quantity_surveyor"]);

export async function POST(request: Request) {
  const __session = await requireApiSession("administrator");
  if (__session instanceof Response) return __session;
  const __csrf = verifyCsrf(request, __session);
  if (__csrf) return __csrf;
  const form = await request.formData();
  const back = new URL("/admin/documents", request.url);
  const fail = (error: string) => {
    back.searchParams.set("register", "1");
    back.searchParams.set("error", error);
    return NextResponse.redirect(back, 303);
  };
  const number = String(form.get("number") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const projectId = String(form.get("projectId") ?? "");
  const category = String(form.get("category") ?? "");
  const discipline = String(form.get("discipline") ?? "").trim() || "General";
  const ownerId = String(form.get("ownerId") ?? "");
  const status = String(form.get("status") ?? "in_review");
  const file = form.get("file");
  if (!number || !title) return fail("Number and title are required.");
  if (!categories.has(category as DocumentCategory)) return fail("Choose a category.");
  if (!statuses.has(status as RevisionStatus)) return fail("Choose a standing.");
  const state = await readState();
  if (!state.projects.some((project) => project.id === projectId)) return fail("Choose a project.");
  if (!state.users.some((user) => user.id === ownerId)) return fail("Choose an owner.");
  if (!(file instanceof File)) return fail("Choose a file.");
  const validated = await readValidatedUploadFile(file);
  if (!validated.ok) return fail(validated.error);
  if ((state.documents ?? []).some((item) => item.projectId === projectId && item.number.toUpperCase() === number.toUpperCase())) {
    return fail("That document number is already on this project.");
  }
  const access = form
    .getAll("access")
    .filter((value): value is string => typeof value === "string" && roles.has(value as UserRole)) as UserRole[];
  const { bytes, fileName, contentType: fileType, size } = validated.value;
  const fileId = nextId("file");
  let fileKey: string;
  try {
    const stored = await putObject({
      key: storageKeyForDocument(projectId, fileId, fileName),
      body: bytes,
      contentType: fileType,
      fileName,
    });
    fileKey = stored.key;
  } catch {
    return fail("The file could not be stored. Try again.");
  }
  const id = nextId("act");
  try {
    await saveFileMetadata({
      key: fileKey,
      fileName,
      contentType: fileType,
      size,
      body: bytes,
      uploadedBy: __session.id,
      projectId,
      documentId: id,
      revisionId: `${id}-rev`,
      source: "document",
    });
  } catch {
    return fail("The file metadata could not be saved. Try again.");
  }
  return persistOr(
    async () => {
      await applyPortalAction("administrator", {
        type: "register-document",
        document: {
          projectId,
          number,
          title,
          category: category as DocumentCategory,
          discipline,
          ownerId,
          access,
        },
        revision: {
          fileName,
          fileType,
          size,
          note: String(form.get("note") ?? "").trim(),
          status: status as RevisionStatus,
          uploadedBy: __session.id,
          fileKey,
        },
        stamp: {
          id,
          at: new Date().toISOString(),
          notificationId: `ntf-${id}`,
          actorId: __session.id,
          actorName: `${__session.firstName} ${__session.lastName}`,
          actorRole: __session.role,
        },
      });
      const done = new URL("/admin/documents", request.url);
      done.searchParams.set("doc", id);
      return NextResponse.redirect(done, 303);
    },
    () => fail("The document could not be saved. Try again."),
  );
}
