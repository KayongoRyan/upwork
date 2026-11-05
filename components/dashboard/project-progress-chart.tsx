"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-2">
        <h2 className="text-sm font-semibold">Project progress</h2>
        <p className="text-xs text-muted-foreground">Completion percentage by project code</p>
      </header>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid stroke="#e6edf4" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: "#5d6d80" }} />
            <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11, fill: "#122033" }} />
            <Tooltip formatter={(value) => [`${value}%`, "Progress"]} labelFormatter={(_, payload) => payload?.[0]?.payload.full ?? ""} />
            <Bar dataKey="progress" fill="#0c2340" radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
