"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdmin } from "@/lib/data/admin-store";
import { supportSchema } from "@/lib/validations/schemas";
import type { z } from "zod";

const topics = [
  ["access", "Account access"],
  ["project", "Project record"],
  ["data", "Demonstration data"],
  ["other", "Something else"],
] as const;

const articles = [
  {
    title: "What this portal is",
    body: "This is the administrator frontend for CPMIS. Project managers, site engineers, and quantity surveyors do not have portals in this build. There is no sign-in, database, or external API.",
  },
  {
    title: "Where records live",
    body: "Creates, edits, and deletes update a local store for this browser session. Refreshing the page restores the original sample data. Use Settings → Restore sample data to do that without a refresh.",
  },
  {
    title: "Users and employees",
    body: "User Management is for application accounts and roles. Employees is the workforce list. The two lists are separate, even when a person could exist in both in a later release.",
  },
  {
    title: "Money on the reports",
    body: "Budgets and spent amounts are demonstration figures in Rwandan francs (RWF). They are not a ledger and should not be exported as company accounts. The CSV is the filtered sample table only.",
  },
  {
    title: "What the preview administrator can do",
    body: "Amina Nalwoga is the sample administrator shown in the header. You can rename that profile in Settings. The account cannot be deactivated or deleted, so the preview always has an administrator.",
  },
];

export function HelpView() {
  const { saveSupportRequest } = useAdmin();
  const [open, setOpen] = useState(0);
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof supportSchema>>({
    resolver: zodResolver(supportSchema),
    defaultValues: { topic: "data", message: "" },
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <PageHeader title="Help & support" description="How to use this administrator preview, and a note that stays on this machine." />
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {articles.map((article, index) => {
            const expanded = open === index;
            return (
              <div key={article.title}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? -1 : index)}>
                  <span className="text-sm font-medium">{article.title}</span>
                  <ChevronDown className={expanded ? "size-4 rotate-180" : "size-4"} />
                </button>
                {expanded ? <p className="px-4 pb-4 text-sm leading-6 text-muted-foreground">{article.body}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Leave a support note</h2>
        <p className="mt-1 text-sm text-muted-foreground">This stores the note in notifications and the activity log. It is not emailed.</p>
        {sent ? (
          <p className="mt-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm text-black">Saved in this preview. No message left this browser.</p>
        ) : null}
        <form
          className="mt-4 grid gap-4"
          onSubmit={form.handleSubmit((values) => {
            const topic = topics.find((item) => item[0] === values.topic)?.[1] ?? values.topic;
            saveSupportRequest(topic, values.message);
            setSent(true);
            form.reset({ topic: "data", message: "" });
            toast.success("Support note saved locally.");
          })}
          noValidate
        >
          <Field label="Topic" error={form.formState.errors.topic?.message}>
            <Controller
              control={form.control}
              name="topic"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Topic"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {topics.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Message" htmlFor="message" error={form.formState.errors.message?.message}>
            <Textarea id="message" {...form.register("message")} />
          </Field>
          <Button type="submit">Save note</Button>
        </form>
      </section>
    </div>
  );
}
