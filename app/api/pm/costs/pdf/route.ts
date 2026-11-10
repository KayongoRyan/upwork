import { readCostEdits } from "@/lib/server/cost-lines";
import { costReportPdf } from "@/lib/server/cost-pdf";
import { readState } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { PREVIEW_PM_ID, fullName } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = String(form.get("projectId") ?? "");
  const state = readState();
  const project = state.projects.find((item) => item.id === projectId && item.managerId === PREVIEW_PM_ID);
  const rows = state.boq.filter((item) => item.projectId === projectId);
  if (!project) return redirectTo(request, "/pm/costs", { error: "That project is not on your portfolio." });
  if (rows.length === 0) return redirectTo(request, "/pm/costs", { error: "There is no bill to save." });
  const parsed = readCostEdits(form, rows);
  if (!parsed.ok) return redirectTo(request, "/pm/costs", { error: parsed.error });
  const surveyor = state.users.find((user) => user.role === "quantity_surveyor" && user.projectId === project.id);
  const pdf = costReportPdf({
    code: project.code,
    name: project.name,
    surveyor: surveyor ? fullName(surveyor) : "Quantity surveyor",
    lines: parsed.lines,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${project.code}-cost-report.pdf"`,
    },
  });
}
