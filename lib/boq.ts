import type { BoqInput, BoqItem, CostReportLine } from "@/types";

export const boqUnits = ["m3", "m2", "m", "t", "nr", "ls"] as const;

/** Whole francs. Quantities may be fractional; the line is rounded once. */
export function lineAmount(qty: number, rate: number) {
  return Math.round(qty * rate);
}

export function lineEstimate(item: Pick<BoqItem, "estimatedQty" | "unitRate">) {
  return lineAmount(item.estimatedQty, item.unitRate);
}

export function lineActual(item: Pick<BoqItem, "actualQty" | "unitRate">) {
  return lineAmount(item.actualQty, item.unitRate);
}

export function lineVariance(item: Pick<BoqItem, "estimatedQty" | "actualQty" | "unitRate">) {
  return lineActual(item) - lineEstimate(item);
}

export function expenditureFor(items: BoqItem[], projectId: string) {
  return items.filter((item) => item.projectId === projectId).reduce((sum, item) => sum + lineActual(item), 0);
}

export function billLines(items: BoqItem[], projectId: string): CostReportLine[] {
  return items
    .filter((item) => item.projectId === projectId)
    .map(({ code, description, unit, estimatedQty, actualQty, unitRate }) => ({ code, description, unit, estimatedQty, actualQty, unitRate }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function linesEstimate(lines: CostReportLine[]) {
  return lines.reduce((sum, line) => sum + lineEstimate(line), 0);
}

export function linesActual(lines: CostReportLine[]) {
  return lines.reduce((sum, line) => sum + lineActual(line), 0);
}

export function sameBill(left: CostReportLine[], right: CostReportLine[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function estimateFor(items: BoqItem[], projectId: string) {
  return items.filter((item) => item.projectId === projectId).reduce((sum, item) => sum + lineEstimate(item), 0);
}

/** Share of the project budget already measured. 0 when the budget is 0. */
export function utilizationRatio(budget: number, expenditure: number) {
  if (budget <= 0) return 0;
  return expenditure / budget;
}

export function utilizationPercent(budget: number, expenditure: number) {
  return Math.round(utilizationRatio(budget, expenditure) * 1000) / 10;
}

export function formatPercent(budget: number, expenditure: number) {
  return `${utilizationPercent(budget, expenditure).toFixed(1)}%`;
}

export function parseBoq(input: BoqInput): BoqInput | null {
  const estimatedQty = parseQty(input.estimatedQty);
  const actualQty = parseQty(input.actualQty);
  const unitRate = parseRate(input.unitRate);
  const description = input.description.trim();
  const code = input.code.trim().toUpperCase();
  const unit = input.unit.trim();
  if (estimatedQty === null || actualQty === null || unitRate === null) return null;
  if (description.length < 3 || code.length < 2) return null;
  if (!boqUnits.includes(unit as (typeof boqUnits)[number])) return null;
  return { projectId: input.projectId, code, description, unit, estimatedQty, actualQty, unitRate };
}

function parseQty(value: number) {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 1000) / 1000;
}

function parseRate(value: number) {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}
