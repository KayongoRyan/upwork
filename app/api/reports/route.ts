import { overlapsRange } from "@/lib/metrics";
import { readState } from "@/lib/server/memory";
import { buildCsv } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "2025-01-01";
  const to = url.searchParams.get("to") ?? "2027-12-31";
  const projectId = url.searchParams.get("project") ?? "all";
  const state = readState();
  const invalid = from > to;
  const projects = state.projects.filter((project) => {
    if (projectId !== "all" && project.id !== projectId) return false;
    if (invalid) return false;
    return overlapsRange(project, from, to);
  });
  const ids = new Set(projects.map((project) => project.id));
  const projectRows = projects.map((project) => {
    const manager = state.users.find((user) => user.id === project.managerId);
    return {
      Code: project.code,
      Name: project.name,
      Status: project.status,
      Progress: project.progress,
      BudgetRWF: project.budget,
      SpentRWF: project.spent,
      Manager: manager ? `${manager.firstName} ${manager.lastName}` : "Unassigned",
      Location: project.location,
      Start: project.startDate,
      ExpectedCompletion: project.expectedEndDate,
    };
  });
  const activityRows = state.tasks
    .filter((task) => ids.has(task.projectId))
    .map((task) => ({
      Activity: task.title,
      Project: state.projects.find((project) => project.id === task.projectId)?.code ?? "",
      Assignee: task.assignee,
      Status: task.status,
      Due: task.dueDate,
      TaskProgress: task.progress,
    }));
  const csv = `${buildCsv(projectRows)}\n\n${buildCsv(activityRows)}\n`;
  const stamp = projectId === "all" ? "all" : (projects[0]?.code ?? projectId);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cpmis-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
