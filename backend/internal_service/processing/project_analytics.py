from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .errors import NonRetryableJobError

JOB_TYPES = ["analytics.project"]


def _num(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        n = float(v)
        return n if n == n and abs(n) != float("inf") else default  # NaN/inf guard
    except Exception:
        return default


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def _days_between(a: Any, b: Any) -> int | None:
    da = _parse_dt(a)
    db = _parse_dt(b)
    if not da or not db:
        return None
    return round((db - da).total_seconds() / 86400)


def _clamp(n: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, n))


def _planned_progress(start_date: Any, end_date: Any, now: datetime) -> float | None:
    start = _parse_dt(start_date)
    end = _parse_dt(end_date)
    if not start or not end or end <= start:
        return None
    if now <= start:
        return 0.0
    if now >= end:
        return 100.0
    total = (end - start).total_seconds()
    return _clamp(((now - start).total_seconds() / total) * 100.0, 0.0, 100.0)


def _as_list(state: dict[str, Any], *keys: str) -> list[dict[str, Any]]:
    for k in keys:
        v = state.get(k)
        if isinstance(v, list):
            return [x for x in v if isinstance(x, dict)]
    return []


def _line_estimate(item: dict[str, Any]) -> float:
    return max(0.0, _num(item.get("estimatedQty"))) * max(0.0, _num(item.get("unitRate")))


def _line_actual(item: dict[str, Any]) -> float:
    actual = item.get("actualQty")
    if actual is None:
        actual = item.get("measuredQty")
    return max(0.0, _num(actual)) * max(0.0, _num(item.get("unitRate")))


