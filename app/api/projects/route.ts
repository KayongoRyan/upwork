import { NextResponse } from "next/server";
import { applyAction, readState } from "@/lib/server/memory";
import { nextId } from "@/lib/utils";
import { projectSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const parsed = projectSchema.safeParse({
    name: form.get("name"),
    code: form.get("code"),
    description: form.get("description"),
    client: form.get("client"),
    location: form.get("location"),
    managerId: form.get("managerId"),
    startDate: form.get("startDate"),
    expectedEndDate: form.get("expectedEndDate"),
    budget: form.get("budget"),
    spent: form.get("spent") || 0,
    progress: form.get("progress") || 0,
    status: form.get("status"),
  });
  const back = new URL("/admin/projects", request.url);
  if (!parsed.success) {
    back.searchParams.set("create", "1");
    back.searchParams.set("error", parsed.error.issues[0]?.message ?? "Check the form and try again.");
    return NextResponse.redirect(back, 303);
  }
  const code = parsed.data.code.trim().toUpperCase();
  if (readState().projects.some((project) => project.code.toUpperCase() === code)) {
    back.searchParams.set("create", "1");
    back.searchParams.set("error", "That project code is already in use.");
    return NextResponse.redirect(back, 303);
  }
  const id = nextId("act");
  await applyAction({
    type: "create-project",
    input: parsed.data,
    stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` },
  });
  return NextResponse.redirect(new URL(`/admin/projects/${id}`, request.url), 303);
}
