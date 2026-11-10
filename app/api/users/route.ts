import { NextResponse } from "next/server";
import { applyAction, readState } from "@/lib/server/memory";
import { nextId } from "@/lib/utils";
import { userSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const parsed = userSchema.safeParse({
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    email: form.get("email"),
    phone: form.get("phone"),
    role: form.get("role"),
    projectId: form.get("projectId") || "unassigned",
    status: form.get("status"),
  });
  const back = new URL("/admin/users", request.url);
  if (!parsed.success) {
    back.searchParams.set("add", "1");
    back.searchParams.set("error", parsed.error.issues[0]?.message ?? "Check the form and try again.");
    return NextResponse.redirect(back, 303);
  }
  const email = parsed.data.email.trim().toLowerCase();
  if (readState().users.some((user) => user.email.toLowerCase() === email)) {
    back.searchParams.set("add", "1");
    back.searchParams.set("error", "That email is already registered.");
    return NextResponse.redirect(back, 303);
  }
  const id = nextId("act");
  await applyAction({
    type: "create-user",
    input: parsed.data,
    stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` },
  });
  return NextResponse.redirect(back, 303);
}
