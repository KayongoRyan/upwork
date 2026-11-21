import { readState } from "@/lib/server/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aggregate workspace snapshot for diagnostics. Writes go through the portal
 * endpoints (`/api/portal/<portal>/actions`) so each portal stays accountable
 * for the actions it owns.
 */
export async function GET() {
  return Response.json(await readState());
}
