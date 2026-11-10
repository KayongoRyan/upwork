import { Suspense } from "react";
import type { Metadata } from "next";
import { DocumentsView } from "@/components/documents/documents-view";

export const metadata: Metadata = { title: "Documents" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DocumentsView />
    </Suspense>
  );
}
