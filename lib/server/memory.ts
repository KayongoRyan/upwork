import { adminReducer, type AdminAction } from "@/lib/data/reducer";
import { createSeedState } from "@/lib/mock-data/seed";
import type { AdminState } from "@/types";

const globalStore = globalThis as typeof globalThis & {
  __cpmisState?: AdminState;
  __cpmisQueue?: Promise<unknown>;
};

export function readState(): AdminState {
  globalStore.__cpmisState ??= createSeedState();
  return globalStore.__cpmisState;
}

export function applyAction(action: AdminAction): Promise<AdminState> {
  const previous = globalStore.__cpmisQueue ?? Promise.resolve();
  const run = previous.then(() => {
    globalStore.__cpmisState = adminReducer(readState(), action);
    return globalStore.__cpmisState;
  });
  globalStore.__cpmisQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
