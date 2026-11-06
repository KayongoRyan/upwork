import type { Metadata } from "next";
import { PmReports } from "@/components/pm/reports-view";

export const metadata: Metadata = { title: "Engineer reports" };

export default function Page() {
  return <PmReports />;
}