def build_project_analytics(state: dict[str, Any], *, project_id: str = "all", now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    projects = _as_list(state, "projects")
    if project_id != "all":
        projects = [p for p in projects if p.get("id") == project_id]
    tasks = _as_list(state, "tasks")
    boq = _as_list(state, "boq", "boqLines")

    project_metrics = []
    for project in projects:
        pid = project.get("id")
        project_tasks = [t for t in tasks if t.get("projectId") == pid]
        project_boq = [b for b in boq if b.get("projectId") == pid]

        completed_tasks = sum(1 for t in project_tasks if str(t.get("status")).lower() in ("completed", "done"))
        overdue_tasks = 0
        for t in project_tasks:
            if str(t.get("status")).lower() in ("completed", "done"):
                continue
            due = _parse_dt(t.get("dueDate"))
            if due and due.timestamp() < now.timestamp():
                overdue_tasks += 1
        in_progress_tasks = sum(1 for t in project_tasks if str(t.get("status")).lower() == "in_progress")

        planned = _planned_progress(project.get("startDate"), project.get("expectedEndDate"), now)
        actual_progress = _num(project.get("progress"), 0.0)
        progress_deviation = None if planned is None else round(actual_progress - planned, 2)
        schedule_days = _days_between(now, project.get("expectedEndDate"))
        status = str(project.get("status", "")).lower()
        if status == "completed":
            schedule_status = "completed"
        elif schedule_days is None:
            schedule_status = "unknown"
        elif schedule_days < 0:
            schedule_status = "behind_schedule"
        elif progress_deviation is not None and progress_deviation < -10:
            schedule_status = "at_risk"
        else:
            schedule_status = "on_track"

        boq_estimated = sum(_line_estimate(i) for i in project_boq)
        boq_actual = sum(_line_actual(i) for i in project_boq)
        measurement_variance = boq_actual - boq_estimated
        measurement_variance_pct = None if boq_estimated == 0 else round((measurement_variance / boq_estimated) * 100, 2)

        budget = _num(project.get("budget"), 0.0)
        spent = _num(project.get("spent"), 0.0)
        cost_variance = spent - budget
        cost_variance_pct = None if budget == 0 else round((cost_variance / budget) * 100, 2)

        insights: list[str] = []
        if progress_deviation is not None and progress_deviation <= -15:
            insights.append(f"Progress is {abs(progress_deviation):.1f}% behind planned schedule.")
        if progress_deviation is not None and progress_deviation >= 10:
            insights.append(f"Progress is {progress_deviation:.1f}% ahead of planned schedule.")
        if schedule_days is not None and schedule_days < 0 and status != "completed":
            insights.append(f"Project is {abs(schedule_days)} day(s) past expected completion.")
        if overdue_tasks > 0:
            insights.append(f"{overdue_tasks} task(s) are overdue.")
        if cost_variance > 0:
            insights.append(f"Spent is {cost_variance:,.0f} RWF over budget.")
        if measurement_variance > 0:
            insights.append(f"Actual BOQ measurements exceed estimate by {measurement_variance:,.0f} RWF.")
        if budget > 0 and spent / budget >= 0.9 and status != "completed":
            insights.append("Budget utilization is at or above 90%.")
        if not insights:
            insights.append("No major deviation detected from current records.")

        project_metrics.append({
            "projectId": pid,
            "code": project.get("code"),
            "name": project.get("name"),
            "status": project.get("status"),
            "managerId": project.get("managerId"),
            "startDate": project.get("startDate"),
            "expectedEndDate": project.get("expectedEndDate"),
            "progress": {
                "actualPercent": actual_progress,
                "plannedPercent": None if planned is None else round(planned, 2),
                "deviationPercent": progress_deviation,
                "completedTasks": completed_tasks,
                "inProgressTasks": in_progress_tasks,
                "overdueTasks": overdue_tasks,
                "totalTasks": len(project_tasks),
                "taskCompletionPercent": None if not project_tasks else round((completed_tasks / len(project_tasks)) * 100, 2),
            },
            "measurements": {
                "boqLineCount": len(project_boq),
                "estimatedAmount": boq_estimated,
                "actualAmount": boq_actual,
                "varianceAmount": measurement_variance,
                "variancePercent": measurement_variance_pct,
            },
            "cost": {
                "budget": budget,
                "spent": spent,
                "varianceAmount": cost_variance,
                "variancePercent": cost_variance_pct,
                "utilizationPercent": None if budget == 0 else round((spent / budget) * 100, 2),
            },
            "schedule": {
                "daysToExpectedEnd": schedule_days,
                "status": schedule_status,
                "overdueTasks": overdue_tasks,
            },
            "insights": insights,
        })

    planned_vals = [p["progress"]["plannedPercent"] for p in project_metrics if p["progress"]["plannedPercent"] is not None]
    portfolio = {
        "projectCount": len(project_metrics),
        "activeProjects": sum(1 for p in project_metrics if p["status"] == "active"),
        "completedProjects": sum(1 for p in project_metrics if p["status"] == "completed"),
        "delayedProjects": sum(1 for p in project_metrics if p["status"] == "delayed" or p["schedule"]["status"] == "behind_schedule"),
        "atRiskProjects": sum(1 for p in project_metrics if p["schedule"]["status"] == "at_risk"),
        "averageProgress": 0 if not project_metrics else round(sum(p["progress"]["actualPercent"] for p in project_metrics) / len(project_metrics), 2),
        "averagePlannedProgress": None if not planned_vals else round(sum(planned_vals) / len(planned_vals), 2),
        "totalBudget": sum(p["cost"]["budget"] for p in project_metrics),
        "totalSpent": sum(p["cost"]["spent"] for p in project_metrics),
        "totalCostVariance": sum(p["cost"]["varianceAmount"] for p in project_metrics),
        "totalEstimatedMeasurement": sum(p["measurements"]["estimatedAmount"] for p in project_metrics),
        "totalActualMeasurement": sum(p["measurements"]["actualAmount"] for p in project_metrics),
        "totalMeasurementVariance": sum(p["measurements"]["varianceAmount"] for p in project_metrics),
        "overdueTasks": sum(p["progress"]["overdueTasks"] for p in project_metrics),
    }

    deviations = {
        "costOverruns": [{"projectId": p["projectId"], "code": p["code"], "name": p["name"], "varianceAmount": p["cost"]["varianceAmount"], "variancePercent": p["cost"]["variancePercent"]} for p in project_metrics if p["cost"]["varianceAmount"] > 0],
        "scheduleBehind": [{"projectId": p["projectId"], "code": p["code"], "name": p["name"], "deviationPercent": p["progress"]["deviationPercent"], "daysToExpectedEnd": p["schedule"]["daysToExpectedEnd"], "status": p["schedule"]["status"]} for p in project_metrics if (p["progress"]["deviationPercent"] or 0) < 0 or p["schedule"]["status"] == "behind_schedule"],
        "measurementOverruns": [{"projectId": p["projectId"], "code": p["code"], "name": p["name"], "varianceAmount": p["measurements"]["varianceAmount"], "variancePercent": p["measurements"]["variancePercent"]} for p in project_metrics if p["measurements"]["varianceAmount"] > 0],
    }

    return {
        "ok": True,
        "generatedAt": now.isoformat(),
        "scope": {"projectId": project_id},
        "portfolio": portfolio,
        "deviations": deviations,
        "projects": project_metrics,
    }


async def handle(job: dict[str, Any], ctx: Any) -> dict[str, Any]:
    payload = job.get("payload") or {}
    state = payload.get("state") if isinstance(payload.get("state"), dict) else payload
    if not isinstance(state, dict) or not isinstance(state.get("projects"), list):
        raise NonRetryableJobError("analytics.project requires payload.state or payload.projects", code="invalid-payload")
    project_id = str(payload.get("projectId") or payload.get("project") or "all")
    now_raw = payload.get("now")
    now = _parse_dt(now_raw) if now_raw else datetime.now(timezone.utc)
    return build_project_analytics(state, project_id=project_id, now=now)
