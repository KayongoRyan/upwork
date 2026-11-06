import type { Metadata } from "next";
import { SeTasks } from "@/components/se/tasks-view";

export const metadata: Metadata = { title: "Assigned tasks" };

export default function Page() {
  return <SeTasks />;
}
