"use client";

import Link from "next/link";
import { FileBarChart, Ruler, Wallet } from "lucide-react";
import { ProjectStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatPercent, lineActual, lineEstimate, lineVariance, utilizationPercent } from "@/lib/boq";
import { useQuantitySurveyor } from "@/lib/data/admin-store";
import { cn, formatMoney } from "@/lib/utils";

export function QsDashboard() {
  const data = useQuantitySurveyor();
  const project = data.project;
  const budget = project?.budget ?? 0;
  const variance = data.expenditure - budget;
  const ranked = [...data.lines].sort((a, b) => lineVariance(b) - lineVariance(a));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {data.actor?.firstName ?? "there"}</h1>
          <p className="mt-1 text-sm text-black/45">Measured cost on your assigned project. Amounts are in RWF.</p>
        </div>
        <Button asChild>
          <Link prefetch={false} href="/qs/boq">
            <Ruler /> Open the bill
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat href="/qs/expenditure" icon={Wallet} value={formatMoney(budget)} label="Project budget" />
        <Stat href="/qs/expenditure" icon={Wallet} value={formatMoney(data.expenditure)} label="Expenditure" />
        <Stat href="/qs/expenditure" icon={FileBarChart} value={formatPercent(budget, data.expenditure)} label="Budget use" warn={utilizationPercent(budget, data.expenditure) > 100} />
        <Stat href="/qs/reports" icon={FileBarChart} value={formatMoney(variance)} label="Cost variance" warn={variance > 0} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
          {project ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-black/45">{project.code}</p>
                  <h2 className="text-base font-semibold">{project.name}</h2>
                  <p className="mt-1 text-sm text-black/55">{project.location} · {project.client}</p>
                </div>
                <ProjectStatusBadge status={project.status} />
              </div>
              <Meter label="Budget used" value={formatPercent(budget, data.expenditure)} width={Math.min(100, utilizationPercent(budget, data.expenditure))} />
              <p className="mt-3 text-xs text-black/45">
                Bill estimate {formatMoney(data.estimated)} · measured {formatMoney(data.expenditure)} · bill variance {formatMoney(data.expenditure - data.estimated)}
              </p>
              {project.spent !== data.expenditure ? (
                <p className="mt-2 text-sm">Recorded project spend is {formatMoney(project.spent)}. Saving a line writes the measured total onto this project.</p>
              ) : (
                <p className="mt-2 text-xs text-black/45">Project spend matches the measured bill.</p>
              )}
            </>
          ) : (
            <p className="text-sm">No project is assigned to this account.</p>
          )}
        </section>

        <section className="rounded-[22px] border border-black/5 bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Largest variances</h2>
            <Link prefetch={false} href="/qs/reports" className="text-sm font-medium text-accent">Report</Link>
          </div>
          <ul className="mt-3 divide-y divide-black/5">
            {ranked.slice(0, 5).map((item) => {
              const gap = lineVariance(item);
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.code} · {item.description}</p>
                    <p className="mt-0.5 text-xs text-black/45">
                      {item.actualQty} / {item.estimatedQty} {item.unit} · {formatMoney(lineActual(item))} measured · {formatMoney(lineEstimate(item))} estimated
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-sm font-medium tabular-nums", gap > 0 && "text-accent")}>{formatMoney(gap)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ href, icon: Icon, value, label, warn }: { href: string; icon: typeof Wallet; value: string; label: string; warn?: boolean }) {
  return (
    <Link prefetch={false} href={href} className="rounded-[22px] border border-black/5 bg-card p-4">
      <span className={cn("grid size-9 place-items-center rounded-2xl", warn ? "bg-[#fff1eb] text-accent" : "bg-black/[0.04] text-black")}>
        <Icon className="size-4" />
      </span>
      <p className="mt-3 truncate text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-black/45">{label}</p>
    </Link>
  );
}

function Meter({ label, value, width }: { label: string; value: string; width: number }) {
  return (
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-xs text-black/45">
        <span>{label}</span>
        <span className="tabular-nums text-black">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
        <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
