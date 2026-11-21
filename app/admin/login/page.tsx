import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser } from "@/lib/server/auth";

export default async function AdminLoginPage() {
  const session = await getSessionUser("administrator");
  if (session) redirect("/admin");
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f4f2] px-4 py-10">
      <LoginForm portal="administrator" />
    </main>
  );
}
