"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartSlot } from "@/components/dashboard/chart-slot";
import type { MonthlyPoint } from "@/types";

export function MonthlyActivityChart({ series }: { series: MonthlyPoint[] }) {
  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-4">
      <header className="mb-2">
        <h2 className="text-sm font-semibold">Monthly project activity</h2>
        <p className="text-xs text-muted-foreground">Sample trend for Jan–Nov 2026. Not calculated from the live table.</p>
      </header>
      <ChartSlot className="h-72">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 288 }}>
          <AreaChart data={series} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid stroke="#e6e6e6" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#6f6f6f" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6f6f6f" }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="started" name="Started" stroke="#111111" fill="#11111114" strokeWidth={2} isAnimationActive={false} />
            <Area type="monotone" dataKey="completed" name="Completed" stroke="#ff5c22" fill="#ff5c2226" strokeWidth={2} isAnimationActive={false} />
            <Area type="monotone" dataKey="updates" name="Site updates" stroke="#ff9a73" fill="#ff9a7314" strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartSlot>
    </section>
  );
}
