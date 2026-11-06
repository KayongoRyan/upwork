"use client";

import { PageHeader } from "@/components/shared/page-header";
import { formatPercent, lineActual, lineVariance, utilizationPercent } from "@/lib/boq";
import { useQuantitySurveyor } from "@/lib/data/admin-store";
import { cn, formatMoney } from "@/lib/utils";

export function QsExpenditure() {
  const data = useQuantitySurveyor();
  const project = data.project;
  const budget = project?.budget ?? 0;
  const costVariance = data.expenditure - budget;
  const billVariance = data.expenditure - data.estimated;
  const used = utilizationPercent(budget, data.expenditure);

  return (
    <div>
      <PageHeader
        title="Expenditure"
        description={project ? `${project.code} · measured cost against the project budget.` : "No project is assigned to this account."}
      />
      <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Figure label="Budget" value={formatMoney(budget)} />
          <Figure label="Expenditure" value={formatMoney(data.expenditure)} hint="Sum of actual quantity × unit rate" />
          <Figure label="Cost variance" value={formatMoney(costVariance)} hint={costVariance > 0 ? "Over budget" : "Under budget"} warn={costVariance > 0} />
        </div>
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-black/45">
            <span>Budget utilization</span>
            <span className="tabular-nums text-black">{formatPercent(budget, data.expenditure)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, used)}%` }} />
          </div>
        </div>
        <p className="mt-4 text-sm text-black/55">
          Bill estimate {formatMoney(data.estimated)}. Bill variance {formatMoney(billVariance)}. Each line is rounded to the nearest franc before the lines are added, so the column totals match the figures above.
        </p>
      </section>

      <ul className="mt-4 divide-y divide-black/5 rounded-[22px] border border-black/5 bg-card px-4">
        {data.lines.map((item) => {
          const gap = lineVariance(item);
          return (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">{item.code} · {item.description}</p>
                <p className="text-xs text-black/45">{item.actualQty} {item.unit} × {formatMoney(item.unitRate)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums">{formatMoney(lineActual(item))}</p>
                <p className={cn("text-xs tabular-nums", gap > 0 ? "text-accent" : "text-black/45")}>{formatMoney(gap)} vs estimate</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Figure({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-black/45">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", warn && "text-accent")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-black/45">{hint}</p> : null}
    </div>
  );
}
