import { compileProgramme, type ProgrammeRow, type SchedulePhase, type ScheduleTask } from "@/lib/cpm";

const cargoPhases: SchedulePhase[] = [
  { id: "c-ph1", projectId: "prj-cargo", wbs: "1", name: "Site establishment" },
  { id: "c-ph2", projectId: "prj-cargo", wbs: "2", name: "Apron" },
  { id: "c-ph3", projectId: "prj-cargo", wbs: "3", name: "Cold room" },
  { id: "c-ph4", projectId: "prj-cargo", wbs: "4", name: "Customs hall" },
  { id: "c-ph5", projectId: "prj-cargo", wbs: "5", name: "Completion" },
];

const cargoTasks: ScheduleTask[] = [
  task("c-1-1", "prj-cargo", "c-ph1", "1.1", "Compound and site access", 26, "2025-06-16", [], 0, 0, 100),
  task("c-1-2", "prj-cargo", "c-ph1", "1.2", "Survey and set-out", 14, undefined, [fs("c-1-1")], 0, 0, 100),
  milestone("c-m1", "prj-cargo", "c-ph1", "1.3", "Site established", [ff("c-1-2")], 0, 0, 100),
  task("c-2-1", "prj-cargo", "c-ph2", "2.1", "Excavate apron and lay subbase", 90, undefined, [fs("c-m1")], 0, 7, 100),
  task("c-2-2", "prj-cargo", "c-ph2", "2.2", "Fix apron reinforcement", 228, undefined, [fs("c-2-1", 2)], 0, 0, 100),
  task("c-2-3", "prj-cargo", "c-ph2", "2.3", "Pour apron bays 1–3", 79, undefined, [fs("c-2-2")], 0, 5, 100),
  task("c-2-4", "prj-cargo", "c-ph2", "2.4", "Pour apron bay 4", 30, undefined, [fs("c-2-3")], null, null, 0),
  task("c-3-1", "prj-cargo", "c-ph3", "3.1", "Procure cold-room steel", 442, undefined, [fs("c-m1")], 0, null, 55),
  task("c-3-2", "prj-cargo", "c-ph3", "3.2", "Erect cold-room steel", 20, undefined, [fs("c-3-1")], null, null, 0),
  task("c-3-3", "prj-cargo", "c-ph3", "3.3", "Install refrigeration plant", 19, undefined, [fs("c-3-2")], null, null, 0),
  task("c-4-1", "prj-cargo", "c-ph4", "4.1", "Customs hall blockwork", 180, "2026-04-01", [fs("c-2-1")], 0, 0, 100),
  task("c-4-2", "prj-cargo", "c-ph4", "4.2", "Roof and make the hall watertight", 40, undefined, [fs("c-4-1")], 0, null, 70),
  milestone("c-m2", "prj-cargo", "c-ph4", "4.3", "Customs hall watertight", [ff("c-4-2")], null, null, 0),
  milestone("c-m3", "prj-cargo", "c-ph5", "5.1", "Practical completion", [ff("c-2-4"), ff("c-3-3"), ff("c-m2")], null, null, 0),
];

const industrialPhases: SchedulePhase[] = [
  { id: "i-ph1", projectId: "prj-industrial", wbs: "1", name: "Access" },
  { id: "i-ph2", projectId: "prj-industrial", wbs: "2", name: "Utilities" },
  { id: "i-ph3", projectId: "prj-industrial", wbs: "3", name: "Power" },
];

