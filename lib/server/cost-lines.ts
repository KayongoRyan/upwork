import { parseBoq } from "@/lib/boq";
import type { BoqItem } from "@/types";

export function readCostEdits(form: FormData, rows: BoqItem[]) {
  const lines = [];
  for (const item of rows) {
    const parsed = parseBoq({
      projectId: item.projectId,
      code: item.code,
      description: item.description,
      unit: item.unit,
      estimatedQty: Number(form.get(`estimated-${item.id}`)),
      actualQty: Number(form.get(`actual-${item.id}`)),
      unitRate: Number(form.get(`rate-${item.id}`)),
    });
    if (!parsed) return { ok: false as const, error: `Check the quantities and rate on ${item.code}.` };
    lines.push({
      id: item.id,
      code: parsed.code,
      description: parsed.description,
      unit: parsed.unit,
      estimatedQty: parsed.estimatedQty,
      actualQty: parsed.actualQty,
      unitRate: parsed.unitRate,
    });
  }
  return { ok: true as const, lines };
}
