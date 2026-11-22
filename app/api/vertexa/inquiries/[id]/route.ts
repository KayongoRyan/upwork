import { requireApiSession, verifyCsrf } from "@/lib/server/auth";
import { proxyCpmisJson } from "@/lib/server/cpmis-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession("administrator");
  if (session instanceof Response) return session;
  const { id } = await context.params;
  return proxyCpmisJson(request, `/api/v1/inquiries/${encodeURIComponent(id)}`, { method: "GET", adminAuth: true });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession("administrator");
  if (session instanceof Response) return session;
  const csrf = verifyCsrf(request, session);
  if (csrf) return csrf;
  const { id } = await context.params;
  return proxyCpmisJson(request, `/api/v1/inquiries/${encodeURIComponent(id)}`, { method: "PATCH", adminAuth: true });
}
