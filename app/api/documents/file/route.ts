import { proxyCpmisRaw } from "@/lib/server/cpmis-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BFF proxy: Express is the CPMIS API authority. */
export async function GET(request: Request) {
  const search = new URL(request.url).search;
  return proxyCpmisRaw(request, `/api/v1/cpmis/documents/file${search}`, { method: "GET" });
}