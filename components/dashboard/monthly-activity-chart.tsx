"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyPoint } from "@/types";

export function MonthlyActivityChart({ series }: { series: MonthlyPoint[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-2">
        <h2 className="text-sm font-semibold">Monthly project activity</h2>
        <p className="text-xs text-muted-foreground">Sample trend for Jan–Nov 2026. Not calculated from the live table.</p>
      </header>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid stroke="#e6edf4" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#5d6d80" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#5d6d80" }} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="started" name="Started" stroke="#0c2340" fill="#0c234033" />
            <Area type="monotone" dataKey="completed" name="Completed" stroke="#1f7a45" fill="#1f7a4533" />
            <Area type="monotone" dataKey="updates" name="Site updates" stroke="#e08a12" fill="#e08a1226" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
