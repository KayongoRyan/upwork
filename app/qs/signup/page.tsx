import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { getSessionUser } from "@/lib/server/auth";

export default async function QsSignupPage() {
  const session = await getSessionUser("quantity_surveyor");
  if (session) redirect("/qs");
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f4f2] px-4 py-10">
      <SignupForm portal="quantity_surveyor" />
    </main>
  );
}
