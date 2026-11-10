"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartSlot } from "@/components/dashboard/chart-slot";
import { roleLabel } from "@/lib/labels";
import { countRoles } from "@/lib/metrics";
import type { UserAccount } from "@/types";

export function WorkforceChart({ users }: { users: UserAccount[] }) {
  const counts = countRoles(users);
  const data = (Object.keys(roleLabel) as (keyof typeof roleLabel)[]).map((role) => ({
    role: roleLabel[role],
    people: counts[role],
  }));
  return (
    <section className="rounded-[22px] border border-black/5 bg-card p-4">
      <header className="mb-2">
        <h2 className="text-sm font-semibold">Workforce overview</h2>
        <p className="text-xs text-muted-foreground">Registered application accounts by role</p>
      </header>
      <ChartSlot className="h-64">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 256 }}>
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid stroke="#e6e6e6" vertical={false} />
            <XAxis dataKey="role" tick={{ fontSize: 11, fill: "#6f6f6f" }} interval={0} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6f6f6f" }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Bar dataKey="people" name="Accounts" fill="#ff5c22" radius={[8, 8, 0, 0]} barSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartSlot>
    </section>
  );
}
