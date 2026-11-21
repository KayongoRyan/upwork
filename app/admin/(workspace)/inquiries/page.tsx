import type { Metadata } from "next";
import { InquiriesView } from "@/components/inquiries/inquiries-view";

export const metadata: Metadata = { title: "Inquiries" };

export default function Page() {
  return <InquiriesView />;
}
