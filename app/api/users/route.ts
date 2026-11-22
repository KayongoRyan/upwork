import { NextResponse } from "next/server";
import { requireApiSession, setUserPassword, verifyCsrf } from "@/lib/server/auth";
import { readState } from "@/lib/server/memory";
import { applyPortalAction } from "@/lib/server/portal-store";
import { persistOr } from "@/lib/server/redirect";
import { nextId } from "@/lib/utils";
import { userSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const __session = await requireApiSession("administrator");
  if (__session instanceof Response) return __session;
  const __csrf = verifyCsrf(request, __session);
  if (__csrf) return __csrf;
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
  const password = String(form.get("password") ?? "");
  const back = new URL("/admin/users", request.url);
  if (!parsed.success) {
    back.searchParams.set("add", "1");
    back.searchParams.set("error", parsed.error.issues[0]?.message ?? "Check the form and try again.");
    return NextResponse.redirect(back, 303);
  }
  if (password.length < 8) {
    back.searchParams.set("add", "1");
    back.searchParams.set("error", "Password must be at least 8 characters.");
    return NextResponse.redirect(back, 303);
  }
  const email = parsed.data.email.trim().toLowerCase();
  const state = await readState();
  if (state.users.some((user) => user.email.toLowerCase() === email)) {
    back.searchParams.set("add", "1");
    back.searchParams.set("error", "That email is already registered.");
    return NextResponse.redirect(back, 303);
  }
  const id = nextId("act");
  return persistOr(
    async () => {
      await applyPortalAction("administrator", {
        type: "create-user",
        input: parsed.data,
        stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}`, actorId: __session.id, actorName: `${__session.firstName} ${__session.lastName}`, actorRole: __session.role },
      });
      await setUserPassword(id, parsed.data.email, password);
      return NextResponse.redirect(back, 303);
    },
    () => {
      back.searchParams.set("add", "1");
      back.searchParams.set("error", "The account could not be saved. Try again.");
      return NextResponse.redirect(back, 303);
    },
  );
}
