import { applyAction, readState } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { nextId, PREVIEW_SE_ID } from "@/lib/utils";
import type { ReportPhoto } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PHOTOS = 4;
const MAX_BYTES = 1_500_000;

export async function POST(request: Request) {
  const form = await request.formData();
  const date = String(form.get("date") ?? "");
  const summary = String(form.get("summary") ?? "").trim();
  const issues = String(form.get("issues") ?? "").trim();
  const progressRaw = String(form.get("progress") ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return redirectTo(request, "/se/report", { error: "Choose the shift date." });
  }
  if (!/^\d{1,3}$/.test(progressRaw) || Number(progressRaw) > 100) {
    return redirectTo(request, "/se/report", { error: "Progress has to be between 0 and 100." });
  }
  if (summary.length < 12 || summary.length > 2000) {
    return redirectTo(request, "/se/report", { error: "Write a short account of the shift, at least a sentence." });
  }
  if (issues.length > 2000) {
    return redirectTo(request, "/se/report", { error: "Keep the issues note shorter." });
  }

  const state = readState();
  const engineer = state.users.find((user) => user.id === PREVIEW_SE_ID && user.role === "site_engineer" && user.status === "active");
  const project = engineer ? state.projects.find((item) => item.id === engineer.projectId) : undefined;
  if (!engineer || !project) return redirectTo(request, "/se/report", { error: "No project is assigned to this account." });

  const photos = await readPhotos(form.getAll("photos"));
  if (!photos) return redirectTo(request, "/se/report", { error: "Each photo has to be an image under 1.5 MB. Four is the limit." });

  const id = nextId("rpt");
  await applyAction({
    type: "submit-report",
    input: {
      projectId: project.id,
      engineerId: engineer.id,
      periodStart: date,
      periodEnd: date,
      progress: Number(progressRaw),
      summary,
      issues,
      photos,
    },
    stamp: { id, at: new Date().toISOString(), notificationId: `ntf-${id}` },
  });
  return redirectTo(request, "/se/history", { filed: "1" }, id);
}

async function readPhotos(entries: FormDataEntryValue[]): Promise<ReportPhoto[] | null> {
  const files = entries.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > MAX_PHOTOS) return null;
  const photos: ReportPhoto[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/") || file.size > MAX_BYTES) return null;
    const bytes = Buffer.from(await file.arrayBuffer());
    const name = file.name.replace(/[^\w.\- ]+/g, "").slice(0, 80) || "site.jpg";
    photos.push({
      id: nextId("photo"),
      name,
      type: file.type,
      size: file.size,
      dataUrl: `data:${file.type};base64,${bytes.toString("base64")}`,
    });
  }
  return photos;
}
