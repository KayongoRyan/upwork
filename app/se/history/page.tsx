import type { Metadata } from "next";
import { SeHistory } from "@/components/se/history-view";

export const metadata: Metadata = { title: "Report history" };

export default function Page() {
  return <SeHistory />;
}
