import { Suspense } from "react";
import type { Metadata } from "next";
import { PmSchedule } from "@/components/pm/schedule-view";

export const metadata: Metadata = { title: "Schedule" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PmSchedule />
    </Suspense>
  );
}
