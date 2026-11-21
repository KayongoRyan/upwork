import type { Metadata } from "next";
import { QsNotices } from "@/components/qs/notices-view";

export const metadata: Metadata = { title: "Notices" };

export default function Page() {
  return <QsNotices />;
}
