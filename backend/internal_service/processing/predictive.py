from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from .errors import NonRetryableJobError

JOB_TYPES = ["analytics.predictive"]

FEATURE_NAMES = [
    "progressDeviation",
    "budgetUtilization",
    "costVariancePct",
    "measurementVariancePct",
    "overdueTaskRate",
    "taskCompletionRate",
    "scheduleElapsed",
    "daysToDeadlineNorm",
]


def _clamp(n: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, n))


def _safe_div(a: float, b: float, fallback: float = 0.0) -> float:
    return fallback if b == 0 else a / b


def _sigmoid(z: float) -> float:
    if z >= 35:
        return 1.0
    if z <= -35:
        return 0.0
    return 1.0 / (1.0 + math.exp(-z))


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        try:
            # ms or s heuristic
            ts = float(value)
            if ts > 1_000_000_000_000:
                ts /= 1000.0
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        except Exception:
            return None
    if isinstance(value, str):
        try:
            v = value.replace("Z", "+00:00")
            dt = datetime.fromisoformat(v)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def _days_between(a: Any, b: Any) -> float | None:
    da = _parse_dt(a)
    db = _parse_dt(b)
    if not da or not db:
        return None
    return (db - da).total_seconds() / 86400.0


def _num(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        n = float(v)
        return n if math.isfinite(n) else default
    except Exception:
        return default


def _as_list(state: dict[str, Any], *keys: str) -> list[dict[str, Any]]:
    for k in keys:
        v = state.get(k)
        if isinstance(v, list):
            return [x for x in v if isinstance(x, dict)]
    return []


def _boq_line_estimate(line: dict[str, Any]) -> float:
    est = line.get("estimatedQty")
    if est is None:
        est = line.get("estimatedQty", line.get("qty"))
    rate = line.get("unitRate", line.get("rate"))
    return max(0.0, _num(est)) * max(0.0, _num(rate))


def _boq_line_actual(line: dict[str, Any]) -> float:
    actual = line.get("actualQty")
    if actual is None:
        actual = line.get("measuredQty")
    rate = line.get("unitRate", line.get("rate"))
    return max(0.0, _num(actual)) * max(0.0, _num(rate))


def _planned_progress(project: dict[str, Any], now: datetime) -> float | None:
    start = _parse_dt(project.get("startDate"))
    end = _parse_dt(project.get("expectedEndDate") or project.get("endDate"))
    if not start or not end or end <= start:
        return None
    t = now
    if t <= start:
        return 0.0
    if t >= end:
        return 100.0
    total = (end - start).total_seconds()
    return _clamp(((t - start).total_seconds() / total) * 100.0, 0.0, 100.0)


def _build_features(project: dict[str, Any], state: dict[str, Any], now: datetime) -> dict[str, Any]:
    pid = project.get("id")
    tasks = [t for t in _as_list(state, "tasks") if t.get("projectId") == pid]
    boq = [b for b in _as_list(state, "boq", "boqLines") if b.get("projectId") == pid]
    marks = [m for m in _as_list(state, "progressMarks") if m.get("projectId") == pid]

    planned = _planned_progress(project, now)
    actual = _num(project.get("progress"), 0.0)
    progress_deviation = 0.0 if planned is None else _clamp((planned - actual) / 100.0, -1.0, 1.0)
    budget = _num(project.get("budget"), 0.0)
    spent = _num(project.get("spent"), 0.0)
    budget_util = _clamp(_safe_div(spent, budget, 0.0), 0.0, 3.0)
    cost_var = _clamp(_safe_div(spent - budget, budget, 0.0), -1.0, 3.0)
    boq_est = sum(_boq_line_estimate(i) for i in boq)
    boq_act = sum(_boq_line_actual(i) for i in boq)
    meas_var = _clamp(_safe_div(boq_act - boq_est, boq_est or budget or 1.0, 0.0), -1.0, 3.0)

    overdue = 0
    done = 0
    for t in tasks:
        status = str(t.get("status", "")).lower()
        if status == "done":
            done += 1
        d = _days_between(now, t.get("dueDate"))
        if status != "done" and d is not None and d < 0:
            overdue += 1
    overdue_rate = _clamp(_safe_div(overdue, len(tasks), 0.0), 0.0, 1.0)
    completion_rate = _clamp(_safe_div(done, len(tasks), actual / 100.0), 0.0, 1.0)

    total_days = _days_between(project.get("startDate"), project.get("expectedEndDate") or project.get("endDate"))
    elapsed_days = _days_between(project.get("startDate"), now)
    schedule_elapsed = _clamp(_safe_div(elapsed_days or 0.0, total_days or 1.0, 0.0), 0.0, 2.0)
    days_to_deadline = _days_between(now, project.get("expectedEndDate") or project.get("endDate"))
    days_to_deadline_norm = _clamp(_safe_div(days_to_deadline or 0.0, 365.0, 0.0), -2.0, 2.0)

    notes: list[str] = []
    score = 1.0
    if planned is None:
        score -= 0.2
        notes.append("Project dates missing/invalid; planned progress unavailable.")
    if budget <= 0:
        score -= 0.2
        notes.append("Budget missing/zero; cost features less reliable.")
    if not tasks:
        score -= 0.15
        notes.append("No tasks recorded; task risk signals unavailable.")
    if not boq:
        score -= 0.15
        notes.append("No BOQ lines recorded; measurement variance signal unavailable.")
    if not marks:
        score -= 0.1
        notes.append("No progress marks history; trend confidence reduced.")
    if not notes:
        notes.append("Core project, schedule, budget, task, and BOQ records available.")

    return {
        "features": {
            "progressDeviation": progress_deviation,
            "budgetUtilization": budget_util,
            "costVariancePct": cost_var,
            "measurementVariancePct": meas_var,
            "overdueTaskRate": overdue_rate,
            "taskCompletionRate": completion_rate,
            "scheduleElapsed": schedule_elapsed,
            "daysToDeadlineNorm": days_to_deadline_norm,
        },
        "quality": {"score": round(_clamp(score, 0.0, 1.0), 2), "notes": notes},
    }


def _vectorize(features: dict[str, Any]) -> list[float]:
    return [_num(features.get(k), 0.0) for k in FEATURE_NAMES]


def _mean(arr: list[float]) -> float:
    return sum(arr) / len(arr) if arr else 0.0


def _std(arr: list[float]) -> float:
    if len(arr) < 2:
        return 1.0
    m = _mean(arr)
    v = _mean([(x - m) ** 2 for x in arr])
    return math.sqrt(v) or 1.0


def _label_samples(state: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    samples = []
    for project in _as_list(state, "projects"):
        built = _build_features(project, state, now)
        features = built["features"]
        status = str(project.get("status", "")).lower()
        delayed = status == "delayed"
        completed = status == "completed"
        d = _days_between(now, project.get("expectedEndDate") or project.get("endDate"))
        overdue_by_date = d is not None and d < 0 and status != "completed"
        delay_label = 1 if (delayed or overdue_by_date) else (0 if completed else None)
        spent = _num(project.get("spent"))
        budget = _num(project.get("budget"))
        over_budget = spent > budget
        cost_label = (1 if over_budget else 0) if (completed or delayed or over_budget) else None
        evaluable_delay = delayed or completed
        evaluable_cost = completed or delayed or over_budget or (budget > 0 and spent > 0 and status != "planning")
        samples.append({
            "projectId": project.get("id"),
            "features": features,
            "delayLabel": delay_label,
            "costLabel": cost_label,
            "evaluableDelay": evaluable_delay,
            "evaluableCost": evaluable_cost,
        })
    return samples


def _evaluate_loocv(norm: list[list[float]], ys: list[int], base_notes: list[str]) -> dict[str, Any]:
    n = len(norm)
    pos = sum(1 for y in ys if y == 1)
    neg = n - pos
    notes = list(base_notes)
    if n < 3 or pos == 0 or neg == 0:
        return {
            "sampleCount": n, "positiveCount": pos, "negativeCount": neg,
            "method": "insufficient_labeled_data",
            "accuracy": None, "precision": None, "recall": None, "f1": None,
            "brierScore": None, "mae": None, "confusionMatrix": None,
            "notes": notes + ["Evaluation requires at least 3 labeled samples with both classes."],
        }

    preds: list[float] = []
    for hold in range(n):
        train_x = [x for i, x in enumerate(norm) if i != hold]
        train_y = [y for i, y in enumerate(ys) if i != hold]
        tpos = sum(1 for y in train_y if y == 1)
        tneg = len(train_y) - tpos
        w = [0.0] * len(FEATURE_NAMES)
        b = 0.0
        if tpos > 0 and tneg > 0:
            lr, l2, epochs = 0.15, 0.1, 400
            for _ in range(epochs):
                grad_w = [0.0] * len(w)
                grad_b = 0.0
                for i, x in enumerate(train_x):
                    z = b + sum(ww * x[j] for j, ww in enumerate(w))
                    p = _sigmoid(z)
                    err = p - train_y[i]
                    for j in range(len(w)):
                        grad_w[j] += err * x[j]
                    grad_b += err
                for j in range(len(w)):
                    w[j] -= lr * (grad_w[j] / len(train_x) + l2 * w[j])
                b -= lr * (grad_b / len(train_x))
        else:
            prior = tpos / len(train_y)
            b = math.log((prior + 1e-6) / (1 - prior + 1e-6))
        z = b + sum(ww * norm[hold][j] for j, ww in enumerate(w))
        preds.append(_sigmoid(z))

    tp = fp = tn = fn = 0
    brier = 0.0
    mae = 0.0
    for i in range(n):
        p = preds[i]
        pred = 1 if p >= 0.5 else 0
        actual = ys[i]
        if pred == 1 and actual == 1:
            tp += 1
        elif pred == 1 and actual == 0:
            fp += 1
        elif pred == 0 and actual == 0:
            tn += 1
        else:
            fn += 1
        brier += (p - actual) ** 2
        mae += abs(p - actual)
    accuracy = (tp + tn) / n
    precision = (tp / (tp + fp)) if (tp + fp) else None
    recall = (tp / (tp + fn)) if (tp + fn) else None
    f1 = (2 * precision * recall / (precision + recall)) if (precision is not None and recall is not None and (precision + recall) > 0) else None
    if n < 10:
        notes.append("Small evaluation sample; metrics have high variance and should not be treated as production-grade validation.")
    return {
        "sampleCount": n, "positiveCount": pos, "negativeCount": neg,
        "method": "leave_one_out_cross_validation",
        "accuracy": round(accuracy, 4),
        "precision": None if precision is None else round(precision, 4),
        "recall": None if recall is None else round(recall, 4),
        "f1": None if f1 is None else round(f1, 4),
        "brierScore": round(brier / n, 4),
        "mae": round(mae / n, 4),
        "confusionMatrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "notes": notes,
    }


def _train_logistic(samples: list[dict[str, Any]], label_key: str, eval_key: str) -> dict[str, Any]:
    usable = [s for s in samples if s.get(eval_key) and s.get(label_key) is not None]
    xs = [_vectorize(s["features"]) for s in usable]
    ys = [int(s[label_key]) for s in usable]
    fc = len(FEATURE_NAMES)
    means = [_mean([x[i] for x in xs]) for i in range(fc)]
    stds = [_std([x[i] for x in xs]) for i in range(fc)]
    norm = [[(x[i] - means[i]) / (stds[i] or 1.0) for i in range(fc)] for x in xs]
    weights = [0.0] * fc
    bias = 0.0
    n = len(norm)
    pos = sum(1 for y in ys if y == 1)
    neg = n - pos
    notes: list[str] = []
    if n < 4:
        notes.append("Very small labeled sample; model is a baseline and may be unstable.")
    if pos == 0 or neg == 0:
        notes.append("Only one class present in labeled data; probabilities are based on class prior/fallback.")

    if n >= 2 and pos > 0 and neg > 0:
        lr, l2, epochs = 0.15, 0.1, 600
        for _ in range(epochs):
            grad_w = [0.0] * fc
            grad_b = 0.0
            for i, x in enumerate(norm):
                z = bias + sum(weights[j] * x[j] for j in range(fc))
                p = _sigmoid(z)
                err = p - ys[i]
                for j in range(fc):
                    grad_w[j] += err * x[j]
                grad_b += err
            for j in range(fc):
                weights[j] -= lr * (grad_w[j] / n + l2 * weights[j])
            bias -= lr * (grad_b / n)
    elif n > 0:
        prior = pos / n
        bias = math.log((prior + 1e-6) / (1 - prior + 1e-6))

    evaluation = _evaluate_loocv(norm, ys, notes)
    return {"weights": weights, "bias": bias, "means": means, "stds": stds, "evaluation": evaluation}


def _predict(model: dict[str, Any], features: dict[str, Any]) -> float:
    x = _vectorize(features)
    means = model["means"]
    stds = model["stds"]
    weights = model["weights"]
    z = model["bias"] + sum(weights[i] * ((x[i] - means[i]) / (stds[i] or 1.0)) for i in range(len(FEATURE_NAMES)))
    return _clamp(_sigmoid(z), 0.0, 1.0)


def _confidence(prob: float, quality_score: float, eval_sample: int) -> str:
    distance = abs(prob - 0.5)
    signal = distance * 0.5 + quality_score * 0.3 + _clamp(eval_sample / 20.0, 0.0, 1.0) * 0.2
    if signal >= 0.62:
        return "high"
    if signal >= 0.42:
        return "medium"
    return "low"


def _risk_label(prob: float) -> str:
    if prob >= 0.67:
        return "high_risk"
    if prob >= 0.4:
        return "watch"
    return "low_risk"


def _describe_driver(name: str, raw: float, increases_risk: bool, kind: str) -> str:
    direction = "increases" if increases_risk else "reduces"
    if name == "progressDeviation":
        return f"Progress gap ({raw * 100:.1f}% behind planned) {direction} {kind} risk."
    if name == "budgetUtilization":
        return f"Budget utilization ({raw * 100:.1f}%) {direction} {kind} risk."
    if name == "costVariancePct":
        return f"Cost variance ({raw * 100:.1f}%) {direction} {kind} risk."
    if name == "measurementVariancePct":
        return f"BOQ measurement variance ({raw * 100:.1f}%) {direction} {kind} risk."
    if name == "overdueTaskRate":
        return f"Overdue task rate ({raw * 100:.1f}%) {direction} {kind} risk."
    if name == "taskCompletionRate":
        return f"Task completion rate ({raw * 100:.1f}%) {direction} {kind} risk."
    if name == "scheduleElapsed":
        return f"Schedule elapsed ({raw * 100:.1f}% of timeline) {direction} {kind} risk."
    if name == "daysToDeadlineNorm":
        return f"Time-to-deadline signal {direction} {kind} risk."
    return f"{name} {direction} {kind} risk."


def _top_drivers(model: dict[str, Any], features: dict[str, Any], kind: str) -> list[str]:
    x = _vectorize(features)
    means = model["means"]
    stds = model["stds"]
    weights = model["weights"]
    contribs = []
    for i, name in enumerate(FEATURE_NAMES):
        norm = (x[i] - means[i]) / (stds[i] or 1.0)
        contribs.append({"name": name, "contribution": weights[i] * norm, "raw": x[i]})
    contribs.sort(key=lambda c: abs(c["contribution"]), reverse=True)
    drivers = []
    for c in contribs[:3]:
        if abs(c["contribution"]) < 0.05:
            continue
        drivers.append(_describe_driver(c["name"], c["raw"], c["contribution"] > 0, kind))
    if not drivers:
        drivers.append("No strong driver from available records; monitor as new data arrives.")
    return drivers


def build_predictive_analytics(state: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    samples = _label_samples(state, now)
    delay_model = _train_logistic(samples, "delayLabel", "evaluableDelay")
    cost_model = _train_logistic(samples, "costLabel", "evaluableCost")

    forecasts = []
    for project in _as_list(state, "projects"):
        built = _build_features(project, state, now)
        features = built["features"]
        quality = built["quality"]
        delay_prob = _predict(delay_model, features)
        cost_prob = _predict(cost_model, features)
        forecasts.append({
            "projectId": project.get("id"),
            "code": project.get("code"),
            "name": project.get("name"),
            "status": project.get("status"),
            "delay": {
                "probability": round(delay_prob, 4),
                "confidence": _confidence(delay_prob, quality["score"], delay_model["evaluation"]["sampleCount"]),
                "label": _risk_label(delay_prob),
                "drivers": _top_drivers(delay_model, features, "delay"),
            },
            "costOverrun": {
                "probability": round(cost_prob, 4),
                "confidence": _confidence(cost_prob, quality["score"], cost_model["evaluation"]["sampleCount"]),
                "label": _risk_label(cost_prob),
                "drivers": _top_drivers(cost_model, features, "cost"),
            },
            "features": features,
            "dataQuality": quality,
        })

    limitations = [
        "Baseline predictive model (regularized logistic regression trained from available project records). Not a production ML system.",
        "Evaluation uses leave-one-out cross-validation on labeled historical records available in the system; small samples produce unstable metrics.",
        "Labels are inferred from project status/budget records (delayed/completed/over-budget proxies), not independently audited outcomes.",
        "Forecasts depend on data quality; missing tasks/BOQ/progress marks/dates reduce confidence.",
        "Model does not account for external factors (weather, procurement shocks, contract changes, force majeure) unless reflected in records.",
        "Predictions are decision support only and require human review before action.",
    ]

    return {
        "ok": True,
        "generatedAt": now.isoformat(),
        "model": {
            "type": "baseline_logistic_regression",
            "features": FEATURE_NAMES,
            "training": {
                "totalProjects": len(_as_list(state, "projects")),
                "delay": {
                    "labeledSamples": sum(1 for s in samples if s.get("evaluableDelay") and s.get("delayLabel") is not None),
                    "positive": sum(1 for s in samples if s.get("evaluableDelay") and s.get("delayLabel") == 1),
                    "negative": sum(1 for s in samples if s.get("evaluableDelay") and s.get("delayLabel") == 0),
                },
                "costOverrun": {
                    "labeledSamples": sum(1 for s in samples if s.get("evaluableCost") and s.get("costLabel") is not None),
                    "positive": sum(1 for s in samples if s.get("evaluableCost") and s.get("costLabel") == 1),
                    "negative": sum(1 for s in samples if s.get("evaluableCost") and s.get("costLabel") == 0),
                },
            },
        },
        "evaluation": {"delay": delay_model["evaluation"], "costOverrun": cost_model["evaluation"]},
        "limitations": limitations,
        "forecasts": forecasts,
    }


async def handle(job: dict[str, Any], ctx: Any) -> dict[str, Any]:
    payload = job.get("payload") or {}
    state = payload.get("state") if isinstance(payload.get("state"), dict) else None
    if state is None:
        # Allow passing state fields directly in payload.
        if any(k in payload for k in ("projects", "tasks", "boq", "boqLines", "progressMarks")):
            state = payload
    if not isinstance(state, dict):
        raise NonRetryableJobError("analytics.predictive requires payload.state or payload with project records", code="invalid-payload")
    now_raw = payload.get("now")
    now = _parse_dt(now_raw) if now_raw else datetime.now(timezone.utc)
    return build_predictive_analytics(state, now=now)
