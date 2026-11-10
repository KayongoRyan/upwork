"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { useAdmin } from "@/lib/data/admin-store";
import { formatDateTime } from "@/lib/utils";

const topics = [
  ["access", "Account access"],
  ["project", "Project record"],
  ["data", "Demonstration data"],
  ["other", "Something else"],
] as const;

const selectClass = "h-10 w-full rounded-2xl border border-black/10 bg-white px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

export function HelpView() {
  const data = useAdmin();
  const params = useSearchParams();
  const error = params.get("error");
  const saved = params.get("saved") === "1";
  const notes = data.notifications.filter((item) => item.title === "Support note saved");

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Leave a support note</h2>
      <p className="mt-1 text-sm text-muted-foreground">This stores the note in notifications and the activity log. It is not emailed.</p>
      {error ? <p className="mt-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">{error}</p> : null}
      {saved ? <p className="mt-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">Saved. It is in notifications and the activity log.</p> : null}
      <form className="mt-4 grid gap-4" action="/api/help" method="post">
        <Field label="Topic" htmlFor="support-topic">
          <select id="support-topic" name="topic" className={selectClass} defaultValue="data" required>
            {topics.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Message" htmlFor="message">
          <Textarea id="message" name="message" required minLength={12} maxLength={2000} placeholder="What should the desk see?" />
        </Field>
        <Button type="submit" className="w-full">Save note</Button>
      </form>
      {notes.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {notes.map((note) => (
            <li key={note.id} id={note.id} className="scroll-mt-28 rounded-2xl bg-light-gray px-3 py-2">
              <p className="text-sm">{note.message}</p>
              <p className="mt-1 text-xs text-black/45">{formatDateTime(note.createdAt)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
