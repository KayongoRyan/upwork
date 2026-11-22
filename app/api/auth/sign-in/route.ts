import { proxyCpmisJson } from "@/lib/server/cpmis-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BFF proxy: Express is the CPMIS API authority. */
export async function POST(request: Request) {
  return proxyCpmisJson(request, "/api/v1/cpmis/auth/sign-in", { method: "POST" });
}
