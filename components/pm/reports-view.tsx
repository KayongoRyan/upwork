"use client";

import { useSearchParams } from "next/navigation";
import { ManagerNotes } from "@/components/pm/manager-notes";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { usePm } from "@/lib/data/admin-store";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";
import type { EngineerReport, EngineerReportStatus } from "@/types";

const selectClass = "h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

const statusLabel: Record<EngineerReportStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

const order: EngineerReportStatus[] = ["submitted", "in_review", "approved", "rejected"];

export function PmReports() {
  const data = usePm();
  const params = useSearchParams();
  const error = params.get("error");
  const sent = params.get("sent");
  const opened = params.get("opened");
  const reviewSent = params.get("reviewSent");
  return (
    <div>
      <PageHeader
        title="Engineer reports"
        description="A report you submit goes to the administrator. Start review on a report sent to you, write a comment, and send that review back to the sender."
      />
      {error ? <p className="mb-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">{error}</p> : null}
      {sent ? <p className="mb-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">Report sent successfully to {sent}, who reviews it.</p> : null}
      {opened ? <p className="mb-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">Review started. Add a comment and send it to {opened}.</p> : null}
      {reviewSent ? <p className="mb-4 rounded-2xl bg-[#fff1eb] px-3 py-2 text-sm">Review sent to {reviewSent}.</p> : null}
      <ol className="mb-4 flex flex-wrap gap-2 text-xs">
        {["Engineer sends the report", "You start the review", "Comment and send it back"].map((step, index) => (
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
  return (
    <form className="grid gap-3 rounded-[22px] border border-black/5 bg-card p-4 md:grid-cols-2" action="/api/pm/reports" method="post">
      <div className="md:col-span-2">
        <h2 className="text-sm font-semibold">Submit report</h2>
        <p className="mt-1 text-xs text-muted-foreground">This goes to the administrator for review. You get a notice when it has been sent.</p>
      </div>
      <Field label="Project" htmlFor="report-project">
        <select id="report-project" name="projectId" className={selectClass} defaultValue={data.projects[0]?.id ?? ""} required>
          {data.projects.map((project) => (
            <option key={project.id} value={project.id}>{project.code} — {project.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Site engineer" htmlFor="report-engineer">
        <select id="report-engineer" name="engineerId" className={selectClass} defaultValue={data.engineers[0]?.id ?? ""} required>
          {data.engineers.map((user) => (
            <option key={user.id} value={user.id}>{fullName(user)}</option>
          ))}
        </select>
      </Field>
      <Field label="Period start" htmlFor="periodStart"><Input id="periodStart" name="periodStart" type="date" required /></Field>
      <Field label="Period end" htmlFor="periodEnd"><Input id="periodEnd" name="periodEnd" type="date" required /></Field>
      <Field label="Reported progress %" htmlFor="report-progress"><Input id="report-progress" name="progress" type="number" min={0} max={100} defaultValue={0} required /></Field>
      <Field label="Summary" htmlFor="summary"><Textarea id="summary" name="summary" required minLength={12} /></Field>
      <Field label="Issues" htmlFor="issues"><Textarea id="issues" name="issues" /></Field>
      <div className="flex items-end justify-end md:col-span-2">
        <Button type="submit">Submit report</Button>
      </div>
    </form>
  );
}

function ReportCard({ report }: { report: EngineerReport }) {
  const data = usePm();
  const project = data.projectById(report.projectId);
  const engineer = data.users.find((user) => user.id === report.engineerId);
  const sender = engineer ? fullName(engineer) : "the sender";
  return (
    <li id={report.id} className="scroll-mt-28 rounded-[22px] border border-black/5 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{project?.code} · {project?.name}</h3>
        <Badge tone={report.status === "rejected" ? "red" : report.status === "approved" ? "green" : "amber"}>{statusLabel[report.status]}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {sender} · {formatDate(report.periodStart)} – {formatDate(report.periodEnd)} · reported {report.progress}%
      </p>
      <p className="mt-3 text-sm">{report.summary}</p>
      {report.issues ? <p className="mt-2 text-sm text-muted-foreground">Issues: {report.issues}</p> : null}
      {report.photos?.length ? (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {report.photos.map((photo) => (
            <img key={photo.id} src={photo.dataUrl} alt={photo.name} className="h-20 w-28 shrink-0 rounded-xl object-cover" />
          ))}
        </div>
      ) : null}
      {report.reviewedAt ? <p className="mt-2 text-xs text-muted-foreground">Sent {formatDateTime(report.reviewedAt)}{report.decisionNote ? ` · ${report.decisionNote}` : ""}</p> : null}
      <ManagerNotes notes={data.comments.filter((item) => item.kind === "report" && item.workId === report.id)} />
      {report.status === "submitted" ? (
        <form className="mt-3" action="/api/pm/reports/open" method="post">
          <input type="hidden" name="id" value={report.id} />
          <Button type="submit">Start review</Button>
        </form>
      ) : null}
      {report.status === "in_review" ? (
        <form className="mt-3 grid gap-2" action="/api/pm/reports/decide" method="post">
          <input type="hidden" name="id" value={report.id} />
          <Field label="Comment" htmlFor={`note-${report.id}`} hint={`Sent to ${sender}`}>
            <Textarea id={`note-${report.id}`} name="note" required minLength={3} placeholder={`Comment for ${sender}`} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="decision" value="approved">Send review</Button>
            <Button type="submit" name="decision" value="rejected" variant="navy">Send rejection</Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
