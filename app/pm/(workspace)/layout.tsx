import type { Metadata } from "next";
import { PmShell } from "@/components/pm/pm-shell";
import { requirePortalSession } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Project manager" };

export default async function PmLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalSession("project_manager");
  return <PmShell user={user}>{children}</PmShell>;
}
