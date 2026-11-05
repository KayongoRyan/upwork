"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-2">
        <h2 className="text-sm font-semibold">Workforce overview</h2>
        <p className="text-xs text-muted-foreground">Registered application accounts by role</p>
      </header>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid stroke="#e6edf4" vertical={false} />
            <XAxis dataKey="role" tick={{ fontSize: 11, fill: "#5d6d80" }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#5d6d80" }} />
            <Tooltip />
            <Bar dataKey="people" name="Accounts" fill="#1d4e89" radius={[4, 4, 0, 0]} barSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
