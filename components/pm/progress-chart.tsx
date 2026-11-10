"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import { ChartSlot } from "@/components/dashboard/chart-slot";
import type { ProgressMark, Project } from "@/types";

export function PmProgressChart({ projects, marks }: { projects: Project[]; marks: ProgressMark[] }) {
  const rows = [...projects]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((project) => {
      const latest = marks.find((mark) => mark.projectId === project.id);
      const moved = latest != null && latest.previous !== project.progress;
      return {
        code: project.code,
        name: project.name,
        progress: project.progress,
        previous: moved ? latest.previous : null,
        moved,
        note: latest?.note ?? "",
        delayed: project.status === "delayed",
      };
    });
  const latest = marks[0];
  const latestProject = latest ? projects.find((project) => project.id === latest.projectId) : undefined;

  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Saved progress</h2>
          <p className="mt-0.5 text-xs text-black/45">Each bar is the percentage saved on the progress page.</p>
        </div>
        {latest && latestProject ? (
          <p className="rounded-2xl bg-[#fff1eb] px-3 py-2 text-xs font-medium">
            {latestProject.code} marked at {latest.progress}%
            {latest.previous !== latest.progress ? ` from ${latest.previous}%` : ""}
            {latest.note ? `. ${latest.note}` : ""}
          </p>
        ) : null}
      </header>
      <ChartSlot className="h-56 w-full">
        <BarChart width={480} height={224} data={rows} margin={{ left: 0, right: 8, top: 18, bottom: 0 }} style={{ width: "100%", height: "100%" }}>
          <CartesianGrid stroke="#e6e6e6" vertical={false} />
          <XAxis dataKey="code" tick={{ fontSize: 11, fill: "#111111" }} axisLine={false} tickLine={false} dy={6} />
          <YAxis domain={[0, 100]} width={28} tick={{ fontSize: 11, fill: "#6f6f6f" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#fff1eb" }} content={<ProgressTip />} />
          <Bar dataKey="previous" barSize={22} isAnimationActive={false} shape={<PriorTick />} />
          <Bar dataKey="progress" radius={[5, 5, 0, 0]} barSize={22} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.code} fill={row.delayed ? "#ff5c22" : "#111111"} />
            ))}
            <LabelList dataKey="progress" position="top" formatter={(value: number) => `${value}%`} style={{ fontSize: 11, fill: "#111111" }} />
          </Bar>
        </BarChart>
      </ChartSlot>
    </section>
  );
}

function PriorTick({ x = 0, y = 0, width = 0, height = 0 }: { x?: number; y?: number; width?: number; height?: number }) {
  if (height <= 0) return null;
  return <line x1={x - 4} x2={x + width + 4} y1={y} y2={y} stroke="#ff5c22" strokeWidth={2} />;
}

function ProgressTip({ active, payload }: { active?: boolean; payload?: { payload?: { name?: string; progress?: number; previous?: number | null; moved?: boolean; note?: string } }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-2xl border border-black/5 bg-white px-3 py-2 text-xs shadow-[0_8px_24px_rgba(17,17,17,0.06)]">
      <p className="font-semibold">{row.name}</p>
      <p className="mt-1 text-black/55">Saved <span className="font-medium text-black">{row.progress}%</span></p>
      {row.moved ? <p className="text-black/55">Previous mark <span className="font-medium text-black">{row.previous}%</span></p> : null}
      {row.note ? <p className="mt-1 max-w-52 text-black/55">{row.note}</p> : null}
    </div>
  );
}
