import type { Metadata } from "next";
import { SeShell } from "@/components/se/se-shell";
import { requirePortalSession } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Site engineer" };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalSession("site_engineer");
  return <SeShell user={user}>{children}</SeShell>;
}
