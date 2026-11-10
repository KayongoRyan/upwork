"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { dayNumber, isoFromDay, type ProgrammeActivity, type ProgrammeRow } from "@/lib/cpm";
import { usePm } from "@/lib/data/admin-store";
import { programmeFor } from "@/lib/schedule";
import { DEMO_TODAY, cn, formatDate } from "@/lib/utils";

const ROW = 44;
const LEFT = "grid grid-cols-[28px_minmax(0,1fr)_40px] items-center gap-1 px-2 lg:grid-cols-[28px_40px_minmax(180px,1fr)_88px_88px_44px_96px_40px]";
const WIDE = "hidden lg:block";
const SCALES = ["month", "week", "day", "hour"] as const;
type Scale = (typeof SCALES)[number];
const SCALE_LABEL: Record<Scale, string> = { month: "Month", week: "Week", day: "Daily", hour: "Hourly" };

export function PmSchedule() {
  const data = usePm();
  const params = useSearchParams();
  const requested = params.get("project");
  const fallback = data.projects.find((project) => project.id === "prj-cargo")?.id ?? data.projects[0]?.id ?? "";
  const projectId = requested && data.projects.some((project) => project.id === requested) ? requested : fallback;
  const scale = readScale(params.get("scale"));
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const project = data.projects.find((item) => item.id === projectId) ?? null;
  const rows = useMemo(() => programmeFor(projectId), [projectId]);
  const visible = rows.filter((row) => row.kind === "phase" || !collapsed.includes(row.phaseId));
  const activities = rows.filter((row): row is ProgrammeActivity => row.kind !== "phase");
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const delayed = activities.filter((row) => row.delayed);
  const criticalOpen = activities.filter((row) => row.critical && row.progress < 100);

  const dayWidth = scale === "hour" ? 24 * 16 : scale === "day" ? 32 : scale === "week" ? 16 : 4;
  const today = dayNumber(DEMO_TODAY);
  const range = useMemo(() => {
    if (scale === "hour") return { start: today, end: today };
    if (rows.length === 0) return { start: today, end: today + 7 };
    const days = rows.flatMap((row) => [row.plannedStartDay, row.plannedFinishDay, row.actualStartDay, row.actualFinishDay].filter((day): day is number => day !== null));
    return { start: Math.min(...days, today) - 2, end: Math.max(...days, today) + 14 };
  }, [rows, today, scale]);
  const span = range.end - range.start + 1;
  const chartWidth = span * dayWidth;
  const headerHeight = scale === "month" ? 28 : 48;
  const todayX = (today - range.start) * dayWidth;

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || (scale !== "day" && scale !== "hour")) return;
    const apply = () => {
      node.scrollLeft = Math.max(0, todayX - 24);
    };
    apply();
    const frame = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(frame);
  }, [scale, todayX, projectId]);

  return (
    <div>
      <PageHeader
        title="Schedule"
        description="The construction programme. Phases, durations, logic links, and the critical path. Task assignments stay on the task list."
        actions={
          <Link href="/pm/tasks" className="text-sm font-medium text-accent hover:underline">
            Task list
          </Link>
        }
      />
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <form action="/pm/schedule" method="get" data-report-form className="grid w-full min-w-0 sm:w-auto">
            <input type="hidden" name="scale" value={scale} />
            <select aria-label="Project" name="project" defaultValue={projectId} className="h-10 w-full min-w-0 rounded-xl border border-input bg-white px-3 text-sm sm:w-auto">
              {data.projects.map((item) => (
                <option key={item.id} value={item.id}>{item.code} — {item.name}</option>
              ))}
            </select>
          </form>
          <div className="flex rounded-xl bg-white p-1">
            {SCALES.map((item) => (
              <a
                key={item}
                href={scheduleHref(projectId, item)}
                aria-current={scale === item ? "page" : undefined}
                className={cn("rounded-lg px-3 py-1.5 text-xs font-medium", scale === item ? "bg-black text-white" : "text-black/60")}
              >
                {SCALE_LABEL[item]}
              </a>
            ))}
          </div>
        </div>
        <p className="text-xs text-black/50">
          {delayed.length} delayed · {activities.filter((row) => row.critical).length} on the critical path · data date {formatDate(DEMO_TODAY)}
        </p>
      </div>
      {project ? (
        <p className="mb-3 text-sm">
          <span className="font-medium">{project.code} — {project.name}</span>
          <span className="text-black/55"> · {SCALE_LABEL[scale]}{scale === "hour" ? ` · ${formatDate(DEMO_TODAY)}` : ""}</span>
        </p>
      ) : null}
      <Legend />
      {criticalOpen.length > 0 ? (
        <p className="mt-3 text-sm">
          <span className="font-medium">Open critical path. </span>
          {criticalOpen.map((row) => row.name).join(" → ")}
        </p>
      ) : (
        <p className="mt-3 text-sm text-black/55">No open activity is on the critical path.</p>
      )}
      {selected ? <Detail row={selected} activities={activities} /> : null}
      {rows.length === 0 ? (
        <p className="mt-4 rounded-[22px] border border-black/5 bg-card px-4 py-8 text-sm text-muted-foreground">No programme has been built for this project.</p>
      ) : (
        <div
          ref={scroller}
          data-scroll-today={scale === "day" || scale === "hour" ? String(Math.max(0, Math.round(todayX - 24))) : undefined}
          className="mt-4 overflow-auto rounded-[22px] border border-black/5 bg-card"
          style={{ maxHeight: "70vh" }}
        >
          <div className="flex min-w-max">
            <div className="sticky left-0 z-20 w-[220px] shrink-0 border-r border-black/5 bg-white sm:w-[360px] lg:w-[680px]">
              <div className={cn(LEFT, "sticky top-0 z-30 border-b border-black/5 bg-white text-[11px] font-medium tracking-wide text-muted-foreground uppercase")} style={{ height: headerHeight }}>
                <span />
                <span className={WIDE}>WBS</span>
                <span>Activity</span>
                <span className={WIDE}>Start</span>
                <span className={WIDE}>Finish</span>
                <span className={WIDE}>Days</span>
                <span className={WIDE}>Pred.</span>
                <span>%</span>
              </div>
              {visible.map((row) => (
                <ScheduleLabel
                  key={row.id}
                  row={row}
                  collapsed={collapsed.includes(row.id)}
                  selected={selectedId === row.id}
                  onToggle={() => setCollapsed((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])}
                  onSelect={() => setSelectedId(row.id)}
                />
              ))}
            </div>
            <div className="relative overflow-hidden" style={{ width: chartWidth }}>
              <ChartHeader range={range} dayWidth={dayWidth} scale={scale} height={headerHeight} />
              <div className="relative" style={{ width: chartWidth, height: visible.length * ROW }}>
                <div className="absolute top-0 bottom-0 z-[1] w-px bg-accent" style={{ left: todayX }} />
                <svg className="pointer-events-none absolute inset-0 overflow-visible" width={chartWidth} height={visible.length * ROW}>
                  <defs>
                    <marker id="sched-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                      <path d="M0 0 L6 3 L0 6 Z" fill="currentColor" />
                    </marker>
                  </defs>
                  {linkPaths(visible, range.start, dayWidth).map((link) => (
                    <path key={link.key} d={link.d} fill="none" stroke={link.critical ? "#ff5c22" : "rgba(17,17,17,0.35)"} strokeWidth="1.25" markerEnd="url(#sched-arrow)" />
                  ))}
                </svg>
                {visible.map((row, index) => (
                  <ChartRow
                    key={row.id}
                    row={row}
                    index={index}
                    rangeStart={range.start}
                    dayWidth={dayWidth}
                    today={today}
                    width={chartWidth}
                    selected={selectedId === row.id}
                    onSelect={() => setSelectedId(row.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {project ? (
        <p className="mt-3 text-xs text-black/45">
          {project.code} runs {formatDate(project.startDate)} to {formatDate(project.expectedEndDate)}. Durations are calendar days. Total float comes from the logic network. A bar in orange is an open critical activity. Gray is the planned window. Black is the actual window.
        </p>
      ) : null}
    </div>
  );
}

function ScheduleLabel({
  row,
  collapsed,
  selected,
  onToggle,
  onSelect,
}: {
  row: ProgrammeRow;
  collapsed: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const activity = row.kind === "phase" ? null : row;
  return (
    <div className={cn(LEFT, "border-b border-black/5 text-sm", selected ? "bg-[#fff1eb]" : "bg-white", row.kind === "phase" && "font-medium")} style={{ height: ROW }}>
      {row.kind === "phase" ? (
        <button type="button" className="grid size-6 place-items-center rounded-md hover:bg-black/5" aria-label={collapsed ? `Expand ${row.name}` : `Collapse ${row.name}`} onClick={onToggle}>
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      ) : (
        <span />
      )}
      <button type="button" className={cn("truncate text-left text-xs text-black/45", WIDE)} onClick={onSelect}>{row.wbs}</button>
      <button type="button" className="flex min-w-0 items-center gap-1 text-left" onClick={onSelect}>
        {row.kind === "milestone" ? <span className="inline-block size-2 shrink-0 rotate-45 bg-black" /> : null}
        <span className="truncate">{row.name}</span>
        {row.critical && row.progress < 100 ? <Badge tone="red">Critical</Badge> : null}
        {row.delayed ? <Badge tone="amber">Delayed</Badge> : null}
        {activity && activity.kind === "milestone" && activity.plannedFinish === DEMO_TODAY && activity.progress < 100 ? <Badge tone="amber">Due</Badge> : null}
      </button>
      <span className={cn("text-xs", WIDE)}>{formatDate(row.plannedStart)}</span>
      <span className={cn("text-xs", WIDE)}>{formatDate(row.plannedFinish)}</span>
      <span className={cn("text-xs", WIDE)}>{row.kind === "milestone" ? "0" : row.duration}</span>
      <span className={cn("truncate text-xs text-black/55", WIDE)}>{activity ? predecessorText(activity) : "—"}</span>
      <span className="text-xs">{row.progress}%</span>
    </div>
  );
}

function ChartHeader({
  range,
  dayWidth,
  scale,
  height,
}: {
  range: { start: number; end: number };
  dayWidth: number;
  scale: Scale;
  height: number;
}) {
  const monthCells = bands(range.start, range.end, "month");
  const detail = scale === "week" ? bands(range.start, range.end, "week") : scale === "day" ? bands(range.start, range.end, "day") : scale === "hour" ? hourCells() : [];
  return (
    <div className="sticky top-0 z-10 border-b border-black/5 bg-white" style={{ height }}>
      <div className="flex h-7">
        {monthCells.map((cell) => (
          <div key={cell.key} className="truncate border-l border-black/5 px-1 text-[11px] leading-7 text-black/55" style={{ width: cell.days * dayWidth }}>
            {scale === "hour" ? formatDate(isoFromDay(range.start)) : cell.label}
          </div>
        ))}
      </div>
      {detail.length > 0 ? (
        <div className="flex h-5">
          {detail.map((cell) => (
            <div key={cell.key} className="truncate border-l border-black/5 px-0.5 text-[10px] leading-5 text-black/35" style={{ width: cell.days * dayWidth }}>
              {cell.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChartRow({
  row,
  index,
  rangeStart,
  dayWidth,
  today,
  width,
  selected,
  onSelect,
}: {
  row: ProgrammeRow;
  index: number;
  rangeStart: number;
  dayWidth: number;
  today: number;
  width: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const plannedLeft = (row.plannedStartDay - rangeStart) * dayWidth;
  const plannedWidth = Math.max((row.kind === "milestone" ? 1 : row.plannedFinishDay - row.plannedStartDay + 1) * dayWidth, 4);
  const openCritical = row.critical && row.progress < 100;
  const actual = actualWindow(row, today);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn("absolute right-0 left-0 border-b border-black/5", selected && "bg-[#fff1eb]/70")}
      style={{ top: index * ROW, height: ROW, width }}
      title={`${row.name}: ${formatDate(row.plannedStart)} – ${formatDate(row.plannedFinish)}`}
    >
      {row.kind === "milestone" ? (
        <span
          className={cn("absolute size-3 rotate-45", openCritical || row.delayed ? "bg-accent" : row.progress >= 100 ? "bg-black" : "border border-black bg-white")}
          style={{ left: plannedLeft + dayWidth / 2 - 6, top: 16 }}
        />
      ) : row.kind === "phase" ? (
        <span className="absolute h-2 rounded-full bg-black" style={{ left: plannedLeft, width: plannedWidth, top: 18 }} />
      ) : (
        <>
          <span className="absolute h-1.5 rounded-full bg-black/10" style={{ left: plannedLeft, width: plannedWidth, top: 26 }} />
          {actual ? <ActualBar row={row} actual={actual} rangeStart={rangeStart} dayWidth={dayWidth} openCritical={openCritical} /> : null}
        </>
      )}
    </button>
  );
}

function ActualBar({
  row,
  actual,
  rangeStart,
  dayWidth,
  openCritical,
}: {
  row: ProgrammeRow;
  actual: { start: number; end: number };
  rangeStart: number;
  dayWidth: number;
  openCritical: boolean;
}) {
  if (row.kind === "phase") return null;
  const left = (actual.start - rangeStart) * dayWidth;
  const plannedEnd = (row.plannedFinishDay - rangeStart + 1) * dayWidth;
  const right = (actual.end - rangeStart + 1) * dayWidth;
  const tone = openCritical ? "bg-accent" : "bg-black";
  if (!openCritical && right > plannedEnd && left < plannedEnd) {
    return (
      <>
        <span className="absolute h-3 rounded-l-sm bg-black" style={{ left, width: Math.max(plannedEnd - left, 2), top: 16 }} />
        <span className="absolute h-3 rounded-r-sm bg-accent" style={{ left: plannedEnd, width: right - plannedEnd, top: 16 }} />
      </>
    );
  }
  return <span className={cn("absolute h-3 rounded-sm", right > plannedEnd && !openCritical ? "bg-accent" : tone)} style={{ left, width: Math.max(right - left, 4), top: 16 }} />;
}

function Detail({ row, activities }: { row: ProgrammeRow; activities: ProgrammeActivity[] }) {
  const activity = row.kind === "phase" ? null : row;
  const successors = activity ? activities.filter((item) => item.predecessors.some((link) => link.id === activity.id)) : [];
  return (
    <article className="mt-3 rounded-[22px] border border-black/5 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{row.wbs} {row.name}</h2>
        {row.critical ? <Badge tone="red">Critical</Badge> : <Badge tone="slate">Float {row.float}d</Badge>}
        {row.delayed ? <Badge tone="amber">Delayed</Badge> : null}
        {row.kind === "milestone" ? <Badge tone="slate">Milestone</Badge> : null}
        {row.kind === "phase" ? <Badge tone="slate">Phase</Badge> : null}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Planned start" value={formatDate(row.plannedStart)} />
        <Fact label="Planned finish" value={formatDate(row.plannedFinish)} />
        <Fact label="Actual start" value={row.actualStart ? formatDate(row.actualStart) : "—"} />
        <Fact label="Actual finish" value={row.actualFinish ? formatDate(row.actualFinish) : "—"} />
        <Fact label="Duration" value={row.kind === "milestone" ? "Milestone" : `${row.duration} calendar days`} />
        <Fact label="Progress" value={`${row.progress}%`} />
        <Fact label="Total float" value={row.float <= 0 ? "0 days" : `${row.float} days`} />
        <Fact label="Logic" value={activity ? predecessorText(activity) : "Rolled up from the phase"} />
      </div>
      <p className="mt-3 text-sm">{delaySentence(row)}</p>
      {successors.length > 0 ? (
        <p className="mt-1 text-sm text-black/60">
          Successors: {successors.map((item) => `${item.wbs} ${item.name}`).join(", ")}
        </p>
      ) : null}
    </article>
  );
}

function readScale(value: string | null): Scale {
  return SCALES.find((item) => item === value) ?? "month";
}

function scheduleHref(projectId: string, scale: Scale) {
  const query = new URLSearchParams({ project: projectId, scale });
  return `/pm/schedule?${query.toString()}`;
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-black/55">
      <span className="inline-flex items-center gap-1.5"><i className="inline-block h-1.5 w-6 rounded-full bg-black/10" /> Planned</span>
      <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-6 rounded-sm bg-black" /> Actual</span>
      <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-6 rounded-sm bg-accent" /> Critical</span>
      <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rotate-45 bg-black" /> Milestone</span>
      <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-px bg-accent" /> Data date</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-light-gray px-3 py-2">
      <p className="text-xs text-black/45">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function delaySentence(row: ProgrammeRow) {
  if (row.kind === "phase") {
    return row.delayed ? "A child activity is behind its planned dates." : "No child activity is behind its planned dates.";
  }
  if (row.actualFinish && row.finishDelay > 0) return `Finished ${row.finishDelay} days after the planned finish.`;
  if (!row.actualFinish && row.finishDelay > 0) return `${row.finishDelay} days past the planned finish, and still open.`;
  if (!row.actualStart && row.startDelay > 0) return `Not started. ${row.startDelay} days past the planned start.`;
  if (row.actualStart && row.startDelay > 0 && row.finishDelay === 0) return `Started ${row.startDelay} days late. The finish date still holds.`;
  if (row.progress >= 100) return "Finished on the planned dates.";
  if (row.kind === "milestone" && row.plannedFinish === DEMO_TODAY) return "Due on the data date.";
  return "Inside the planned window.";
}

function predecessorText(row: ProgrammeActivity) {
  if (row.predecessors.length === 0) return "—";
  return row.predecessors
    .map((link) => `${link.wbs} ${link.type}${link.lag ? (link.lag > 0 ? `+${link.lag}` : String(link.lag)) : ""}`)
    .join(", ");
}

function actualWindow(row: ProgrammeRow, today: number) {
  if (row.kind === "milestone" || row.kind === "phase" || row.actualStartDay === null) return null;
  const end = row.actualFinishDay ?? today;
  if (end < row.actualStartDay) return null;
  return { start: row.actualStartDay, end };
}

function bands(start: number, end: number, unit: "month" | "week" | "day") {
  const cells: { key: string; label: string; days: number }[] = [];
  let cursor = start;
  while (cursor <= end) {
    const next = unit === "month" ? monthEnd(cursor, end) : Math.min(cursor + (unit === "week" ? 6 : 0), end);
    const iso = isoFromDay(cursor);
    cells.push({
      key: `${unit}-${cursor}`,
      label: unit === "day" ? iso.slice(8) : unit === "week" ? formatDate(iso).slice(0, 6) : new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(cursor * 86_400_000)),
      days: next - cursor + 1,
    });
    cursor = next + 1;
  }
  return cells;
}

function hourCells() {
  return Array.from({ length: 24 }, (_, hour) => ({
    key: `hour-${hour}`,
    label: String(hour).padStart(2, "0"),
    days: 1 / 24,
  }));
}

function monthEnd(day: number, limit: number) {
  const iso = isoFromDay(day);
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const nextMonth = Math.round(Date.UTC(year, month, 1) / 86_400_000);
  return Math.min(nextMonth - 1, limit);
}

function linkPaths(rows: ProgrammeRow[], rangeStart: number, dayWidth: number) {
  const indexOf = new Map(rows.map((row, index) => [row.id, index]));
  const paths: { key: string; d: string; critical: boolean }[] = [];
  for (const row of rows) {
    if (row.kind === "phase") continue;
    const to = indexOf.get(row.id);
    if (to === undefined) continue;
    for (const link of row.predecessors) {
      const from = indexOf.get(link.id);
      if (from === undefined) continue;
      const pred = rows[from];
      const y1 = from * ROW + ROW / 2;
      const y2 = to * ROW + ROW / 2;
      const predStart = (pred.plannedStartDay - rangeStart) * dayWidth;
      const predEnd = pred.duration <= 0 ? predStart + dayWidth / 2 : predStart + pred.duration * dayWidth;
      const succStart = (row.plannedStartDay - rangeStart) * dayWidth;
      const succEnd = row.duration <= 0 ? succStart + dayWidth / 2 : succStart + row.duration * dayWidth;
      const x1 = link.type === "SS" || link.type === "SF" ? predStart : predEnd;
      const x2 = link.type === "FF" || link.type === "SF" ? succEnd : succStart;
      paths.push({ key: `${pred.id}-${row.id}-${link.type}`, d: elbow(x1, y1, x2, y2), critical: pred.critical && row.critical });
    }
  }
  return paths;
}

function elbow(x1: number, y1: number, x2: number, y2: number) {
  if (Math.abs(x2 - x1) < 3) return `M ${x1} ${y1} V ${y2}`;
  if (x2 > x1) return `M ${x1} ${y1} H ${x1 + Math.min(10, (x2 - x1) / 2)} V ${y2} H ${x2}`;
  const lane = Math.max(y1, y2) + 14;
  return `M ${x1} ${y1} H ${x1 + 8} V ${lane} H ${x2 - 8} V ${y2} H ${x2}`;
}
