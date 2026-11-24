"use client";

import { useEffect, useState } from "react";

type Eval = {
  sampleCount: number;
  positiveCount: number;
  negativeCount: number;
  method: string;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  brierScore: number | null;
  mae: number | null;
  confusionMatrix: { tp: number; fp: number; tn: number; fn: number } | null;
  notes: string[];
};

type Forecast = {
  projectId: string;
  code: string;
  name: string;
  status: string;
  delay: { probability: number; confidence: "low" | "medium" | "high"; label: string; drivers: string[] };
  costOverrun: { probability: number; confidence: "low" | "medium" | "high"; label: string; drivers: string[] };
  dataQuality: { score: number; notes: string[] };
};

type PredictiveResponse = {
  ok: true;
  generatedAt: string;
  model: {
    type: string;
    features: string[];
    training: {
      totalProjects: number;
      delay: { labeledSamples: number; positive: number; negative: number };
      costOverrun: { labeledSamples: number; positive: number; negative: number };
    };
  };
  evaluation: { delay: Eval; costOverrun: Eval };
  limitations: string[];
  forecasts: Forecast[];
};

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }
function fmt(v: number | null) { return v === null ? "—" : v.toFixed(4); }

function confidenceTone(c: "low" | "medium" | "high") {
  if (c === "high") return "bg-emerald-50 text-emerald-700";
  if (c === "medium") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}
function riskTone(label: string) {
  if (label === "high_risk") return "bg-red-50 text-red-700";
  if (label === "watch") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

export function ProjectPredictivePanel({ projectId = "all" }: { projectId?: string }) {
  const [data, setData] = useState<PredictiveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams();
    if (projectId !== "all") q.set("projectId", projectId);
    fetch(`/api/reports/predictive${q.toString() ? `?${q.toString()}` : ""}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as PredictiveResponse | { message?: string; error?: string } | null;
        if (!res.ok || !json || !("ok" in json) || !json.ok) {
          const err = json as { message?: string; error?: string } | null;
          throw new Error(err?.message || err?.error || "Could not load predictive analytics.");
        }
        if (!cancelled) { setData(json); setError(null); }
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load predictive analytics."); });
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Predictive analytics</h2>
          <p className="mt-1 text-sm text-black/55">Baseline delay and cost-overrun forecasts from historical project records. Forecasts are decision support, not guarantees.</p>
        </div>
        {data?.generatedAt ? <p className="text-xs text-black/40">Generated {new Date(data.generatedAt).toLocaleString()}</p> : null}
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {!data && !error ? <p className="mt-3 text-sm text-black/45">Loading predictions...</p> : null}

      {data ? (
        <div className="mt-4 grid gap-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-medium">Limitations (read before use)</p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {data.limitations.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <EvalCard title="Delay model evaluation" eval={data.evaluation.delay} training={data.model.training.delay} />
            <EvalCard title="Cost-overrun model evaluation" eval={data.evaluation.costOverrun} training={data.model.training.costOverrun} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-black/5">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-black/[0.02] text-xs text-black/40">
                <tr>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Delay risk</th>
                  <th className="px-3 py-2">Delay confidence</th>
                  <th className="px-3 py-2">Cost-overrun risk</th>
                  <th className="px-3 py-2">Cost confidence</th>
                  <th className="px-3 py-2">Data quality</th>
                </tr>
              </thead>
              <tbody>
                {data.forecasts.map((f) => (
                  <tr key={f.projectId} className="border-t border-black/5 align-top">
                    <td className="px-3 py-2"><p className="font-medium">{f.code}</p><p className="text-xs text-black/45">{f.name}</p><p className="text-[11px] text-black/35">{f.status}</p></td>
                    <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${riskTone(f.delay.label)}`}>{f.delay.label.replaceAll("_", " ")} {pct(f.delay.probability)}</span><ul className="mt-1 list-disc pl-4 text-[11px] text-black/55">{f.delay.drivers.map((d, i) => <li key={i}>{d}</li>)}</ul></td>
                    <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${confidenceTone(f.delay.confidence)}`}>{f.delay.confidence}</span></td>
                    <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${riskTone(f.costOverrun.label)}`}>{f.costOverrun.label.replaceAll("_", " ")} {pct(f.costOverrun.probability)}</span><ul className="mt-1 list-disc pl-4 text-[11px] text-black/55">{f.costOverrun.drivers.map((d, i) => <li key={i}>{d}</li>)}</ul></td>
                    <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${confidenceTone(f.costOverrun.confidence)}`}>{f.costOverrun.confidence}</span></td>
                    <td className="px-3 py-2"><p className="text-xs font-medium">{pct(f.dataQuality.score)}</p><ul className="mt-1 list-disc pl-4 text-[11px] text-black/45">{f.dataQuality.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EvalCard({ title, eval: e, training }: { title: string; eval: Eval; training: { labeledSamples: number; positive: number; negative: number } }) {
  return (
    <div className="rounded-xl border border-black/5 bg-light-gray/30 p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-black/45">Labeled samples: {training.labeledSamples} (positive {training.positive}, negative {training.negative}) · Method: {e.method.replaceAll("_", " ")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <Metric label="Accuracy" value={fmt(e.accuracy)} />
        <Metric label="Precision" value={fmt(e.precision)} />
        <Metric label="Recall" value={fmt(e.recall)} />
        <Metric label="F1" value={fmt(e.f1)} />
        <Metric label="Brier score" value={fmt(e.brierScore)} />
        <Metric label="MAE" value={fmt(e.mae)} />
      </div>
      {e.confusionMatrix ? (
        <p className="mt-2 text-[11px] text-black/45">Confusion matrix: TP {e.confusionMatrix.tp}, FP {e.confusionMatrix.fp}, TN {e.confusionMatrix.tn}, FN {e.confusionMatrix.fn}</p>
      ) : null}
      {e.notes.length > 0 ? <ul className="mt-2 list-disc pl-4 text-[11px] text-black/50">{e.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white px-2 py-1.5"><p className="text-black/40">{label}</p><p className="font-medium tabular-nums">{value}</p></div>;
}
