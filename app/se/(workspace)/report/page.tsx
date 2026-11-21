import { Suspense } from "react";
import type { Metadata } from "next";
import { SeReport } from "@/components/se/report-view";

export const metadata: Metadata = { title: "Daily report" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SeReport />
    </Suspense>
  );
}
