import type { Metadata } from "next";
import { TasksView } from "@/components/tasks/tasks-view";

export const metadata: Metadata = { title: "Tasks & activities" };

export default function Page() {
  return <TasksView />;
}
