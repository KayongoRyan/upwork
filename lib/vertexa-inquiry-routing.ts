import type { UserAccount } from "@/types";
import type { VertexaInquiryServiceId } from "@/lib/vertexa-inquiry";

/**
 * Routes a public Vertexa inquiry to a real project manager.
 *
 * The manager is chosen from the active accounts supplied by the caller, so the
 * lead always lands on a member of the deployment's own team. No preview or demo
 * identity is baked in: when there is no active project manager the inquiry is
 * still delivered to the administrator inbox and left unassigned for triage.
 */
const SERVICE_ORDER: VertexaInquiryServiceId[] = [
  "custom-homes",
  "renovations",
  "extensions",
  "general",
];

type RoutableUser = Pick<UserAccount, "id" | "role" | "status">;

export function managerIdForVertexaInquiry(
  serviceId: VertexaInquiryServiceId,
  users: RoutableUser[],
): string | null {
  const managers = users.filter(
    (user) => user.role === "project_manager" && user.status === "active",
  );
  if (managers.length === 0) return null;
  const index = SERVICE_ORDER.indexOf(serviceId);
  return managers[(index < 0 ? 0 : index) % managers.length]?.id ?? null;
}
