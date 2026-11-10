"use client";

import { useSearchParams } from "next/navigation";
import { Camera } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useSiteEngineer } from "@/lib/data/admin-store";
import { DEMO_TODAY } from "@/lib/utils";
import type { ReportPhoto } from "@/types";

export function SeReport() {
  const data = useSiteEngineer();
  const error = useSearchParams().get("error");
  const project = data.project;
  const start = project?.progress ?? 0;

  return (
    <form action="/api/se/reports" method="post" encType="multipart/form-data">
      <PageHeader
        title="Daily report"
        description={project ? `${project.code} · ${project.name}. This shift is filed with your project manager.` : "No project assigned."}
      />
      {error ? <p className="mb-4 rounded-2xl bg-[#fff1eb] px-4 py-3 text-sm">{error}</p> : null}
      <div className="grid gap-4 rounded-[22px] border border-black/5 bg-card p-4 sm:p-5 lg:grid-cols-2">
        <Label>
          Shift date
          <Input className="mt-1" type="date" name="date" defaultValue={DEMO_TODAY} required />
        </Label>
        <Label>
          Site progress <output className="font-normal text-black/45" htmlFor="site-progress">{start}%</output>
          <input
            id="site-progress"
            className="mt-3 h-10 w-full accent-[#ff5c22]"
            type="range"
            name="progress"
            min={0}
            max={100}
            defaultValue={start}
            onInput={(event) => {
              const out = event.currentTarget.labels?.[0]?.querySelector("output");
              if (out) out.textContent = `${event.currentTarget.value}%`;
            }}
          />
        </Label>
        <Label className="lg:col-span-2">
          What happened
          <Textarea className="mt-1" name="summary" minLength={12} maxLength={2000} placeholder="Crew, weather, work done" required />
        </Label>
        <Label className="lg:col-span-2">
          Issues
          <Textarea className="mt-1 min-h-20" name="issues" maxLength={2000} placeholder="Delays, shortages, safety" />
        </Label>
        <div className="lg:col-span-2">
          <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-black/15 bg-white text-sm font-medium">
            <Camera className="size-4" />
            Add site photo
            <input className="sr-only" type="file" name="photos" accept="image/*" capture="environment" multiple />
          </label>
          <p className="mt-2 text-xs text-black/45">Up to four images, 1.5 MB each.</p>
        </div>
        <Button type="submit" disabled={!project} className="w-fit">File today’s report</Button>
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
