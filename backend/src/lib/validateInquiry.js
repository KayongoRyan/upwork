import { isInquiryServiceId } from "../constants/vertexa.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[\d\s()+\-./]{6,30}$/;

/**
 * @param {Record<string, unknown>} input
 */
export function validateInquiryInput(input) {
  const scope = String(input.scope ?? "service");
  const service = String(input.service ?? "").trim();
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim();
  const phone = String(input.phone ?? "").trim();
  const location = String(input.location ?? "").trim();
  const budgetRaw = String(input.budget ?? "").trim();
  const startDateRaw = String(input.startDate ?? "").trim();
  const message = String(input.message ?? "").trim();

  if (!isInquiryServiceId(service)) return { ok: false, error: "invalid-service" };
  if (name.length < 2 || name.length > 100) return { ok: false, error: "invalid-name" };
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "invalid-email" };

  if (scope === "project-inquiry") {
    if (!PHONE_PATTERN.test(phone)) return { ok: false, error: "invalid-phone" };
    if (location.length < 2 || location.length > 120) return { ok: false, error: "invalid-location" };
  } else if (phone && !PHONE_PATTERN.test(phone)) {
    return { ok: false, error: "invalid-phone" };
  }

  const budget = budgetRaw.length > 0 ? budgetRaw : null;
  if (budget && budget.length > 80) return { ok: false, error: "invalid-budget" };

  let startDate = null;
  if (startDateRaw.length > 0) {
    const parsed = Date.parse(startDateRaw);
    if (Number.isNaN(parsed)) return { ok: false, error: "invalid-start-date" };
    startDate = startDateRaw;
  }

  if (message.length < 10 || message.length > 2000) return { ok: false, error: "invalid-message" };

  return {
    ok: true,
    data: {
      scope,
      service,
      name,
      email,
      phone,
      location,
      budget,
      startDate,
      message,
    },
  };
}