import { readState } from "@/lib/server/memory";
import { requireApiSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aggregate workspace snapshot for diagnostics. Writes go through the portal
 * endpoints (`/api/portal/<portal>/actions`) so each portal stays accountable
 * for the actions it owns.
 */
export async function GET() {
  const __session = await requireApiSession("administrator");
  if (__session instanceof Response) return __session;
  return Response.json(await readState());
}
