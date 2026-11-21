import { Suspense } from "react";
import type { Metadata } from "next";
import { ProjectsView } from "@/components/projects/projects-view";

export const metadata: Metadata = { title: "Projects" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ProjectsView />
    </Suspense>
  );
}
