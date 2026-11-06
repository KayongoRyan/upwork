import type { Metadata } from "next";
import { PmShell } from "@/components/pm/pm-shell";

export const metadata: Metadata = { title: "Project manager" };

export default function PmLayout({ children }: { children: React.ReactNode }) {
  return <PmShell>{children}</PmShell>;
}
