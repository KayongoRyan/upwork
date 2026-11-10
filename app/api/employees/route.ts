import { NextResponse } from "next/server";
import { applyAction, readState } from "@/lib/server/memory";
import { nextId } from "@/lib/utils";
import { employeeSchema } from "@/lib/validations/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const parsed = employeeSchema.safeParse({
    employeeCode: form.get("employeeCode"),
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    position: form.get("position"),
    department: form.get("department"),
    phone: form.get("phone"),
    email: form.get("email"),
    projectId: form.get("projectId") || "unassigned",
    status: form.get("status"),
    hiredAt: form.get("hiredAt"),
  });
  const back = new URL("/admin/employees", request.url);
  if (!parsed.success) {
    back.searchParams.set("register", "1");
    back.searchParams.set("error", parsed.error.issues[0]?.message ?? "Check the form and try again.");
    return NextResponse.redirect(back, 303);
  }
  const code = parsed.data.employeeCode.trim().toLowerCase();
  if (readState().employees.some((employee) => employee.employeeCode.toLowerCase() === code)) {
    back.searchParams.set("register", "1");
    back.searchParams.set("error", "That employee ID is already in use.");
    return NextResponse.redirect(back, 303);
  }
  const id = nextId("act");
  await applyAction({
    type: "create-employee",
    input: parsed.data,
    stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` },
  });
  return NextResponse.redirect(back, 303);
}
