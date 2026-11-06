import { applyAction, readState } from "@/lib/server/memory";
import type { AdminAction } from "@/lib/data/reducer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(readState());
}

export async function POST(request: Request) {
  const action = (await request.json()) as AdminAction;
  if (!action || typeof action !== "object" || typeof action.type !== "string") {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }
  try {
    const state = await applyAction(action);
    return Response.json(state);
  } catch {
    return Response.json({ error: "That action could not be applied." }, { status: 400 });
  }
}
