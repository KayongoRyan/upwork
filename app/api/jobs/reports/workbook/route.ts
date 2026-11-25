import { proxyCpmisJson } from "@/lib/server/cpmis-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyCpmisJson(request, "/api/v1/cpmis/jobs/reports/workbook", { method: "POST" });
}
