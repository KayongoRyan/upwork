import { vertexaServices, type VertexaServiceId } from "@/lib/vertexa-projects";

export const vertexaInquiryServices = [
  ...vertexaServices,
  { id: "general", label: "General enquiry" },
] as const;

export type VertexaInquiryServiceId = VertexaServiceId | "general";

export const VERTEXA_INQUIRY_SERVICE_IDS = new Set<string>(
  vertexaInquiryServices.map((service) => service.id)
);

export function isVertexaInquiryServiceId(value: string): value is VertexaInquiryServiceId {
  return VERTEXA_INQUIRY_SERVICE_IDS.has(value);
}

export function inquiryErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    "invalid-service": "Please choose a project type.",
    "invalid-name": "Please enter your full name (at least 2 characters).",
    "invalid-email": "Please enter a valid email address.",
    "invalid-phone": "Please enter a valid phone number.",
    "invalid-location": "Please enter where the project is located.",
    "invalid-budget": "Budget looks too long — use a short RWF range or note (e.g. RWF 250M – 350M).",
    "invalid-start-date": "Please choose a valid expected start date.",
    "invalid-message": "Please add a project description (at least 10 characters).",
  };
  return messages[code] ?? "Something went wrong. Please try again.";
}