"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePm } from "@/lib/data/admin-store";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";
import { engineerReportSchema, type EngineerReportFormValues } from "@/lib/validations/schemas";
import type { EngineerReport, EngineerReportStatus } from "@/types";

const statusLabel: Record<EngineerReportStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

const order: EngineerReportStatus[] = ["submitted", "in_review", "approved", "rejected"];

export function PmReports() {
  const data = usePm();
  return (
    <div>
      <PageHeader
        title="Engineer reports"
        description="Site engineers submit a report. You open it for review, then approve or reject. A rejection needs a note. Approval raises project progress when the site figure is higher."
      />
      <ol className="mb-4 flex flex-wrap gap-2 text-xs">
        {["Engineer submits", "You open the review", "Approve or reject"].map((step, index) => (
          <li key={step} className="rounded-full bg-[#fff1eb] px-3 py-1 font-medium text-black">{index + 1}. {step}</li>
        ))}
      </ol>
      <SubmitForm />
      <div className="mt-6 space-y-6">
        {order.map((status) => {
          const rows = data.reports.filter((report) => report.status === status);
          return (
            <section key={status}>
              <h2 className="mb-2 text-sm font-semibold">{statusLabel[status]} <span className="font-normal text-muted-foreground">{rows.length}</span></h2>
              {rows.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
                <ul className="space-y-3">
                  {rows.map((report) => <ReportCard key={report.id} report={report} />)}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SubmitForm() {
  const data = usePm();
  const form = useForm<EngineerReportFormValues>({
    resolver: zodResolver(engineerReportSchema),
    defaultValues: {
      projectId: data.projects[0]?.id ?? "",
      engineerId: data.engineers[0]?.id ?? "",
      periodStart: "",
      periodEnd: "",
      progress: 0,
      summary: "",
      issues: "",
    },
  });
  const errors = form.formState.errors;
  return (
    <form
      className="grid gap-3 rounded-[22px] border border-black/5 bg-card p-4 md:grid-cols-2"
      onSubmit={form.handleSubmit((values) => {
        const result = data.submitReport(values);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Site report submitted. It is waiting for your review.");
        form.reset({ ...values, summary: "", issues: "", periodStart: "", periodEnd: "" });
      })}
    >
      <div className="md:col-span-2">
        <h2 className="text-sm font-semibold">Record a site engineer submission</h2>
        <p className="mt-1 text-xs text-muted-foreground">This is the engineer step. The report is filed in their name, then it lands in Submitted.</p>
      </div>
      <Field label="Project" error={errors.projectId?.message}>
        <Controller control={form.control} name="projectId" render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger aria-label="Project"><SelectValue /></SelectTrigger>
            <SelectContent>{data.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.code} — {project.name}</SelectItem>)}</SelectContent>
          </Select>
        )} />
      </Field>
      <Field label="Site engineer" error={errors.engineerId?.message}>
        <Controller control={form.control} name="engineerId" render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger aria-label="Site engineer"><SelectValue /></SelectTrigger>
            <SelectContent>{data.engineers.map((user) => <SelectItem key={user.id} value={user.id}>{fullName(user)}</SelectItem>)}</SelectContent>
          </Select>
        )} />
      </Field>
      <Field label="Period start" htmlFor="periodStart" error={errors.periodStart?.message}><Input id="periodStart" type="date" {...form.register("periodStart")} /></Field>
      <Field label="Period end" htmlFor="periodEnd" error={errors.periodEnd?.message}><Input id="periodEnd" type="date" {...form.register("periodEnd")} /></Field>
      <Field label="Reported progress %" htmlFor="report-progress" error={errors.progress?.message}><Input id="report-progress" type="number" min={0} max={100} {...form.register("progress")} /></Field>
      <Field label="Summary" htmlFor="summary" error={errors.summary?.message}><Textarea id="summary" {...form.register("summary")} /></Field>
      <Field label="Issues" htmlFor="issues" error={errors.issues?.message}><Textarea id="issues" {...form.register("issues")} /></Field>
      <div className="flex items-end justify-end md:col-span-2">
        <Button type="submit">Submit report</Button>
      </div>
    </form>
  );
}

function ReportCard({ report }: { report: EngineerReport }) {
  const data = usePm();
  const [note, setNote] = useState(report.decisionNote);
  const project = data.projectById(report.projectId);
  const engineer = data.users.find((user) => user.id === report.engineerId);
  return (
    <li className="rounded-[22px] border border-black/5 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{project?.code} · {project?.name}</h3>
        <Badge tone={report.status === "rejected" ? "red" : report.status === "approved" ? "green" : "amber"}>{statusLabel[report.status]}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {engineer ? fullName(engineer) : "Site engineer"} · {formatDate(report.periodStart)} – {formatDate(report.periodEnd)} · reported {report.progress}%
      </p>
      <p className="mt-3 text-sm">{report.summary}</p>
      {report.issues ? <p className="mt-2 text-sm text-muted-foreground">Issues: {report.issues}</p> : null}
      {report.reviewedAt ? <p className="mt-2 text-xs text-muted-foreground">Decided {formatDateTime(report.reviewedAt)}{report.decisionNote ? ` · ${report.decisionNote}` : ""}</p> : null}
      {report.status === "submitted" ? (
        <div className="mt-3">
          <Button type="button" onClick={() => {
            const result = data.openReview(report.id);
            if (!result.ok) toast.error(result.error);
            else toast.success("Report is in review.");
          }}>Start review</Button>
        </div>
      ) : null}
      {report.status === "in_review" ? (
        <div className="mt-3 grid gap-2">
          <Field label="Decision note" htmlFor={`note-${report.id}`} hint="Required when you reject">
            <Textarea id={`note-${report.id}`} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => decide(data.decideReport, report.id, "approved", note)}>Approve</Button>
            <Button type="button" variant="navy" onClick={() => decide(data.decideReport, report.id, "rejected", note)}>Reject</Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function decide(
  decideReport: (id: string, decision: "approved" | "rejected", note: string) => { ok: true } | { ok: false; error: string },
  id: string,
  decision: "approved" | "rejected",
  note: string,
) {
  const result = decideReport(id, decision, note);
  if (!result.ok) toast.error(result.error);
  else toast.success(decision === "approved" ? "Report approved." : "Report rejected.");
}
