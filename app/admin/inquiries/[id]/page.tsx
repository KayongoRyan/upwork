import type { Metadata } from "next";
import { InquiryDetail } from "@/components/inquiries/inquiry-detail";

export const metadata: Metadata = { title: "Inquiry" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InquiryDetail id={id} />;
}
