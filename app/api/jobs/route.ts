import { proxyCpmisJson } from "@/lib/server/cpmis-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return proxyCpmisJson(request, `/api/v1/cpmis/jobs${url.search}`);
}

export async function POST(request: Request) {
  return proxyCpmisJson(request, "/api/v1/cpmis/jobs", { method: "POST" });
}
