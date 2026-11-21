import { Suspense } from "react";
import type { Metadata } from "next";
import { SeHistory } from "@/components/se/history-view";

export const metadata: Metadata = { title: "Report history" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SeHistory />
    </Suspense>
  );
}
