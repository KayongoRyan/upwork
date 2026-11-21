import type { Metadata } from "next";
import { AdminShell } from "@/components/layout/admin-shell";
import { requirePortalSession } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Administrator",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalSession("administrator");
  return <AdminShell user={user}>{children}</AdminShell>;
}
