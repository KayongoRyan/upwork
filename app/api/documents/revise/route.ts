import { NextResponse } from "next/server";
import { requireApiSession, verifyCsrf } from "@/lib/server/auth";
import { readState } from "@/lib/server/memory";
import { applyPortalAction } from "@/lib/server/portal-store";
import { nextId } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 512 * 1024;

export async function POST(request: Request) {
  const __session = await requireApiSession("administrator");
  if (__session instanceof Response) return __session;
  const __csrf = verifyCsrf(request, __session);
  if (__csrf) return __csrf;
  const form = await request.formData();
  const back = new URL("/admin/documents", request.url);
  const documentId = String(form.get("documentId") ?? "");
  const fail = (error: string) => {
    back.searchParams.set("revise", documentId || "1");
    back.searchParams.set("error", error);
    return NextResponse.redirect(back, 303);
  };
  const state = await readState();
  const current = (state.documents ?? []).find((item) => item.id === documentId);
  if (!current) return fail("That document is not on the register.");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file.");
  if (file.size > MAX_BYTES) return fail("Keep the preview file under 512 KB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = nextId("act");
  await applyPortalAction("administrator", {
    type: "revise-document",
    documentId,
    revision: {
      fileName: file.name || "upload",
      fileType: file.type || "application/octet-stream",
      size: file.size,
      note: String(form.get("note") ?? "").trim(),
      uploadedBy: __session.id,
      dataUrl: `data:${file.type || "application/octet-stream"};base64,${bytes.toString("base64")}`,
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
  done.searchParams.set("doc", documentId);
  return NextResponse.redirect(done, 303);
}
