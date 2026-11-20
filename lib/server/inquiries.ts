import { nextId } from "@/lib/utils";
import type { VertexaInquiryServiceId } from "@/lib/vertexa-inquiry";

/**
 * Development-only fallback store. Inquiries normally live in MongoDB through
 * the Express API; this keeps the site usable when that API is not running.
 */
export type VertexaInquiry = {
  id: string;
  service: VertexaInquiryServiceId;
  name: string;
  email: string;
  phone: string;
  location: string;
  budget: string | null;
  startDate: string | null;
  message: string;
  createdAt: string;
  read: boolean;
};

const inquiries: VertexaInquiry[] = [];

export function createInquiry(
  input: Omit<VertexaInquiry, "id" | "createdAt" | "read">
): VertexaInquiry {
  const inquiry: VertexaInquiry = {
    id: nextId("inq"),
    createdAt: new Date().toISOString(),
    read: false,
    ...input,
  };
  inquiries.push(inquiry);
  return inquiry;
}
