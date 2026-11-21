import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser } from "@/lib/server/auth";

export default async function SeLoginPage() {
  const session = await getSessionUser("site_engineer");
  if (session) redirect("/se");
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f4f2] px-4 py-10">
      <LoginForm portal="site_engineer" />
    </main>
  );
}
