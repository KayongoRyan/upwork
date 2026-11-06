import type { Metadata } from "next";
import { PmTasks } from "@/components/pm/tasks-view";

export const metadata: Metadata = { title: "Schedule and tasks" };

export default function Page() {
  return <PmTasks />;
}
