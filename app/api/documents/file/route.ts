import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { readState } from "@/lib/server/memory";
import { getObject } from "@/lib/server/storage";
import { cpmisPortalIds } from "@/lib/portals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findSession() {
  for (const portal of cpmisPortalIds) {
    const user = await getSessionUser(portal);
    if (user) return user;
  }
  return null;
}

export async function GET(request: Request) {
  const user = await findSession();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const documentId = url.searchParams.get("documentId") ?? "";
  const revisionId = url.searchParams.get("revisionId") ?? "";
  if (!documentId || !revisionId) return NextResponse.json({ ok: false, error: "missing-params" }, { status: 400 });

  const state = await readState();
  const document = (state.documents ?? []).find((item) => item.id === documentId);
  if (!document) return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });

  const isAdmin = user.role === "administrator";
  const hasAccess = isAdmin || document.access.includes(user.role);
  if (!hasAccess) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!isAdmin) {
    if (user.role === "site_engineer" || user.role === "quantity_surveyor") {
      if (user.projectId !== document.projectId) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    if (user.role === "project_manager") {
      const manages = state.projects.some((p) => p.id === document.projectId && p.managerId === user.id);
      if (!manages) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  const revision = document.revisions.find((item) => item.id === revisionId);
  if (!revision) return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });

  if (revision.dataUrl) {
    return NextResponse.redirect(revision.dataUrl, 302);
  }

  if (!revision.fileKey) {
    return NextResponse.json({ ok: false, error: "no-file" }, { status: 404 });
  }

  const object = await getObject(revision.fileKey);
  if (!object) return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });

  const headers = new Headers();
  headers.set("Content-Type", revision.fileType || "application/octet-stream");
  headers.set("Content-Length", String(object.size));
  headers.set("Cache-Control", "private, no-store");
  const safeName = revision.fileName.replace(/[\r\n"]/g, "");
  headers.set("Content-Disposition", `attachment; filename="${safeName}"`);
  return new Response(new Uint8Array(object.body), { status: 200, headers });
}