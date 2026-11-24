import { proxyCpmisRaw } from "@/lib/server/cpmis-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return proxyCpmisRaw(request, `/api/v1/cpmis/reports/monthly-progress${url.search}`);
}
