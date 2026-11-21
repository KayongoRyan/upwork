import type { Metadata } from "next";
import { QsShell } from "@/components/qs/qs-shell";
import { requirePortalSession } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Quantity surveyor" };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalSession("quantity_surveyor");
  return <QsShell user={user}>{children}</QsShell>;
}
