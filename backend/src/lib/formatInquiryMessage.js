import { serviceLabel } from "../constants/vertexa.js";

/**
 * @param {object} inquiry
 */
export function formatInquiryDetailMessage(inquiry) {
  const label = inquiry.service === "general" ? "General enquiry" : serviceLabel(inquiry.service);
  return [
    `New Vertexa project inquiry (${label})`,
    `From: ${inquiry.name} · ${inquiry.email}`,
    inquiry.phone ? `Phone: ${inquiry.phone}` : null,
    inquiry.location ? `Location: ${inquiry.location}` : null,
    inquiry.budget ? `Budget: ${inquiry.budget}` : null,
    inquiry.startDate ? `Expected start: ${inquiry.startDate}` : null,
    "",
    inquiry.message,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function inquiryNotificationTitle(serviceId) {
  const label = serviceId === "general" ? "General enquiry" : serviceLabel(serviceId);
  return `New project inquiry — ${label}`;
}