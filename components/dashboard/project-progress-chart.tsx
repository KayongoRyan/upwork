"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartSlot } from "@/components/dashboard/chart-slot";
import type { Project } from "@/types";

export function ProjectProgressChart({ projects }: { projects: Project[] }) {
  const data = [...projects]
    .sort((a, b) => b.progress - a.progress)
    .map((project) => ({
      name: project.code,
      progress: project.progress,
      full: project.name,
    }));
  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-4">
      <header className="mb-2">
        <h2 className="text-sm font-semibold">Project progress</h2>
        <p className="text-xs text-muted-foreground">Completion percentage by project code</p>
      </header>
      <ChartSlot className="h-72 w-full">
        <BarChart width={480} height={288} data={data} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 0 }} style={{ width: "100%", height: "100%" }}>
          <CartesianGrid stroke="#e6e6e6" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: "#6f6f6f" }} />
          <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11, fill: "#111111" }} />
          <Tooltip formatter={(value) => [`${value}%`, "Progress"]} labelFormatter={(_, payload) => payload?.[0]?.payload.full ?? ""} />
          <Bar dataKey="progress" fill="#ff5c22" radius={[0, 6, 6, 0]} barSize={12} isAnimationActive={false} />
        </BarChart>
      </ChartSlot>
    </section>
  );
}
