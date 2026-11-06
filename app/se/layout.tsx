import type { Metadata } from "next";
import { SeShell } from "@/components/se/se-shell";

export const metadata: Metadata = { title: "Site engineer" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <SeShell>{children}</SeShell>;
}
