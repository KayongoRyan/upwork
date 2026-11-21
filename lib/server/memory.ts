import type { AdminAction } from "@/lib/data/reducer";
import type { AdminState } from "@/types";
import { applyAction as applyPortalStoreAction, readState as readPortalStoreState } from "@/lib/server/portal-store";

/**
 * Compatibility wrapper for the existing form routes. The portal databases are the
 * source of truth; see `lib/server/portal-store.ts` for the per-portal layout.
 */
export function readState(): Promise<AdminState> {
  return readPortalStoreState();
}

export function applyAction(action: AdminAction): Promise<AdminState> {
  return applyPortalStoreAction(action);
}
