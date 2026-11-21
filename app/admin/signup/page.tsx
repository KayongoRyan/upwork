import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { getSessionUser } from "@/lib/server/auth";

export default async function AdminSignupPage() {
  const session = await getSessionUser("administrator");
  if (session) redirect("/admin");
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f4f2] px-4 py-10">
      <SignupForm portal="administrator" />
    </main>
  );
}
