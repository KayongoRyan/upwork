from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .errors import NonRetryableJobError

JOB_TYPES = ["report.monthly-progress", "report.project-workbook"]


def _num(v: Any, default: float = 0.0) -> float:
    try:
        if v is None or v == "":
            return default
        n = float(v)
        return n if n == n and abs(n) != float("inf") else default
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


def _month_range(month_raw: str) -> tuple[datetime, datetime, str, str]:
    try:
        year_s, month_s = month_raw.split("-", 1)
        year = int(year_s)
        month = int(month_s)
        if month < 1 or month > 12:
            raise ValueError()
    except Exception:
        raise NonRetryableJobError("month must be YYYY-MM", code="invalid-payload")
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    # end exclusive; report uses inclusive display
    from_s = start.date().isoformat()
    to_s = (end - __import__("datetime").timedelta(days=1)).date().isoformat()
    return start, end, from_s, to_s


def _in_month(value: Any, start: datetime, end_exclusive: datetime) -> bool:
    dt = _parse_dt(value)
    if not dt:
        return False
    ts = dt.timestamp()
    return start.timestamp() <= ts < end_exclusive.timestamp()


def _user_name(users_by_id: dict[str, dict[str, Any]], uid: Any) -> str:
    u = users_by_id.get(str(uid)) if uid is not None else None
    if not u:
        return "Unassigned" if uid is None or uid == "" else str(uid)
    first = str(u.get("firstName") or "").strip()
    last = str(u.get("lastName") or "").strip()
    name = f"{first} {last}".strip()
    return name or str(u.get("email") or uid)


