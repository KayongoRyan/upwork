import type { Metadata } from "next";
import { PmProgress } from "@/components/pm/progress-view";

export const metadata: Metadata = { title: "Progress" };

export default function Page() {
  return <PmProgress />;
}
