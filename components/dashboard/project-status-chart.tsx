"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartSlot } from "@/components/dashboard/chart-slot";
import { countProjects } from "@/lib/metrics";
import type { Project } from "@/types";

const slices = [
  { key: "active", label: "Active", color: "#ff5c22" },
  { key: "completed", label: "Completed", color: "#111111" },
  { key: "delayed", label: "Delayed", color: "#ff9a73" },
  { key: "onHold", label: "On hold", color: "#11111199" },
  { key: "planning", label: "Planning", color: "#11111133" },
] as const;

export function ProjectStatusChart({ projects }: { projects: Project[] }) {
  const counts = countProjects(projects);
  const data = slices.map((slice) => ({ name: slice.label, value: counts[slice.key], color: slice.color }));
  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-4">
      <header className="mb-2">
        <h2 className="text-sm font-semibold">Project status</h2>
        <p className="text-xs text-muted-foreground">Live count from the preview portfolio</p>
      </header>
      <ChartSlot className="h-64">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 256 }}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartSlot>
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
