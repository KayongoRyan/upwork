import { proxyCpmisRaw } from "@/lib/server/cpmis-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyCpmisRaw(request, "/api/v1/cpmis/pm/costs/edit");
}
