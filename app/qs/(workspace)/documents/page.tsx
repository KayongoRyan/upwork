import type { Metadata } from "next";
import { QsDocuments } from "@/components/qs/documents-view";

export const metadata: Metadata = { title: "Document extraction" };

export default function Page() {
  return <QsDocuments />;
}
