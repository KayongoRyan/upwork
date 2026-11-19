import type { VertexaInquiryServiceId } from "@/lib/vertexa-inquiry";
import { PREVIEW_PM_ID } from "@/lib/utils";

/**
 * Demo routing: Vertexa public inquiries → CPMIS project managers by service line.
 *
 * Flow:
 * 1. Client uses Let's Talk → /vertexa/contact (or a service page form).
 * 2. Inquiry API validates and calls `vertexa-inquiry`.
 * 3. Administrator always receives a notice; the mapped PM receives a copy with `recipientId`.
 * 4. Follow-up is manual (call/email) using details in the notice body.
 *
 * Replace this map with HR/CRM rules or round-robin when moving off the demo.
 */
export const vertexaInquiryManagerByService: Record<VertexaInquiryServiceId, string> = {
  "custom-homes": "u-pm-2", // Sarah Mukamana — custom residential
  renovations: "u-pm-1", // Joseph Mugisha — renovations
  extensions: "u-pm-3", // Peter Habimana — extensions
  general: PREVIEW_PM_ID, // default intake (Sarah)
};

export function managerIdForVertexaInquiry(serviceId: VertexaInquiryServiceId): string {
  return vertexaInquiryManagerByService[serviceId] ?? PREVIEW_PM_ID;
}