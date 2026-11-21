import type { Metadata } from "next";
import { QsDashboard } from "@/components/qs/dashboard-view";

export const metadata: Metadata = { title: "Quantity surveyor" };

export default function Page() {
  return <QsDashboard />;
}
