import { DEMO_TODAY } from "@/lib/utils";

export type LinkType = "FS" | "SS" | "FF" | "SF";

export interface ScheduleLink {
  predecessorId: string;
  type: LinkType;
  lag: number;
}

export interface SchedulePhase {
  id: string;
  projectId: string;
  wbs: string;
  name: string;
}

export interface ScheduleTask {
  id: string;
  projectId: string;
  phaseId: string;
  wbs: string;
  name: string;
  kind: "task" | "milestone";
  /** Calendar days. A milestone is 0. */
  duration: number;
  /** Imposed start. Required when the activity has no predecessors. */
  start?: string;
  predecessors: ScheduleLink[];
  /** Days after the computed planned start. Null means not started. */
  actualStartLag: number | null;
  /** Days after the computed planned finish. Null means not finished. */
  actualFinishLag: number | null;
  progress: number;
}

export interface ProgrammeActivity {
  kind: "task" | "milestone";
  id: string;
  phaseId: string;
  wbs: string;
  name: string;
  duration: number;
  plannedStart: string;
  plannedFinish: string;
  plannedStartDay: number;
  plannedFinishDay: number;
  actualStart: string | null;
  actualFinish: string | null;
  actualStartDay: number | null;
  actualFinishDay: number | null;
  progress: number;
  critical: boolean;
  delayed: boolean;
  float: number;
  startDelay: number;
  finishDelay: number;
  predecessors: { id: string; wbs: string; type: LinkType; lag: number }[];
}

export interface ProgrammePhase {
  kind: "phase";
  id: string;
  wbs: string;
  name: string;
  plannedStart: string;
  plannedFinish: string;
  plannedStartDay: number;
  plannedFinishDay: number;
  actualStart: string | null;
  actualFinish: string | null;
  actualStartDay: number | null;
  actualFinishDay: number | null;
  duration: number;
  progress: number;
  critical: boolean;
  delayed: boolean;
  float: number;
}

export type ProgrammeRow = ProgrammePhase | ProgrammeActivity;

const DAY = 86_400_000;

export function dayNumber(iso: string) {
  return Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
}

