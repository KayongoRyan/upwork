export const INQUIRY_SERVICE_IDS = new Set([
  "custom-homes",
  "renovations",
  "extensions",
  "general",
]);

export const SERVICE_LABELS = {
  "custom-homes": "Custom Home Construction",
  renovations: "Home Renovations",
  extensions: "Home Extensions",
  general: "General enquiry",
};

export function serviceLabel(serviceId) {
  return SERVICE_LABELS[serviceId] ?? serviceId;
}

export function isInquiryServiceId(value) {
  return INQUIRY_SERVICE_IDS.has(value);
}