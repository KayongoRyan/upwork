"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { countProjects } from "@/lib/metrics";
import type { Project } from "@/types";

const slices = [
  { key: "active", label: "Active", color: "#1d4e89" },
  { key: "completed", label: "Completed", color: "#1f7a45" },
  { key: "delayed", label: "Delayed", color: "#c5362b" },
  { key: "onHold", label: "On hold", color: "#d4890a" },
  { key: "planning", label: "Planning", color: "#8b9aab" },
] as const;

export function ProjectStatusChart({ projects }: { projects: Project[] }) {
  const counts = countProjects(projects);
  const data = slices.map((slice) => ({ name: slice.label, value: counts[slice.key], color: slice.color }));
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-2">
        <h2 className="text-sm font-semibold">Project status</h2>
        <p className="text-xs text-muted-foreground">Live count from the preview portfolio</p>
      </header>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid grid-cols-2 gap-2 text-xs">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span className="font-medium text-foreground">{entry.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
