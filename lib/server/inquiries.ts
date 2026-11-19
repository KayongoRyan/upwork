import { nextId } from "@/lib/utils";
import type { VertexaInquiryServiceId } from "@/lib/vertexa-inquiry";

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

export function listInquiries(): VertexaInquiry[] {
  return [...inquiries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

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

export function getInquiry(id: string): VertexaInquiry | undefined {
  return inquiries.find((inquiry) => inquiry.id === id);
}

export function markInquiryRead(id: string): boolean {
  const inquiry = inquiries.find((i) => i.id === id);
  if (!inquiry) return false;
  inquiry.read = true;
  return true;
}