import { NextResponse } from "next/server";
import { applyAction, readState } from "@/lib/server/memory";
import { nextId } from "@/lib/utils";
import type { DocumentCategory, RevisionStatus, UserRole } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categories = new Set<DocumentCategory>(["drawing", "contract", "boq", "photograph", "technical", "minutes", "inspection", "correspondence"]);
const statuses = new Set<RevisionStatus>(["draft", "in_review", "approved"]);
const roles = new Set<UserRole>(["administrator", "project_manager", "site_engineer", "quantity_surveyor"]);
const MAX_BYTES = 512 * 1024;

export async function POST(request: Request) {
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
  const state = readState();
  if (!state.projects.some((project) => project.id === projectId)) return fail("Choose a project.");
  if (!state.users.some((user) => user.id === ownerId)) return fail("Choose an owner.");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file.");
  if (file.size > MAX_BYTES) return fail("Keep the preview file under 512 KB.");
  if ((state.documents ?? []).some((item) => item.projectId === projectId && item.number.toUpperCase() === number.toUpperCase())) {
    return fail("That document number is already on this project.");
  }
  const access = form
    .getAll("access")
    .filter((value): value is string => typeof value === "string" && roles.has(value as UserRole)) as UserRole[];
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = nextId("act");
  await applyAction({
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
      fileName: file.name || "upload",
      fileType: file.type || "application/octet-stream",
      size: file.size,
      note: String(form.get("note") ?? "").trim(),
      status: status as RevisionStatus,
      uploadedBy: "u-admin",
      dataUrl: `data:${file.type || "application/octet-stream"};base64,${bytes.toString("base64")}`,
    },
    stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` },
  });
  const done = new URL("/admin/documents", request.url);
  done.searchParams.set("doc", id);
  return NextResponse.redirect(done, 303);
}
