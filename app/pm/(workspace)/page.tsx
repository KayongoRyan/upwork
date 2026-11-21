import { Suspense } from "react";
import type { Metadata } from "next";
import { PmDashboard } from "@/components/pm/dashboard-view";

export const metadata: Metadata = { title: "Project manager" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PmDashboard />
    </Suspense>
  );
}
