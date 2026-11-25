import { proxyCpmisJson } from "@/lib/server/cpmis-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return proxyCpmisJson(request, `/api/v1/cpmis/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
}
