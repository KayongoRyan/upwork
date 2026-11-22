import { proxyCpmisRaw } from "@/lib/server/cpmis-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BFF proxy: Express is the CPMIS API authority. */
export async function POST(request: Request) {
  return proxyCpmisRaw(request, "/api/v1/cpmis/documents/revise", { method: "POST" });
}