def build_monthly_progress(state: dict[str, Any], *, month: str, project_id: str = "all") -> dict[str, Any]:
    start, end, from_s, to_s = _month_range(month)
    projects = _as_list(state, "projects")
    if project_id != "all":
        projects = [p for p in projects if str(p.get("id")) == project_id]
    ids = {str(p.get("id")) for p in projects}
    users_by_id = {str(u.get("id")): u for u in _as_list(state, "users")}
    tasks = [t for t in _as_list(state, "tasks") if str(t.get("projectId")) in ids]
    reports = [r for r in _as_list(state, "reports") if str(r.get("projectId")) in ids]
    marks = [m for m in _as_list(state, "progressMarks") if str(m.get("projectId")) in ids]
    boq = [b for b in _as_list(state, "boq", "boqLines") if str(b.get("projectId")) in ids]

    summary = {
        "report": "CPMIS Monthly Progress Report",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "month": month,
        "periodStart": from_s,
        "periodEnd": to_s,
        "projectFilter": "All projects" if project_id == "all" else (projects[0].get("code") if projects else project_id),
        "projectsIncluded": len(projects),
        "totalTasks": len(tasks),
        "tasksCompleted": sum(1 for t in tasks if str(t.get("status")).lower() in ("done", "completed")),
        "siteReportsInMonth": sum(1 for r in reports if _in_month(r.get("submittedAt") or r.get("periodEnd") or r.get("periodStart"), start, end)),
        "progressMarksInMonth": sum(1 for m in marks if _in_month(m.get("recordedAt"), start, end)),
    }

    project_rows = []
    for project in projects:
        pid = str(project.get("id"))
        p_tasks = [t for t in tasks if str(t.get("projectId")) == pid]
        done_tasks = sum(1 for t in p_tasks if str(t.get("status")).lower() in ("done", "completed"))
        open_tasks = len(p_tasks) - done_tasks
        task_completion = round((done_tasks / len(p_tasks)) * 100, 2) if p_tasks else 0.0
        month_reports = [r for r in reports if str(r.get("projectId")) == pid and _in_month(r.get("submittedAt") or r.get("periodEnd") or r.get("periodStart"), start, end)]
        approved = sum(1 for r in month_reports if str(r.get("status")).lower() == "approved")
        pending = sum(1 for r in month_reports if str(r.get("status")).lower() in ("submitted", "in_review"))
        rejected = sum(1 for r in month_reports if str(r.get("status")).lower() == "rejected")
        month_marks = sorted([m for m in marks if str(m.get("projectId")) == pid and _in_month(m.get("recordedAt"), start, end)], key=lambda m: str(m.get("recordedAt") or ""), reverse=True)
        latest_mark = month_marks[0] if month_marks else None
        p_boq = [b for b in boq if str(b.get("projectId")) == pid]
        estimate = sum(_line_estimate(b) for b in p_boq)
        actual = sum(_line_actual(b) for b in p_boq)
        project_rows.append({
            "code": project.get("code"),
            "name": project.get("name"),
            "manager": _user_name(users_by_id, project.get("managerId")),
            "status": project.get("status"),
            "currentProgressPercent": _num(project.get("progress")),
            "budgetRWF": _num(project.get("budget")),
            "spentRWF": _num(project.get("spent")),
            "boqEstimatedRWF": estimate,
            "boqActualRWF": actual,
            "boqVarianceRWF": actual - estimate,
            "tasksTotal": len(p_tasks),
            "tasksDone": done_tasks,
            "tasksOpen": open_tasks,
            "taskCompletionPercent": task_completion,
            "siteReportsMonth": len(month_reports),
            "approvedReportsMonth": approved,
            "pendingReviewReportsMonth": pending,
            "rejectedReportsMonth": rejected,
            "progressMarksMonth": len(month_marks),
            "latestProgressMarkPercent": latest_mark.get("progress") if latest_mark else None,
            "latestProgressNote": latest_mark.get("note") if latest_mark else None,
        })

    task_rows = []
    for t in tasks:
        p = next((pr for pr in projects if str(pr.get("id")) == str(t.get("projectId"))), None)
        completed_in_month = str(t.get("status")).lower() in ("done", "completed") and _in_month(t.get("completedAt") or t.get("dueDate"), start, end)
        task_rows.append({
            "projectCode": p.get("code") if p else "",
            "project": p.get("name") if p else "",
            "task": t.get("title"),
            "assignee": t.get("assignee") or "",
            "priority": t.get("priority") or "",
            "status": t.get("status"),
            "dueDate": t.get("dueDate"),
            "progressPercent": _num(t.get("progress")),
            "completedInMonth": completed_in_month,
        })

    report_rows = []
    for r in sorted(reports, key=lambda x: str(x.get("submittedAt") or x.get("periodEnd") or ""), reverse=True):
        if not _in_month(r.get("submittedAt") or r.get("periodEnd") or r.get("periodStart"), start, end):
            continue
        p = next((pr for pr in projects if str(pr.get("id")) == str(r.get("projectId"))), None)
        eng = users_by_id.get(str(r.get("engineerId")))
        eng_name = f"{str(eng.get('firstName','')).strip()} {str(eng.get('lastName','')).strip()}".strip() if eng else str(r.get("engineerId") or "")
        report_rows.append({
            "projectCode": p.get("code") if p else "",
            "project": p.get("name") if p else "",
            "reportId": r.get("id"),
            "engineer": eng_name,
            "periodStart": r.get("periodStart"),
            "periodEnd": r.get("periodEnd"),
            "submittedAt": r.get("submittedAt"),
            "status": r.get("status"),
            "progressPercent": _num(r.get("progress")),
            "summary": r.get("summary") or "",
            "issues": r.get("issues") or "",
        })

    return {
        "ok": True,
        "generatedAt": summary["generatedAt"],
        "month": month,
        "period": {"start": from_s, "end": to_s},
        "scope": {"projectId": project_id},
        "summary": summary,
        "projectProgress": project_rows,
        "tasks": task_rows,
        "siteReports": report_rows,
    }


