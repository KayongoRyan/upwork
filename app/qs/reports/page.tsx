import { Suspense } from "react";
import type { Metadata } from "next";
import { QsReport } from "@/components/qs/report-view";

export const metadata: Metadata = { title: "Financial report" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QsReport />
    </Suspense>
  );
}
