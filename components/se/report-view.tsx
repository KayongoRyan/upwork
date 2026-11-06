"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { filesToPhotos } from "@/components/se/photos";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useSiteEngineer } from "@/lib/data/admin-store";
import { DEMO_TODAY } from "@/lib/utils";
import type { ReportPhoto } from "@/types";

export function SeReport() {
  const data = useSiteEngineer();
  const router = useRouter();
  const [date, setDate] = useState(DEMO_TODAY);
  const [progress, setProgress] = useState(data.project?.progress ?? 0);
  const [summary, setSummary] = useState("");
  const [issues, setIssues] = useState("");
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const result = data.submitDaily({ date, progress, summary, issues, photos });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Report filed. It is with your project manager.");
        router.push("/se/history");
      }}
    >
      <PageHeader
        title="Daily report"
        description={data.project ? `${data.project.code} · ${data.project.name}` : "No project assigned."}
        actions={
          <Button type="submit" disabled={!data.project || busy}>Submit report</Button>
        }
      />
      <div className="grid gap-4 rounded-[22px] border border-black/5 bg-card p-4 sm:p-5 lg:grid-cols-2">
        <Label>
          Shift date
          <Input className="mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </Label>
        <Label>
          Site progress {progress}%
          <input className="mt-3 h-10 w-full accent-[#ff5c22]" type="range" min={0} max={100} value={progress} onChange={(event) => setProgress(Number(event.target.value))} />
        </Label>
        <Label className="lg:col-span-2">
          What happened
          <Textarea className="mt-1" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Crew, weather, work done" required />
        </Label>
        <Label className="lg:col-span-2">
          Issues
          <Textarea className="mt-1 min-h-20" value={issues} onChange={(event) => setIssues(event.target.value)} placeholder="Delays, shortages, safety" />
        </Label>
        <div className="lg:col-span-2">
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
        </div>
      </div>
    </form>
  );
}

export function PhotoField({ photos, busy, onPick }: { photos: ReportPhoto[]; busy: boolean; onPick: (files: FileList | null) => void }) {
  return (
    <div>
      <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-black/15 bg-white text-sm font-medium">
        <Camera className="size-4" />
        {busy ? "Reading photo…" : "Add site photo"}
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          disabled={busy}
          onChange={(event) => {
            onPick(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {photos.length ? (
        <ul className="mt-3 flex gap-2 overflow-x-auto">
          {photos.map((photo) => (
            <li key={photo.id}>
              <img src={photo.dataUrl} alt={photo.name} className="h-24 w-32 rounded-xl object-cover" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