def build_project_workbook(state: dict[str, Any], *, project_id: str = "all", from_date: str | None = None, to_date: str | None = None) -> dict[str, Any]:
    projects = _as_list(state, "projects")
    if project_id != "all":
        projects = [p for p in projects if str(p.get("id")) == project_id]
    ids = {str(p.get("id")) for p in projects}
    users_by_id = {str(u.get("id")): u for u in _as_list(state, "users")}
    boq = [b for b in _as_list(state, "boq", "boqLines") if str(b.get("projectId")) in ids]
    cost_reports = [r for r in _as_list(state, "costReports") if str(r.get("projectId")) in ids]

    project_rows = []
    total_budget = total_spent = total_est = total_act = 0.0
    for p in projects:
        pid = str(p.get("id"))
        p_boq = [b for b in boq if str(b.get("projectId")) == pid]
        est = sum(_line_estimate(b) for b in p_boq)
        act = sum(_line_actual(b) for b in p_boq)
        budget = _num(p.get("budget"))
        spent = _num(p.get("spent"))
        total_budget += budget; total_spent += spent; total_est += est; total_act += act
        project_rows.append({
            "code": p.get("code"), "name": p.get("name"), "status": p.get("status"), "progressPercent": _num(p.get("progress")),
            "budgetRWF": budget, "spentRWF": spent, "measuredEstimateRWF": est, "measuredActualRWF": act, "varianceRWF": act - est,
            "manager": _user_name(users_by_id, p.get("managerId")), "location": p.get("location"), "startDate": p.get("startDate"), "expectedEndDate": p.get("expectedEndDate"),
        })

    boq_rows = []
    for item in sorted(boq, key=lambda b: f"{b.get('projectId','')}|{b.get('code','')}"):
        p = next((pr for pr in projects if str(pr.get("id")) == str(item.get("projectId"))), None)
        est = _line_estimate(item); act = _line_actual(item)
        boq_rows.append({
            "projectCode": p.get("code") if p else "", "project": p.get("name") if p else "",
            "boqCode": item.get("code"), "description": item.get("description"), "unit": item.get("unit"),
            "estimatedQty": _num(item.get("estimatedQty")), "actualQty": _num(item.get("actualQty")), "unitRateRWF": _num(item.get("unitRate")),
            "estimatedRWF": est, "actualRWF": act, "varianceRWF": act - est,
        })

    cost_rows = []
    for report in cost_reports:
        p = next((pr for pr in projects if str(pr.get("id")) == str(report.get("projectId"))), None)
        submitter_name = _user_name(users_by_id, report.get("submittedBy")) if report.get("submittedBy") else ""
        lines = report.get("lines") if isinstance(report.get("lines"), list) and report.get("lines") else [b for b in boq if str(b.get("projectId")) == str(report.get("projectId"))]
        for line in lines:
            if not isinstance(line, dict):
                continue
            est = _line_estimate(line); act = _line_actual(line)
            cost_rows.append({
                "reportId": report.get("id"), "projectCode": p.get("code") if p else "", "project": p.get("name") if p else "",
                "status": report.get("status"), "submittedBy": submitter_name, "submittedAt": report.get("submittedAt"),
                "lineCode": line.get("code"), "description": line.get("description"), "unit": line.get("unit"),
                "estimatedQty": _num(line.get("estimatedQty")), "actualQty": _num(line.get("actualQty")), "unitRateRWF": _num(line.get("unitRate")),
                "estimatedRWF": est, "actualRWF": act, "varianceRWF": act - est,
            })

    summary = {
        "report": "CPMIS Financial Workbook",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "from": from_date,
        "to": to_date,
        "projectFilter": "All projects" if project_id == "all" else (projects[0].get("code") if projects else project_id),
        "projectsIncluded": len(projects),
        "totalBudgetRWF": total_budget,
        "totalSpentRWF": total_spent,
        "totalMeasuredEstimateRWF": total_est,
        "totalMeasuredActualRWF": total_act,
        "totalVarianceRWF": total_act - total_est,
        "budgetUtilizationPercent": round((total_act / total_budget) * 100, 2) if total_budget > 0 else 0.0,
    }

    return {
        "ok": True,
        "generatedAt": summary["generatedAt"],
        "scope": {"projectId": project_id, "from": from_date, "to": to_date},
        "summary": summary,
        "projects": project_rows,
        "boq": boq_rows,
        "costReports": cost_rows,
    }


async def handle(job: dict[str, Any], ctx: Any) -> dict[str, Any]:
    payload = job.get("payload") or {}
    state = payload.get("state") if isinstance(payload.get("state"), dict) else payload
    if not isinstance(state, dict):
        raise NonRetryableJobError("report handler requires payload.state or state-like payload", code="invalid-payload")
    job_type = str(job.get("type") or "")
    project_id = str(payload.get("projectId") or payload.get("project") or "all")

    if job_type == "report.monthly-progress":
        month = str(payload.get("month") or datetime.now(timezone.utc).strftime("%Y-%m"))
        return build_monthly_progress(state, month=month, project_id=project_id)

    if job_type == "report.project-workbook":
        return build_project_workbook(state, project_id=project_id, from_date=payload.get("from"), to_date=payload.get("to"))

    raise NonRetryableJobError(f"Unsupported report job type: {job_type}", code="unsupported-job-type")
