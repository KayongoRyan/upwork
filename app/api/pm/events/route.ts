import { applyAction } from "@/lib/server/memory";
import { redirectTo } from "@/lib/server/redirect";
import { nextId } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const period = String(form.get("period") ?? "monthly");
  const title = String(form.get("title") ?? "").trim();
  const date = String(form.get("date") ?? "");
  const kind = form.get("kind") === "other" ? "other" : "meeting";
  const back = { period, event: "1", day: date };
  if (title.length < 3 || title.length > 80) return redirectTo(request, "/pm", { ...back, error: "Name the event in a few words." }, "calendar");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return redirectTo(request, "/pm", { ...back, error: "Click a date on the calendar." }, "calendar");
  }
  const id = nextId("evt");
  await applyAction({
    type: "add-calendar-event",
    title,
    kind,
    date,
    stamp: { id, at: new Date().toISOString() },
  });
  return redirectTo(request, "/pm", { period, day: date, added: title }, "calendar");
}
