"use client";

import { useSearchParams } from "next/navigation";
import { ManagerNotes } from "@/components/pm/manager-notes";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { billLines, formatPercent, lineActual, lineEstimate, lineVariance, linesActual, linesEstimate, sameBill } from "@/lib/boq";
import { usePm } from "@/lib/data/admin-store";
import { formatDateTime, formatMoney, fullName } from "@/lib/utils";

const qtyClass = "h-9 w-20 rounded-xl border border-input bg-white px-2 text-right text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

export function PmCosts() {
  const data = usePm();
  const params = useSearchParams();
  const sent = params.get("sent");
  const error = params.get("error");
  const projects = data.projects.filter((project) => data.surveyors.some((user) => user.projectId === project.id) || data.boq.some((line) => line.projectId === project.id));

  return (
    <div>
      <PageHeader
        title="Cost reports"
        description="Edit the quantities and rates first. Save them, submit them, or save the same figures as a PDF. The administrator reviews what you submit."
      />
      {error ? <p className="mb-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">{error}</p> : null}
      {sent ? <p className="mb-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">Cost report sent successfully to {sent}, who reviews it.</p> : null}
      {params.get("edited") ? <p className="mb-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">{params.get("edited")} figures saved. Submit the cost report when they are ready.</p> : null}
      {projects.length === 0 ? <p className="text-sm text-black/45">No quantity surveyor statement is on your projects.</p> : null}
      <div className="space-y-4">
        {projects.map((project) => {
          const surveyor = data.surveyors.find((user) => user.projectId === project.id);
          const rows = data.boq.filter((item) => item.projectId === project.id).sort((a, b) => a.code.localeCompare(b.code));
          const live = billLines(data.boq, project.id);
          const estimated = linesEstimate(live);
          const expenditure = linesActual(live);
          const reports = data.costReports.filter((report) => report.projectId === project.id);
          const submitted = reports.find((report) => report.status === "submitted");
          const received = reports.find((report) => report.status === "pending");
          const filed = submitted && sameBill(submitted.lines, live);
          const handed = received && sameBill(received.lines, live);
          return (
            <article key={project.id} id={project.id} className="scroll-mt-28 rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-black/45">{project.code}</p>
                  <h2 className="text-base font-semibold">{project.name}</h2>
                  <p className="mt-1 text-sm text-black/55">
                    {surveyor ? fullName(surveyor) : "No surveyor assigned"} · budget {formatMoney(project.budget)} · {formatPercent(project.budget, expenditure)} used
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" form={`bill-${project.id}`} formAction="/api/pm/costs/pdf" variant="outline">Save as PDF</Button>
                  <Button type="submit" form={`bill-${project.id}`} formAction="/api/pm/costs" className="bg-[#ff5c22] text-white hover:bg-[#e64e18]">
                    {submitted && !filed ? "Submit updated figures" : "Submit cost report"}
                  </Button>
                </div>
              </div>
              {filed && submitted?.submittedAt ? (
                <p className="mt-3 text-sm">
                  Submitted {formatDateTime(submitted.submittedAt)}. You can still change these figures, then save or submit them.
                  {handed && received?.submittedAt ? ` ${surveyor ? fullName(surveyor) : "The surveyor"} sent these figures on ${formatDateTime(received.submittedAt)}.` : ""}
                </p>
              ) : handed && received?.submittedAt ? (
                <p className="mt-3 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">
                  {surveyor ? fullName(surveyor) : "The surveyor"} sent this statement on {formatDateTime(received.submittedAt)}. Submit it to the administrator when it is ready.
                </p>
              ) : submitted || received ? (
                <p className="mt-3 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">The bill has changed since the last statement.</p>
              ) : (
                <p className="mt-3 text-sm text-black/55">Not submitted yet.</p>
              )}
              <form id={`bill-${project.id}`} className="mt-4" action="/api/pm/costs/edit" method="post">
                <input type="hidden" name="projectId" value={project.id} />
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
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
                      {rows.map((line) => (
                        <tr key={line.id} className="border-t border-black/5">
                          <td className="py-2">
                            <span className="font-medium">{line.code}</span>
                            <span className="mt-0.5 block text-xs text-black/45">{line.description}</span>
                          </td>
                          <td className="py-2">
                            <span className="flex items-center gap-1">
                              <input className={qtyClass} name={`estimated-${line.id}`} type="number" min={0} step="0.001" defaultValue={line.estimatedQty} aria-label={`${line.code} estimated quantity`} required />
                              <span className="text-black/30">/</span>
                              <input className={qtyClass} name={`actual-${line.id}`} type="number" min={0} step="0.001" defaultValue={line.actualQty} aria-label={`${line.code} actual quantity`} required />
                              <span className="text-xs text-black/45">{line.unit}</span>
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            <input className={`${qtyClass} ml-auto w-[6.75rem]`} name={`rate-${line.id}`} type="number" min={0} step="1" defaultValue={line.unitRate} aria-label={`${line.code} rate`} required />
                          </td>
                          <td className="whitespace-nowrap py-2 pl-3 text-right text-xs tabular-nums">{formatMoney(lineEstimate(line))}</td>
                          <td className="whitespace-nowrap py-2 pl-3 text-right text-xs tabular-nums">{formatMoney(lineActual(line))}</td>
                          <td className="whitespace-nowrap py-2 pl-3 text-right text-xs tabular-nums">{formatMoney(lineVariance(line))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-black/5 font-semibold">
                        <td className="py-2" colSpan={3}>Measured total</td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right text-xs tabular-nums">{formatMoney(estimated)}</td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right text-xs tabular-nums">{formatMoney(expenditure)}</td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right text-xs tabular-nums">{formatMoney(expenditure - estimated)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button type="submit" variant="outline">Save changes</Button>
                </div>
              </form>
              <p className="mt-3 text-xs text-black/45">Cost variance against the budget is {formatMoney(expenditure - project.budget)}.</p>
              <ManagerNotes notes={data.comments.filter((item) => item.projectId === project.id && (item.kind === "cost" || item.kind === "boq" || item.kind === "project"))} />
            </article>
          );
        })}
      </div>
    </div>
  );
}