const industrialTasks: ScheduleTask[] = [
  task("i-1-1", "prj-industrial", "i-ph1", "1.1", "Open the access road", 110, "2025-04-01", [], 2, 8, 100),
  milestone("i-m1", "prj-industrial", "i-ph1", "1.2", "Access road open", [ff("i-1-1")], 8, 8, 100),
  task("i-2-1", "prj-industrial", "i-ph2", "2.1", "Lay the water main", 392, undefined, [fs("i-m1")], 0, null, 55),
  task("i-2-2", "prj-industrial", "i-ph2", "2.2", "Install duct banks", 440, undefined, [fs("i-m1")], 0, null, 40),
  milestone("i-m2", "prj-industrial", "i-ph2", "2.3", "Water main and ducts complete", [ff("i-2-1"), ff("i-2-2")], null, null, 0),
  task("i-3-1", "prj-industrial", "i-ph3", "3.1", "Energise power ducts", 40, undefined, [fs("i-m2")], null, null, 0),
  milestone("i-m3", "prj-industrial", "i-ph3", "3.2", "Utilities practical completion", [ff("i-3-1")], null, null, 0),
];

const drainPhases: SchedulePhase[] = [
  { id: "d-ph1", projectId: "prj-drain", wbs: "1", name: "Channel" },
  { id: "d-ph2", projectId: "prj-drain", wbs: "2", name: "Close-out" },
];

const drainTasks: ScheduleTask[] = [
  task("d-1-1", "prj-drain", "d-ph1", "1.1", "Line the channel", 691, "2024-06-01", [], 0, 0, 100),
  task("d-1-2", "prj-drain", "d-ph1", "1.2", "Build silt traps", 40, undefined, [fs("d-1-1")], 0, 0, 100),
  milestone("d-m1", "prj-drain", "d-ph1", "1.3", "Channel lining complete", [ff("d-1-2")], 0, 0, 100),
  task("d-2-1", "prj-drain", "d-ph2", "2.1", "Access roads", 70, undefined, [fs("d-m1")], 0, 0, 100),
  task("d-2-2", "prj-drain", "d-ph2", "2.2", "Close the snag list", 20, undefined, [fs("d-2-1")], 0, 0, 100),
  task("d-2-3", "prj-drain", "d-ph2", "2.3", "Landscape the banks", 30, undefined, [fs("d-m1")], 0, 0, 100),
  milestone("d-m2", "prj-drain", "d-ph2", "2.4", "Handover", [ff("d-2-2"), ff("d-2-3")], 0, 0, 100),
];

const programmes: Record<string, { phases: SchedulePhase[]; tasks: ScheduleTask[] }> = {
  "prj-cargo": { phases: cargoPhases, tasks: cargoTasks },
  "prj-industrial": { phases: industrialPhases, tasks: industrialTasks },
  "prj-drain": { phases: drainPhases, tasks: drainTasks },
};

export function programmeFor(projectId: string): ProgrammeRow[] {
  const programme = programmes[projectId];
  if (!programme) return [];
  return compileProgramme(programme.phases, programme.tasks);
}

function fs(predecessorId: string, lag = 0): ScheduleTask["predecessors"][number] {
  return { predecessorId, type: "FS", lag };
}

function ff(predecessorId: string, lag = 0): ScheduleTask["predecessors"][number] {
  return { predecessorId, type: "FF", lag };
}

function task(
  id: string,
  projectId: string,
  phaseId: string,
  wbs: string,
  name: string,
  duration: number,
  start: string | undefined,
  predecessors: ScheduleTask["predecessors"],
  actualStartLag: number | null,
  actualFinishLag: number | null,
  progress: number,
): ScheduleTask {
  return { id, projectId, phaseId, wbs, name, kind: "task", duration, start, predecessors, actualStartLag, actualFinishLag, progress };
}

function milestone(
  id: string,
  projectId: string,
  phaseId: string,
  wbs: string,
  name: string,
  predecessors: ScheduleTask["predecessors"],
  actualStartLag: number | null,
  actualFinishLag: number | null,
  progress: number,
): ScheduleTask {
  return {
    id,
    projectId,
    phaseId,
    wbs,
    name,
    kind: "milestone",
    duration: 0,
    predecessors,
    actualStartLag,
    actualFinishLag,
    progress,
  };
}
