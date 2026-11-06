"use client";

import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { billLines, formatPercent, lineActual, lineEstimate, lineVariance, linesActual, linesEstimate, sameBill } from "@/lib/boq";
import { usePm } from "@/lib/data/admin-store";
import { formatDateTime, formatMoney, fullName } from "@/lib/utils";

export function PmCosts() {
  const data = usePm();
  const projects = data.projects.filter((project) => data.surveyors.some((user) => user.projectId === project.id) || data.boq.some((line) => line.projectId === project.id));

  return (
    <div>
      <PageHeader
        title="Cost reports"
        description="Quantity surveyor statements on your projects. You submit the cost report. The figures are the measured bill for that project."
      />
      {projects.length === 0 ? <p className="text-sm text-black/45">No quantity surveyor statement is on your projects.</p> : null}
      <div className="space-y-4">
        {projects.map((project) => {
          const surveyor = data.surveyors.find((user) => user.projectId === project.id);
          const live = billLines(data.boq, project.id);
          const estimated = linesEstimate(live);
          const expenditure = linesActual(live);
          const latest = data.costReports.find((report) => report.projectId === project.id);
          const filed = latest && sameBill(latest.lines, live);
          return (
            <article key={project.id} className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-black/45">{project.code}</p>
                  <h2 className="text-base font-semibold">{project.name}</h2>
                  <p className="mt-1 text-sm text-black/55">
                    {surveyor ? fullName(surveyor) : "No surveyor assigned"} · budget {formatMoney(project.budget)} · {formatPercent(project.budget, expenditure)} used
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={filed || live.length === 0}
                  onClick={() => {
                    const result = data.submitCostReport(project.id);
                    if (!result.ok) toast.error(result.error);
                    else toast.success("Cost report submitted.");
                  }}
                >
                  {latest && !filed ? "Submit updated figures" : "Submit cost report"}
                </Button>
              </div>
              {filed && latest?.submittedAt ? (
                <p className="mt-3 text-sm">Submitted {formatDateTime(latest.submittedAt)}. This measurement is on file.</p>
              ) : latest ? (
                <p className="mt-3 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">The bill has changed since the last submission.</p>
              ) : (
                <p className="mt-3 text-sm text-black/55">Not submitted yet.</p>
              )}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
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
                    {live.map((line) => (
                      <tr key={line.code} className="border-t border-black/5">
                        <td className="py-2">
                          <span className="font-medium">{line.code}</span>
                          <span className="mt-0.5 block text-xs text-black/45">{line.description}</span>
                        </td>
                        <td className="py-2 tabular-nums">{line.estimatedQty} / {line.actualQty} {line.unit}</td>
                        <td className="py-2 text-right tabular-nums">{formatMoney(line.unitRate)}</td>
                        <td className="py-2 text-right tabular-nums">{formatMoney(lineEstimate(line))}</td>
                        <td className="py-2 text-right tabular-nums">{formatMoney(lineActual(line))}</td>
                        <td className="py-2 text-right tabular-nums">{formatMoney(lineVariance(line))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-black/5 font-semibold">
                      <td className="py-2" colSpan={3}>Measured total</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(estimated)}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(expenditure)}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(expenditure - estimated)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-3 text-xs text-black/45">Cost variance against the budget is {formatMoney(expenditure - project.budget)}.</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
