import { proxyCpmisJson } from "@/lib/server/cpmis-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BFF proxy: Express is the CPMIS API authority. */
export async function GET(request: Request, context: { params: Promise<{ portal: string }> }) {
  const { portal } = await context.params;
  return proxyCpmisJson(request, `/api/v1/cpmis/portal/${encodeURIComponent(portal)}/state`, { method: "GET" });
}
