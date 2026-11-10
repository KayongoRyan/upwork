import { NextResponse } from "next/server";

/** Redirect on the host that received the form, not the internal Next port. */
export function redirectTo(request: Request, pathname: string, query: Record<string, string> = {}, hash = "") {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost";
  const url = new URL(pathname, `http://${host}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  if (hash) url.hash = hash;
  return NextResponse.redirect(url, 303);
}
