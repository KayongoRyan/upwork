import type { Metadata } from "next";
import { PmProjects } from "@/components/pm/projects-view";

export const metadata: Metadata = { title: "My projects" };

export default function Page() {
  return <PmProjects />;
}
