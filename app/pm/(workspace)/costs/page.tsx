import { Suspense } from "react";
import type { Metadata } from "next";
import { PmCosts } from "@/components/pm/costs-view";

export const metadata: Metadata = { title: "Cost reports" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PmCosts />
    </Suspense>
  );
}
