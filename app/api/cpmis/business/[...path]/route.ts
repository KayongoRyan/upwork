import { CPMIS_API_PREFIX, proxyCpmisJson, proxyCpmisRaw } from "@/lib/server/cpmis-api";

type Ctx = { params: Promise<{ path: string[] }> };

async function pathFor(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const suffix = path.map(encodeURIComponent).join("/");
  const url = new URL(request.url);
  return `${CPMIS_API_PREFIX}/business/${suffix}${url.search}`;
}

export async function GET(request: Request, ctx: Ctx) { return proxyCpmisRaw(request, await pathFor(request, ctx)); }
export async function POST(request: Request, ctx: Ctx) { return proxyCpmisJson(request, await pathFor(request, ctx)); }
export async function PATCH(request: Request, ctx: Ctx) { return proxyCpmisJson(request, await pathFor(request, ctx)); }
export async function PUT(request: Request, ctx: Ctx) { return proxyCpmisJson(request, await pathFor(request, ctx)); }
export async function DELETE(request: Request, ctx: Ctx) { return proxyCpmisJson(request, await pathFor(request, ctx)); }
