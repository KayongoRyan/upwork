import type { Metadata } from "next";
import { ProjectWorkspace } from "@/components/projects/project-workspace";

export const metadata: Metadata = { title: "Project" };

export default function Page() {
  return <ProjectWorkspace portal="qs" />;
}
