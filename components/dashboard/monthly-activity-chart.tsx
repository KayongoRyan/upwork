"use client";

import { Area, Bar, CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartSlot } from "@/components/dashboard/chart-slot";
import type { MonthlyPoint } from "@/types";

export function MonthlyActivityChart({ series }: { series: MonthlyPoint[] }) {
  const totals = series.reduce(
    (sum, point) => ({
      started: sum.started + point.started,
      completed: sum.completed + point.completed,
      updates: sum.updates + point.updates,
    }),
    { started: 0, completed: 0, updates: 0 },
  );

  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Monthly project activity</h2>
          <p className="text-xs text-muted-foreground">Jan–Nov 2026. Line and bars use separate scales.</p>
        </div>
      </header>
      <dl className="mb-3 grid grid-cols-3 gap-2">
        <Total label="Started" value={totals.started} mark="bar" tone="ink" />
        <Total label="Completed" value={totals.completed} mark="bar" tone="accent" />
        <Total label="Site updates" value={totals.updates} mark="line" tone="accent" />
      </dl>
      <ChartSlot className="h-56 w-full">
        <ComposedChart width={480} height={224} data={series} margin={{ left: 0, right: 4, top: 16, bottom: 0 }} barGap={2} barCategoryGap="32%" style={{ width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="site-updates-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff5c22" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#ff5c22" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e6e6e6" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6f6f6f" }} axisLine={false} tickLine={false} dy={6} />
          <YAxis yAxisId="updates" allowDecimals={false} width={28} tick={{ fontSize: 11, fill: "#6f6f6f" }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="counts" orientation="right" allowDecimals={false} width={28} domain={[0, (max: number) => Math.max(2, max)]} tick={{ fontSize: 11, fill: "#6f6f6f" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#fff1eb" }} content={<ActivityTip />} />
          <Area yAxisId="updates" type="monotone" dataKey="updates" stroke="#ff5c22" fill="url(#site-updates-fill)" strokeWidth={2} isAnimationActive={false} dot={false} activeDot={{ r: 4, fill: "#ff5c22", stroke: "#ffffff" }} />
          <Bar yAxisId="counts" dataKey="started" fill="#111111" barSize={7} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar yAxisId="counts" dataKey="completed" fill="#ff5c22" barSize={7} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </ComposedChart>
      </ChartSlot>
    </section>
  );
}

function Total({ label, value, mark, tone }: { label: string; value: number; mark: "bar" | "line"; tone: "ink" | "accent" }) {
  const ink = tone === "ink" ? "bg-[#111111]" : "bg-[#ff5c22]";
  return (
    <div className="rounded-2xl bg-[#e6e6e6] px-3 py-2">
      <dt className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className={mark === "line" ? `h-0.5 w-3 rounded-full ${ink}` : `h-2.5 w-1.5 rounded-sm ${ink}`} />
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold leading-none tracking-tight">{value}</dd>
    </div>
  );
}

function ActivityTip({ active, payload, label }: { active?: boolean; payload?: { payload?: MonthlyPoint }[]; label?: string }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-2xl border border-black/5 bg-white px-3 py-2 text-xs shadow-[0_8px_24px_rgba(17,17,17,0.06)]">
      <p className="mb-1 font-semibold">{label} 2026</p>
      <p className="text-muted-foreground">Site updates <span className="font-medium text-foreground">{row.updates}</span></p>
      <p className="text-muted-foreground">Started <span className="font-medium text-foreground">{row.started}</span></p>
      <p className="text-muted-foreground">Completed <span className="font-medium text-foreground">{row.completed}</span></p>
    </div>
  );
}
