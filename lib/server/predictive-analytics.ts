import { billLines, lineActual, lineEstimate } from "@/lib/boq";
import type { AdminState, Project } from "@/types";

type Outcome = 0 | 1;

export type PredictiveFeatureVector = {
  progressDeviation: number;
  budgetUtilization: number;
  costVariancePct: number;
  measurementVariancePct: number;
  overdueTaskRate: number;
  taskCompletionRate: number;
  scheduleElapsed: number;
  daysToDeadlineNorm: number;
};

export type ProjectForecast = {
  projectId: string;
  code: string;
  name: string;
  status: Project["status"];
  delay: {
    probability: number;
    confidence: "low" | "medium" | "high";
    label: "low_risk" | "watch" | "high_risk";
    drivers: string[];
  };
  costOverrun: {
    probability: number;
    confidence: "low" | "medium" | "high";
    label: "low_risk" | "watch" | "high_risk";
    drivers: string[];
  };
  features: PredictiveFeatureVector;
  dataQuality: { score: number; notes: string[] };
};

type LabeledSample = {
  projectId: string;
  features: PredictiveFeatureVector;
  delayLabel: Outcome | null;
  costLabel: Outcome | null;
  evaluableDelay: boolean;
  evaluableCost: boolean;
};

type ModelEval = {
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

type TrainedModel = {
  weights: number[];
  bias: number;
  means: number[];
  stds: number[];
  evaluation: ModelEval;
  featureNames: Array<keyof PredictiveFeatureVector>;
};

const FEATURE_NAMES: Array<keyof PredictiveFeatureVector> = [
  "progressDeviation",
  "budgetUtilization",
  "costVariancePct",
  "measurementVariancePct",
  "overdueTaskRate",
  "taskCompletionRate",
  "scheduleElapsed",
  "daysToDeadlineNorm",
];

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }
function safeDiv(a: number, b: number, fallback = 0) { return b === 0 ? fallback : a / b; }
function sigmoid(z: number) {
  if (z >= 35) return 1;
  if (z <= -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

function daysBetween(a: string | Date, b: string | Date) {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return (db - da) / 86400000;
}

function plannedProgress(project: Project, now: Date) {
  const start = new Date(project.startDate).getTime();
  const end = new Date(project.expectedEndDate).getTime();
  const t = now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (t <= start) return 0;
  if (t >= end) return 100;
  return clamp(((t - start) / (end - start)) * 100, 0, 100);
}

function buildFeatures(project: Project, state: AdminState, now: Date): { features: PredictiveFeatureVector; quality: { score: number; notes: string[] } } {
  const tasks = state.tasks.filter((t) => t.projectId === project.id);
  const boq = billLines(state.boq, project.id);
  const planned = plannedProgress(project, now);
  const actual = Number(project.progress ?? 0);
  const progressDeviation = planned === null ? 0 : clamp((planned - actual) / 100, -1, 1); // positive means behind
  const budget = Number(project.budget ?? 0);
  const spent = Number(project.spent ?? 0);
  const budgetUtilization = clamp(safeDiv(spent, budget, 0), 0, 3);
  const costVariancePct = clamp(safeDiv(spent - budget, budget, 0), -1, 3);
  const boqEst = boq.reduce((s, i) => s + lineEstimate(i), 0);
  const boqAct = boq.reduce((s, i) => s + lineActual(i), 0);
  const measurementVariancePct = clamp(safeDiv(boqAct - boqEst, boqEst || budget || 1, 0), -1, 3);
  const overdue = tasks.filter((t) => t.status !== "done" && daysBetween(now, t.dueDate) !== null && (daysBetween(now, t.dueDate) as number) < 0).length;
  const done = tasks.filter((t) => t.status === "done").length;
  const overdueTaskRate = clamp(safeDiv(overdue, tasks.length, 0), 0, 1);
  const taskCompletionRate = clamp(safeDiv(done, tasks.length, actual / 100), 0, 1);
  const totalDays = daysBetween(project.startDate, project.expectedEndDate);
  const elapsedDays = daysBetween(project.startDate, now);
  const scheduleElapsed = clamp(safeDiv(elapsedDays ?? 0, totalDays ?? 1, 0), 0, 2);
  const daysToDeadline = daysBetween(now, project.expectedEndDate);
  const daysToDeadlineNorm = clamp(safeDiv(daysToDeadline ?? 0, 365, 0), -2, 2);

  const notes: string[] = [];
  let score = 1;
  if (planned === null) { score -= 0.2; notes.push("Project dates missing/invalid; planned progress unavailable."); }
  if (budget <= 0) { score -= 0.2; notes.push("Budget missing/zero; cost features less reliable."); }
  if (tasks.length === 0) { score -= 0.15; notes.push("No tasks recorded; task risk signals unavailable."); }
  if (boq.length === 0) { score -= 0.15; notes.push("No BOQ lines recorded; measurement variance signal unavailable."); }
  if (state.progressMarks.filter((m) => m.projectId === project.id).length === 0) { score -= 0.1; notes.push("No progress marks history; trend confidence reduced."); }
  if (notes.length === 0) notes.push("Core project, schedule, budget, task, and BOQ records available.");

  return {
    features: {
      progressDeviation,
      budgetUtilization,
      costVariancePct,
      measurementVariancePct,
      overdueTaskRate,
      taskCompletionRate,
      scheduleElapsed,
      daysToDeadlineNorm,
    },
    quality: { score: clamp(Number(score.toFixed(2)), 0, 1), notes },
  };
}

function labelSamples(state: AdminState, now: Date): LabeledSample[] {
  return state.projects.map((project) => {
    const { features } = buildFeatures(project, state, now);
    const delayed = project.status === "delayed";
    const completed = project.status === "completed";
    const overdueByDate = (() => {
      const d = daysBetween(now, project.expectedEndDate);
      return d !== null && d < 0 && project.status !== "completed";
    })();
    const delayLabel: Outcome | null = delayed || overdueByDate ? 1 : completed ? 0 : null;
    const overBudget = Number(project.spent) > Number(project.budget);
    const costLabel: Outcome | null = (completed || delayed || overBudget) ? (overBudget ? 1 : 0) : null;
    // Evaluable only when outcome is reasonably observed.
    const evaluableDelay = delayed || completed;
    const evaluableCost = completed || delayed || overBudget || (Number(project.budget) > 0 && Number(project.spent) > 0 && project.status !== "planning");
    return { projectId: project.id, features, delayLabel, costLabel, evaluableDelay, evaluableCost };
  });
}

function vectorize(f: PredictiveFeatureVector): number[] {
  return FEATURE_NAMES.map((k) => f[k]);
}

function mean(arr: number[]) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function std(arr: number[]) {
  if (arr.length < 2) return 1;
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v) || 1;
}

function trainLogistic(samples: LabeledSample[], labelKey: "delayLabel" | "costLabel", evalKey: "evaluableDelay" | "evaluableCost"): TrainedModel {
  const usable = samples.filter((s) => s[evalKey] && s[labelKey] !== null);
  const xs = usable.map((s) => vectorize(s.features));
  const ys = usable.map((s) => s[labelKey] as number);
  const featureCount = FEATURE_NAMES.length;
  const means = Array.from({ length: featureCount }, (_, i) => mean(xs.map((x) => x[i] ?? 0)));
  const stds = Array.from({ length: featureCount }, (_, i) => std(xs.map((x) => x[i] ?? 0)));
  const norm = xs.map((x) => x.map((v, i) => (v - means[i]) / (stds[i] || 1)));

  const weights = Array.from({ length: featureCount }, () => 0);
  let bias = 0;
  const n = norm.length;
  const pos = ys.filter((y) => y === 1).length;
  const neg = n - pos;

  const notes: string[] = [];
  if (n < 4) notes.push("Very small labeled sample; model is a baseline and may be unstable.");
  if (pos === 0 || neg === 0) notes.push("Only one class present in labeled data; probabilities are based on class prior/fallback.");

  if (n >= 2 && pos > 0 && neg > 0) {
    const lr = 0.15;
    const l2 = 0.1;
    const epochs = 600;
    for (let e = 0; e < epochs; e++) {
      const gradW = Array.from({ length: featureCount }, () => 0);
      let gradB = 0;
      for (let i = 0; i < n; i++) {
        const x = norm[i];
        const z = bias + weights.reduce((s, w, j) => s + w * x[j], 0);
        const p = sigmoid(z);
        const err = p - ys[i];
        for (let j = 0; j < featureCount; j++) gradW[j] += err * x[j];
        gradB += err;
      }
      for (let j = 0; j < featureCount; j++) {
        weights[j] -= lr * (gradW[j] / n + l2 * weights[j]);
      }
      bias -= lr * (gradB / n);
    }
  } else if (n > 0) {
    // Prior-only fallback
    const prior = pos / n;
    bias = Math.log((prior + 1e-6) / (1 - prior + 1e-6));
  }

  const evaluation = evaluateLOOCV(norm, ys, notes);
  return { weights, bias, means, stds, evaluation, featureNames: FEATURE_NAMES };
}

function evaluateLOOCV(norm: number[][], ys: number[], baseNotes: string[]): ModelEval {
  const n = norm.length;
  const pos = ys.filter((y) => y === 1).length;
  const neg = n - pos;
  const notes = [...baseNotes];
  if (n < 3 || pos === 0 || neg === 0) {
    return { sampleCount: n, positiveCount: pos, negativeCount: neg, method: "insufficient_labeled_data", accuracy: null, precision: null, recall: null, f1: null, brierScore: null, mae: null, confusionMatrix: null, notes: [...notes, "Evaluation requires at least 3 labeled samples with both classes."] };
  }

  const preds: number[] = [];
  for (let hold = 0; hold < n; hold++) {
    const trainX = norm.filter((_, i) => i !== hold);
    const trainY = ys.filter((_, i) => i !== hold);
    const tPos = trainY.filter((y) => y === 1).length;
    const tNeg = trainY.length - tPos;
    const w = Array.from({ length: FEATURE_NAMES.length }, () => 0);
    let b = 0;
    if (tPos > 0 && tNeg > 0) {
      const lr = 0.15, l2 = 0.1, epochs = 400;
      for (let e = 0; e < epochs; e++) {
        const gradW = Array.from({ length: w.length }, () => 0);
        let gradB = 0;
        for (let i = 0; i < trainX.length; i++) {
          const z = b + w.reduce((s, ww, j) => s + ww * trainX[i][j], 0);
          const p = sigmoid(z);
          const err = p - trainY[i];
          for (let j = 0; j < w.length; j++) gradW[j] += err * trainX[i][j];
          gradB += err;
        }
        for (let j = 0; j < w.length; j++) w[j] -= lr * (gradW[j] / trainX.length + l2 * w[j]);
        b -= lr * (gradB / trainX.length);
      }
    } else {
      const prior = tPos / trainY.length;
      b = Math.log((prior + 1e-6) / (1 - prior + 1e-6));
    }
    const z = b + w.reduce((s, ww, j) => s + ww * norm[hold][j], 0);
    preds.push(sigmoid(z));
  }

  let tp = 0, fp = 0, tn = 0, fn = 0;
  let brier = 0;
  let mae = 0;
  for (let i = 0; i < n; i++) {
    const p = preds[i];
    const pred = p >= 0.5 ? 1 : 0;
    const actual = ys[i];
    if (pred === 1 && actual === 1) tp++;
    else if (pred === 1 && actual === 0) fp++;
    else if (pred === 0 && actual === 0) tn++;
    else fn++;
    brier += (p - actual) ** 2;
    mae += Math.abs(p - actual);
  }
  const accuracy = (tp + tn) / n;
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  if (n < 10) notes.push("Small evaluation sample; metrics have high variance and should not be treated as production-grade validation.");
  return {
    sampleCount: n,
    positiveCount: pos,
    negativeCount: neg,
    method: "leave_one_out_cross_validation",
    accuracy: Number(accuracy.toFixed(4)),
    precision: precision === null ? null : Number(precision.toFixed(4)),
    recall: recall === null ? null : Number(recall.toFixed(4)),
    f1: f1 === null ? null : Number(f1.toFixed(4)),
    brierScore: Number((brier / n).toFixed(4)),
    mae: Number((mae / n).toFixed(4)),
    confusionMatrix: { tp, fp, tn, fn },
    notes,
  };
}

function predict(model: TrainedModel, features: PredictiveFeatureVector): number {
  const x = vectorize(features);
  const z = model.bias + model.weights.reduce((s, w, i) => s + w * ((x[i] - model.means[i]) / (model.stds[i] || 1)), 0);
  return clamp(sigmoid(z), 0, 1);
}

function confidence(prob: number, qualityScore: number, evalSample: number): "low" | "medium" | "high" {
  const distance = Math.abs(prob - 0.5); // farther from decision boundary
  const signal = distance * 0.5 + qualityScore * 0.3 + clamp(evalSample / 20, 0, 1) * 0.2;
  if (signal >= 0.62) return "high";
  if (signal >= 0.42) return "medium";
  return "low";
}

function riskLabel(prob: number): "low_risk" | "watch" | "high_risk" {
  if (prob >= 0.67) return "high_risk";
  if (prob >= 0.4) return "watch";
  return "low_risk";
}

function topDrivers(model: TrainedModel, features: PredictiveFeatureVector, kind: "delay" | "cost"): string[] {
  const x = vectorize(features);
  const contributions = model.weights.map((w, i) => {
    const norm = (x[i] - model.means[i]) / (model.stds[i] || 1);
    return { name: FEATURE_NAMES[i], contribution: w * norm, raw: x[i] };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const drivers: string[] = [];
  for (const c of contributions.slice(0, 3)) {
    if (Math.abs(c.contribution) < 0.05) continue;
    drivers.push(describeDriver(c.name, c.raw, c.contribution > 0, kind));
  }
  if (drivers.length === 0) drivers.push("No strong driver from available records; monitor as new data arrives.");
  return drivers;
}

function describeDriver(name: keyof PredictiveFeatureVector, raw: number, increasesRisk: boolean, kind: "delay" | "cost"): string {
  const dir = increasesRisk ? "increases" : "reduces";
  switch (name) {
    case "progressDeviation": return `Progress gap (${(raw * 100).toFixed(1)}% behind planned) ${dir} ${kind} risk.`;
    case "budgetUtilization": return `Budget utilization (${(raw * 100).toFixed(1)}%) ${dir} ${kind} risk.`;
    case "costVariancePct": return `Cost variance (${(raw * 100).toFixed(1)}%) ${dir} ${kind} risk.`;
    case "measurementVariancePct": return `BOQ measurement variance (${(raw * 100).toFixed(1)}%) ${dir} ${kind} risk.`;
    case "overdueTaskRate": return `Overdue task rate (${(raw * 100).toFixed(1)}%) ${dir} ${kind} risk.`;
    case "taskCompletionRate": return `Task completion rate (${(raw * 100).toFixed(1)}%) ${dir} ${kind} risk.`;
    case "scheduleElapsed": return `Schedule elapsed (${(raw * 100).toFixed(1)}% of timeline) ${dir} ${kind} risk.`;
    case "daysToDeadlineNorm": return `Time-to-deadline signal ${dir} ${kind} risk.`;
  }
}

export function buildPredictiveAnalytics(state: AdminState, now = new Date()) {
  const samples = labelSamples(state, now);
  const delayModel = trainLogistic(samples, "delayLabel", "evaluableDelay");
  const costModel = trainLogistic(samples, "costLabel", "evaluableCost");

  const forecasts: ProjectForecast[] = state.projects.map((project) => {
    const { features, quality } = buildFeatures(project, state, now);
    const delayProb = predict(delayModel, features);
    const costProb = predict(costModel, features);
    return {
      projectId: project.id,
      code: project.code,
      name: project.name,
      status: project.status,
      delay: {
        probability: Number(delayProb.toFixed(4)),
        confidence: confidence(delayProb, quality.score, delayModel.evaluation.sampleCount),
        label: riskLabel(delayProb),
        drivers: topDrivers(delayModel, features, "delay"),
      },
      costOverrun: {
        probability: Number(costProb.toFixed(4)),
        confidence: confidence(costProb, quality.score, costModel.evaluation.sampleCount),
        label: riskLabel(costProb),
        drivers: topDrivers(costModel, features, "cost"),
      },
      features,
      dataQuality: quality,
    };
  });

  const limitations = [
    "Baseline predictive model (regularized logistic regression trained from available project records). Not a production ML system.",
    "Evaluation uses leave-one-out cross-validation on labeled historical records available in the system; small samples produce unstable metrics.",
    "Labels are inferred from project status/budget records (delayed/completed/over-budget proxies), not independently audited outcomes.",
    "Forecasts depend on data quality; missing tasks/BOQ/progress marks/dates reduce confidence.",
    "Model does not account for external factors (weather, procurement shocks, contract changes, force majeure) unless reflected in records.",
    "Predictions are decision support only and require human review before action.",
  ];

  return {
    ok: true as const,
    generatedAt: now.toISOString(),
    model: {
      type: "baseline_logistic_regression",
      features: FEATURE_NAMES,
      training: {
        totalProjects: state.projects.length,
        delay: {
          labeledSamples: samples.filter((s) => s.evaluableDelay && s.delayLabel !== null).length,
          positive: samples.filter((s) => s.evaluableDelay && s.delayLabel === 1).length,
          negative: samples.filter((s) => s.evaluableDelay && s.delayLabel === 0).length,
        },
        costOverrun: {
          labeledSamples: samples.filter((s) => s.evaluableCost && s.costLabel !== null).length,
          positive: samples.filter((s) => s.evaluableCost && s.costLabel === 1).length,
          negative: samples.filter((s) => s.evaluableCost && s.costLabel === 0).length,
        },
      },
    },
    evaluation: {
      delay: delayModel.evaluation,
      costOverrun: costModel.evaluation,
    },
    limitations,
    forecasts,
  };
}
