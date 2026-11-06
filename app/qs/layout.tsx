import type { Metadata } from "next";
import { QsShell } from "@/components/qs/qs-shell";

export const metadata: Metadata = { title: "Quantity surveyor" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <QsShell>{children}</QsShell>;
}
