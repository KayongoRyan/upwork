import { Suspense } from "react";
import type { Metadata } from "next";
import { ReportsView } from "@/components/reports/reports-view";

export const metadata: Metadata = { title: "Reports & analytics" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportsView />
    </Suspense>
  );
}
