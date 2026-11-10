import { Suspense } from "react";
import type { Metadata } from "next";
import { PmPeople } from "@/components/pm/people-view";

export const metadata: Metadata = { title: "Team review" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PmPeople />
    </Suspense>
  );
}
