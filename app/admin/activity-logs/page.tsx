import { Suspense } from "react";
import type { Metadata } from "next";
import { LogsView } from "@/components/activity-logs/logs-view";

export const metadata: Metadata = { title: "System activity logs" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LogsView />
    </Suspense>
  );
}
