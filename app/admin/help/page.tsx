import type { Metadata } from "next";
import { HelpView } from "@/components/help/help-view";

export const metadata: Metadata = { title: "Help & support" };

export default function Page() {
  return <HelpView />;
}