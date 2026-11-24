"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/utils";

type Props = {
  currency?: string;
  projectId?: string;
  title?: string;
  description?: string;
};

type Deviation = {
  projectId: string;
  code: string;
  name: string;
  varianceAmount?: number;
  variancePercent?: number | null;
  deviationPercent?: number | null;
  daysToExpectedEnd?: number | null;
  status?: string;
};

type ProjectMetric = {
  projectId: string;
  code: string;
  name: string;
  progress: {
    actualPercent: number;
    plannedPercent: number | null;
    deviationPercent: number | null;
  };
  measurements: {
    estimatedAmount: number;
    actualAmount: number;
    varianceAmount: number;
  };
  cost: {
    budget: number;
    spent: number;
    varianceAmount: number;
  };
  schedule: { status: string };
  insights: string[];
};

type AnalyticsResponse = {
  ok: true;
  generatedAt: string;
  portfolio: {
    averageProgress: number;
    averagePlannedProgress: number | null;
    totalCostVariance: number;
    totalMeasurementVariance: number;
    atRiskProjects: number;
    delayedProjects: number;
    overdueTasks: number;
    totalBudget: number;
    totalSpent: number;
  };
  deviations: {
    costOverruns: Deviation[];
    scheduleBehind: Deviation[];
    measurementOverruns: Deviation[];
  };
  projects: ProjectMetric[];
};

