"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { billLines, formatPercent, lineActual, lineEstimate, lineVariance, sameBill } from "@/lib/boq";
import { useQuantitySurveyor } from "@/lib/data/admin-store";
import { DEMO_TODAY, downloadCsv, formatDate, formatDateTime, formatMoney, fullName } from "@/lib/utils";

export function QsReport() {
  const data = useQuantitySurveyor();
  const project = data.project;
  const budget = project?.budget ?? 0;
  const costVariance = data.expenditure - budget;
  const billVariance = data.expenditure - data.estimated;

  return (
    <div>
      <PageHeader
        title="Financial report"
        description={project ? `${project.code} · ${project.name} · ${formatDate(DEMO_TODAY)}` : "No project is assigned to this account."}
        actions={
          <Button
            type="button"
            variant="navy"
            disabled={!project || data.lines.length === 0}
            onClick={() => {
              if (!project) return;
              downloadCsv(`${project.code}-cost-statement.csv`, [
                ...data.lines.map((item) => ({
                  Code: item.code,
                  Description: item.description,
                  Unit: item.unit,
                  EstimatedQty: item.estimatedQty,
                  ActualQty: item.actualQty,
                  UnitRateRWF: item.unitRate,
                  EstimatedRWF: lineEstimate(item),
                  ActualRWF: lineActual(item),
                  VarianceRWF: lineVariance(item),
                })),
                {
                  Code: "TOTAL",
                  Description: project.name,
                  Unit: "",
                  EstimatedQty: "",
                  ActualQty: "",
                  UnitRateRWF: "",
                  EstimatedRWF: data.estimated,
                  ActualRWF: data.expenditure,
                  VarianceRWF: billVariance,
                },
              ]);
            }}
          >
            Download CSV
          </Button>
        }
      />
      {project ? (
        <article className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
          <p className="mb-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">
            {data.submissions[0] ? (
              <>
                Submitted by {data.submitter ? fullName(data.submitter) : "your project manager"} on {formatDateTime(data.submissions[0].submittedAt ?? "")}.
                {sameBill(data.submissions[0].lines, billLines(data.lines, project.id))
                  ? " The filed statement matches this bill."
                  : " The bill has changed since that submission. Your project manager can file the new figures."}
              </>
            ) : (
              "This statement is with your project manager. They submit it from Cost reports."
            )}
          </p>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-black/45">Cost statement</p>
              <h2 className="text-lg font-semibold">{project.name}</h2>
              <p className="mt-1 text-sm text-black/55">{project.client} · {project.location}</p>
              <p className="mt-1 text-sm text-black/55">Prepared by {data.actor ? fullName(data.actor) : "Quantity surveyor"}</p>
            </div>
            <p className="text-sm text-black/45">{formatDate(DEMO_TODAY)}</p>
          </header>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-black/40">
                <tr>
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 font-medium">Qty est / act</th>
                  <th className="py-2 text-right font-medium">Rate</th>
                  <th className="py-2 text-right font-medium">Estimated</th>
                  <th className="py-2 text-right font-medium">Actual</th>
                  <th className="py-2 text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((item) => (
                  <tr key={item.id} className="border-t border-black/5">
                    <td className="py-2">
                      <span className="font-medium">{item.code}</span>
                      <span className="mt-0.5 block text-xs text-black/45">{item.description}</span>
                    </td>
                    <td className="py-2 tabular-nums">{item.estimatedQty} / {item.actualQty} {item.unit}</td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(item.unitRate)}</td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(lineEstimate(item))}</td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(lineActual(item))}</td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(lineVariance(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 grid gap-3 border-t border-black/5 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <Total term="Bill estimate" value={formatMoney(data.estimated)} />
            <Total term="Expenditure" value={formatMoney(data.expenditure)} />
            <Total term="Budget" value={formatMoney(budget)} />
            <Total term="Budget use" value={formatPercent(budget, data.expenditure)} />
            <Total term="Bill variance" value={formatMoney(billVariance)} />
            <Total term="Cost variance" value={formatMoney(costVariance)} />
          </dl>
        </article>
      ) : null}
    </div>
  );
}

function Total({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-black/45">{term}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