export function isoFromDay(day: number) {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

function earliestStart(link: ScheduleLink, predStart: number, predFinish: number, duration: number) {
  const lag = link.lag;
  if (link.type === "FS") return predFinish + 1 + lag;
  if (link.type === "SS") return predStart + lag;
  if (link.type === "FF") {
    const finish = predFinish + lag;
    return duration <= 0 ? finish : finish - duration + 1;
  }
  const finish = predStart + lag;
  return duration <= 0 ? finish : finish - duration + 1;
}

function latestFinish(link: ScheduleLink, succStart: number, succFinish: number, duration: number) {
  const lag = link.lag;
  if (link.type === "FS") return succStart - 1 - lag;
  if (link.type === "FF") return succFinish - lag;
  if (link.type === "SS") return duration <= 0 ? succStart - lag : succStart - lag + duration - 1;
  return duration <= 0 ? succFinish - lag : succFinish - lag + duration - 1;
}

export function compileProgramme(phases: SchedulePhase[], tasks: ScheduleTask[]): ProgrammeRow[] {
  const today = dayNumber(DEMO_TODAY);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  for (const task of tasks) {
    const seed = task.start ? dayNumber(task.start) : Number.NEGATIVE_INFINITY;
    earlyStart.set(task.id, seed);
    earlyFinish.set(task.id, task.duration <= 0 ? seed : seed + task.duration - 1);
  }

  for (let pass = 0; pass < tasks.length; pass += 1) {
    let changed = false;
    for (const task of tasks) {
      let start = task.predecessors.length === 0 ? dayNumber(task.start ?? DEMO_TODAY) : Number.NEGATIVE_INFINITY;
      if (task.start) start = Math.max(start, dayNumber(task.start));
      for (const link of task.predecessors) {
        const pred = byId.get(link.predecessorId);
        if (!pred) continue;
        start = Math.max(start, earliestStart(link, earlyStart.get(pred.id)!, earlyFinish.get(pred.id)!, task.duration));
      }
      if (!Number.isFinite(start)) start = today;
      const finish = task.duration <= 0 ? start : start + task.duration - 1;
      if (start !== earlyStart.get(task.id) || finish !== earlyFinish.get(task.id)) {
        earlyStart.set(task.id, start);
        earlyFinish.set(task.id, finish);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const projectFinish = Math.max(...tasks.map((task) => earlyFinish.get(task.id)!));
  const lateFinish = new Map<string, number>();
  const lateStart = new Map<string, number>();
  function setLate(id: string, finish: number, duration: number) {
    lateFinish.set(id, finish);
    lateStart.set(id, duration <= 0 ? finish : finish - duration + 1);
  }
  for (const task of tasks) setLate(task.id, projectFinish, task.duration);

  const successors = new Map<string, { link: ScheduleLink; id: string }[]>();
  for (const task of tasks) {
    for (const link of task.predecessors) {
      const list = successors.get(link.predecessorId) ?? [];
      list.push({ link, id: task.id });
      successors.set(link.predecessorId, list);
    }
  }

  for (let pass = 0; pass < tasks.length; pass += 1) {
    let changed = false;
    for (const task of tasks) {
      for (const successor of successors.get(task.id) ?? []) {
        const cap = latestFinish(successor.link, lateStart.get(successor.id)!, lateFinish.get(successor.id)!, task.duration);
        if (cap < lateFinish.get(task.id)!) {
          setLate(task.id, cap, task.duration);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const wbs = new Map(tasks.map((task) => [task.id, task.wbs]));
  const activities: ProgrammeActivity[] = tasks.map((task) => {
    const plannedStartDay = earlyStart.get(task.id)!;
    const plannedFinishDay = earlyFinish.get(task.id)!;
    const actualStartDay = task.actualStartLag === null ? null : plannedStartDay + task.actualStartLag;
    const actualFinishDay = task.actualFinishLag === null ? null : plannedFinishDay + task.actualFinishLag;
    const startedLate = task.actualStartLag !== null && task.actualStartLag > 0;
    const notStarted = task.actualStartLag === null && task.progress < 100 && today > plannedStartDay;
    const startDelay = startedLate ? task.actualStartLag! : notStarted ? today - plannedStartDay : 0;
    const finishedLate = task.actualFinishLag !== null && task.actualFinishLag > 0;
    const stillOpen = task.actualFinishLag === null && task.progress < 100 && today > plannedFinishDay;
    const finishDelay = finishedLate ? task.actualFinishLag! : stillOpen ? today - plannedFinishDay : 0;
    const float = lateStart.get(task.id)! - plannedStartDay;
    return {
      kind: task.kind,
      id: task.id,
      phaseId: task.phaseId,
      wbs: task.wbs,
      name: task.name,
      duration: task.duration,
      plannedStart: isoFromDay(plannedStartDay),
      plannedFinish: isoFromDay(plannedFinishDay),
      plannedStartDay,
      plannedFinishDay,
      actualStart: actualStartDay === null ? null : isoFromDay(actualStartDay),
      actualFinish: actualFinishDay === null ? null : isoFromDay(actualFinishDay),
      actualStartDay,
      actualFinishDay,
      progress: task.progress,
      critical: float <= 0,
      delayed: startDelay > 0 || finishDelay > 0,
      float,
      startDelay,
      finishDelay,
      predecessors: task.predecessors.map((link) => ({
        id: link.predecessorId,
        wbs: wbs.get(link.predecessorId) ?? link.predecessorId,
        type: link.type,
        lag: link.lag,
      })),
    };
  });

  const rows: ProgrammeRow[] = [];
  for (const phase of phases) {
    const children = activities.filter((item) => item.phaseId === phase.id);
    if (children.length === 0) continue;
    const plannedStartDay = Math.min(...children.map((item) => item.plannedStartDay));
    const plannedFinishDay = Math.max(...children.map((item) => item.plannedFinishDay));
    const actualStarts = children.map((item) => item.actualStartDay).filter((day): day is number => day !== null);
    const actualFinishes = children.map((item) => item.actualFinishDay).filter((day): day is number => day !== null);
    const weighted = children.filter((item) => item.kind === "task" && item.duration > 0);
    const weight = weighted.reduce((sum, item) => sum + item.duration, 0);
    const progress = weight === 0 ? 0 : Math.round(weighted.reduce((sum, item) => sum + item.progress * item.duration, 0) / weight);
    const allFinished = children.every((item) => item.actualFinish);
    rows.push({
      kind: "phase",
      id: phase.id,
      wbs: phase.wbs,
      name: phase.name,
      plannedStart: isoFromDay(plannedStartDay),
      plannedFinish: isoFromDay(plannedFinishDay),
      plannedStartDay,
      plannedFinishDay,
      actualStart: actualStarts.length ? isoFromDay(Math.min(...actualStarts)) : null,
      actualFinish: allFinished && actualFinishes.length ? isoFromDay(Math.max(...actualFinishes)) : null,
      actualStartDay: actualStarts.length ? Math.min(...actualStarts) : null,
      actualFinishDay: allFinished && actualFinishes.length ? Math.max(...actualFinishes) : null,
      duration: plannedFinishDay - plannedStartDay + 1,
      progress,
      critical: children.some((item) => item.critical),
      delayed: children.some((item) => item.delayed),
      float: Math.min(...children.map((item) => item.float)),
    });
    rows.push(...children);
  }
  return rows;
}
