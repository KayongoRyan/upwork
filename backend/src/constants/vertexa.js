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

/** Demo PM routing — mirror `lib/vertexa-inquiry-routing.ts` on the frontend. */
export const MANAGER_BY_SERVICE = {
  "custom-homes": "u-pm-2",
  renovations: "u-pm-1",
  extensions: "u-pm-3",
  general: "u-pm-2",
};

const DEFAULT_PM_ID = "u-pm-2";

export function managerIdForService(serviceId) {
  return MANAGER_BY_SERVICE[serviceId] ?? DEFAULT_PM_ID;
}

export function serviceLabel(serviceId) {
  return SERVICE_LABELS[serviceId] ?? serviceId;
}

export function isInquiryServiceId(value) {
  return INQUIRY_SERVICE_IDS.has(value);
}