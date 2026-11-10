"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PhotoField } from "@/components/se/report-view";
import { filesToPhotos } from "@/components/se/photos";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { useSiteEngineer } from "@/lib/data/admin-store";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { EngineerReport, ReportPhoto } from "@/types";

const statusLabel = { submitted: "Submitted", in_review: "In review", approved: "Approved", rejected: "Rejected" } as const;

export function SeHistory() {
  const data = useSiteEngineer();
  const reports = [...data.reports].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  return (
    <div>
      <PageHeader
        title="Report history"
        description={`Reports you filed on ${data.project?.code ?? "your project"}.`}
      />
      {reports.length === 0 ? <p className="text-sm text-black/45">No reports yet.</p> : null}
      <div className="grid gap-3">
        {reports.map((report) => (
          <HistoryCard key={report.id} report={report} onResubmit={data.resubmit} />
        ))}
      </div>
    </div>
  );
}

function HistoryCard({
  report,
  onResubmit,
}: {
  report: EngineerReport;
  onResubmit: (id: string, input: { progress: number; summary: string; issues: string; photos: ReportPhoto[] }) => { ok: true } | { ok: false; error: string };
}) {
  const [open, setOpen] = useState(report.status === "rejected");
  const [summary, setSummary] = useState(report.summary);
  const [issues, setIssues] = useState(report.issues);
  const [progress, setProgress] = useState(report.progress);
  const [photos, setPhotos] = useState<ReportPhoto[]>(report.photos ?? []);
  const [busy, setBusy] = useState(false);
  const note = report.rejectionNote || report.decisionNote;

  return (
    <article id={report.id} className="scroll-mt-28 rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">{formatDate(report.periodStart)}</p>
        <span className={report.status === "rejected" ? "rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-white" : "rounded-full bg-black px-2 py-0.5 text-xs font-medium text-white"}>
          {statusLabel[report.status]}
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-sm">{report.summary}</p>
      {report.issues ? <p className="mt-2 max-w-3xl text-sm text-black/55">Issues: {report.issues}</p> : null}
      <p className="mt-2 text-xs text-black/40">Filed {formatDateTime(report.submittedAt)} · {report.progress}%</p>
      {report.photos?.length ? (
        <ul className="mt-3 flex gap-2 overflow-x-auto">
          {report.photos.map((photo) => (
            <li key={photo.id}><img src={photo.dataUrl} alt={photo.name} className="h-24 w-32 rounded-xl object-cover" /></li>
          ))}
        </ul>
      ) : null}
      {note ? (
        <div className="mt-3 max-w-3xl rounded-2xl bg-[#fff1eb] p-3">
          <p className="text-xs font-semibold">Review from the project manager</p>
          <p className="mt-1 text-sm">{note}</p>
        </div>
      ) : null}
      {report.status === "rejected" ? (
        <div className="mt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? "Hide resubmit" : "Resubmit"}
          </Button>
          {open ? (
            <form
              className="mt-3 grid max-w-3xl gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const result = onResubmit(report.id, { progress, summary, issues, photos });
                if (!result.ok) toast.error(result.error);
                else {
                  toast.success("Resubmitted. It is back with your project manager.");
                  setOpen(false);
                }
              }}
            >
              <Label>
                Progress {progress}%
                <input className="mt-2 h-10 w-full accent-[#ff5c22]" type="range" min={0} max={100} value={progress} onChange={(event) => setProgress(Number(event.target.value))} />
              </Label>
              <Label>
                Updated account
                <Textarea className="mt-1" value={summary} onChange={(event) => setSummary(event.target.value)} />
              </Label>
              <Label>
                Issues
                <Textarea className="mt-1 min-h-16" value={issues} onChange={(event) => setIssues(event.target.value)} />
              </Label>
              <PhotoField
                photos={photos}
                busy={busy}
                onPick={async (list) => {
                  setBusy(true);
                  try {
                    const result = await filesToPhotos(list, photos);
                    setPhotos(result.photos);
                    if (result.skipped) toast.error("Four photos is the limit for one report.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <Button type="submit" disabled={busy} className="w-fit">Send again</Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
