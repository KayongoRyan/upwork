import { NextResponse } from "next/server";
import { PersistenceError } from "@/lib/server/mongo";

/** Redirect on the host that received the form, not the internal Next port. */
export function redirectTo(request: Request, pathname: string, query: Record<string, string> = {}, hash = "") {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost";
  const url = new URL(pathname, `http://${host}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  if (hash) url.hash = hash;
  return NextResponse.redirect(url, 303);
}

/**
 * Runs a portal write and returns the caller's failure response when the
 * database rejects it, so a form route never reports success for a change that
 * was not saved.
 */
export async function persistOr<T>(work: () => Promise<T>, onFailure: () => T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PersistenceError) {
      console.error("[persistence] The change was not saved.", error);
      return onFailure();
    }
    throw error;
  }
}