export function ProjectAnalyticsPanel({
  currency = "RWF",
  projectId = "all",
  title = "Project analytics",
  description = "Real project records: progress vs planned, BOQ measurements, cost and schedule deviations.",
}: Props) {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams();
    if (projectId !== "all") q.set("projectId", projectId);
    fetch(`/api/reports/analytics${q.toString() ? `?${q.toString()}` : ""}`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as AnalyticsResponse | { message?: string; error?: string } | null;
        if (!res.ok || !json || !("ok" in json) || !json.ok) {
          const err = json as { message?: string; error?: string } | null;
          throw new Error(err?.message || err?.error || "Could not load analytics.");
        }
        if (!cancelled) {
          setAnalytics(json);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load analytics.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-black/55">{description}</p>
        </div>
        {analytics?.generatedAt ? (
          <p className="text-xs text-black/40">Generated {new Date(analytics.generatedAt).toLocaleString()}</p>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {!analytics && !error ? <p className="mt-3 text-sm text-black/45">Loading analytics...</p> : null}

      {analytics ? (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Avg actual progress" value={`${analytics.portfolio.averageProgress}%`} />
            <Metric
              label="Avg planned progress"
              value={analytics.portfolio.averagePlannedProgress === null ? "—" : `${analytics.portfolio.averagePlannedProgress}%`}
            />
            <Metric label="Cost variance" value={formatMoney(analytics.portfolio.totalCostVariance, currency)} tone={analytics.portfolio.totalCostVariance > 0 ? "bad" : "good"} />
            <Metric label="Measurement variance" value={formatMoney(analytics.portfolio.totalMeasurementVariance, currency)} tone={analytics.portfolio.totalMeasurementVariance > 0 ? "bad" : "good"} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Projects at risk" value={String(analytics.portfolio.atRiskProjects)} tone={analytics.portfolio.atRiskProjects > 0 ? "warn" : undefined} />
            <Metric label="Behind schedule" value={String(analytics.portfolio.delayedProjects)} tone={analytics.portfolio.delayedProjects > 0 ? "bad" : undefined} />
            <Metric label="Overdue tasks" value={String(analytics.portfolio.overdueTasks)} tone={analytics.portfolio.overdueTasks > 0 ? "warn" : undefined} />
            <Metric
              label="Budget utilization"
              value={analytics.portfolio.totalBudget ? `${Math.round((analytics.portfolio.totalSpent / analytics.portfolio.totalBudget) * 100)}%` : "—"}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <DeviationList
              title="Cost deviations"
              empty="No cost overruns detected."
              items={analytics.deviations.costOverruns.map((d) => ({
                key: d.projectId,
                label: d.code,
                value: formatMoney(d.varianceAmount ?? 0, currency),
              }))}
            />
            <DeviationList
              title="Schedule deviations"
              empty="No schedule deviations detected."
              items={analytics.deviations.scheduleBehind.map((d) => ({
                key: d.projectId,
                label: d.code,
                value: d.deviationPercent == null ? String(d.status ?? "behind").replaceAll("_", " ") : `${d.deviationPercent}% vs plan`,
              }))}
            />
            <DeviationList
              title="Measurement variances"
              empty="No measurement overruns detected."
              items={analytics.deviations.measurementOverruns.map((d) => ({
                key: d.projectId,
                label: d.code,
                value: formatMoney(d.varianceAmount ?? 0, currency),
              }))}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-black/5">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-black/[0.02] text-xs text-black/40">
                <tr>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Actual</th>
                  <th className="px-3 py-2">Planned</th>
                  <th className="px-3 py-2">Progress dev.</th>
                  <th className="px-3 py-2">Budget</th>
                  <th className="px-3 py-2">Spent</th>
                  <th className="px-3 py-2">Cost dev.</th>
                  <th className="px-3 py-2">BOQ est.</th>
                  <th className="px-3 py-2">BOQ actual</th>
                  <th className="px-3 py-2">Schedule</th>
                </tr>
              </thead>
              <tbody>
                {analytics.projects.map((p) => (
                  <tr key={p.projectId} className="border-t border-black/5">
                    <td className="px-3 py-2">
                      <p className="font-medium">{p.code}</p>
                      <p className="text-xs text-black/45">{p.name}</p>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{p.progress.actualPercent}%</td>
                    <td className="px-3 py-2 tabular-nums">{p.progress.plannedPercent === null ? "—" : `${p.progress.plannedPercent}%`}</td>
                    <td className={`px-3 py-2 tabular-nums ${(p.progress.deviationPercent ?? 0) < 0 ? "text-accent" : "text-emerald-700"}`}>
                      {p.progress.deviationPercent === null ? "—" : `${p.progress.deviationPercent}%`}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(p.cost.budget, currency)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(p.cost.spent, currency)}</td>
                    <td className={`px-3 py-2 tabular-nums ${p.cost.varianceAmount > 0 ? "text-accent" : "text-emerald-700"}`}>
                      {formatMoney(p.cost.varianceAmount, currency)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(p.measurements.estimatedAmount, currency)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(p.measurements.actualAmount, currency)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${scheduleTone(p.schedule.status)}`}>
                        {String(p.schedule.status).replaceAll("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {analytics.projects.slice(0, 6).map((p) => (
              <div key={p.projectId} className="rounded-xl border border-black/5 bg-light-gray/30 p-3">
                <p className="text-sm font-medium">{p.code} · {p.name}</p>
                <ul className="mt-2 list-disc pl-5 text-xs text-black/60">
                  {p.insights.map((insight, i) => <li key={i}>{insight}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const toneClass = tone === "bad" ? "text-accent" : tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "";
  return (
    <div className="rounded-xl border border-black/5 bg-light-gray/30 p-3">
      <p className="text-xs text-black/45">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function DeviationList({ title, empty, items }: { title: string; empty: string; items: Array<{ key: string; label: string; value: string }> }) {
  return (
    <div className="rounded-xl border border-black/5 bg-light-gray/30 p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {items.length === 0 ? <li className="text-black/45">{empty}</li> : items.map((d) => (
          <li key={d.key} className="flex justify-between gap-3">
            <span>{d.label}</span>
            <span className="tabular-nums text-accent">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function scheduleTone(status: string) {
  if (status === "behind_schedule") return "bg-red-50 text-red-700";
  if (status === "at_risk") return "bg-amber-50 text-amber-700";
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-700";
}
