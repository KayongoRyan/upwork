import { DEMO_TODAY } from "@/lib/utils";

export interface ProjectMilestone {
  id: string;
  name: string;
  plannedDate: string;
  actualDate: string | null;
}

export interface ProjectMaterial {
  id: string;
  name: string;
  unit: string;
  required: number;
  received: number;
  consumed: number;
}

export interface ProjectEquipment {
  id: string;
  name: string;
  code: string;
  status: "on_site" | "idle" | "off_hire";
  operator: string;
  assignedOn: string;
}

export interface ProjectRisk {
  id: string;
  title: string;
  kind: "delay" | "issue";
  severity: "low" | "medium" | "high";
  status: "open" | "mitigating" | "closed";
  impact: string;
  mitigation: string;
  owner: string;
}

export interface LabourGang {
  id: string;
  trade: string;
  planned: number;
  onSite: number;
}

export interface ProjectWorkspaceData {
  milestones: ProjectMilestone[];
  materials: ProjectMaterial[];
  equipment: ProjectEquipment[];
  risks: ProjectRisk[];
  labour: LabourGang[];
}

const empty: ProjectWorkspaceData = {
  milestones: [],
  materials: [],
  equipment: [],
  risks: [],
  labour: [],
};

/** Linear share of the programme consumed by the preview clock. */
export function plannedProgress(startDate: string, expectedEndDate: string) {
  const start = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${expectedEndDate.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${DEMO_TODAY}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  if (end <= start) return today >= end ? 100 : 0;
  if (today <= start) return 0;
  if (today >= end) return 100;
  return Math.round(((today - start) / (end - start)) * 100);
}

export function milestoneState(item: ProjectMilestone): "done" | "due" | "overdue" | "upcoming" {
  if (item.actualDate) return "done";
  if (item.plannedDate < DEMO_TODAY) return "overdue";
  if (item.plannedDate === DEMO_TODAY) return "due";
  return "upcoming";
}

export function workspaceFor(projectId: string): ProjectWorkspaceData {
  return records[projectId] ?? empty;
}

const records: Record<string, ProjectWorkspaceData> = {
  "prj-bypass": {
    milestones: [
      ms("ms-bypass-1", "Site establishment", "2025-03-20", "2025-03-18"),
      ms("ms-bypass-2", "Carriageway earthworks complete", "2026-06-30", "2026-07-12"),
      ms("ms-bypass-3", "Pedestrian bridge piers set out", "2026-11-20", null),
      ms("ms-bypass-4", "Practical completion", "2027-04-30", null),
    ],
    materials: [
      mat("mat-bypass-1", "Crushed stone base", "m3", 18000, 14200, 12100),
      mat("mat-bypass-2", "Asphalt wearing course", "t", 6400, 2100, 1680),
      mat("mat-bypass-3", "Precast drainage pipes", "m", 4200, 3900, 3100),
    ],
    equipment: [
      eq("eq-bypass-1", "Asphalt paver", "PLT-014", "on_site", "Daniel Opio", "2026-09-02"),
      eq("eq-bypass-2", "20 t excavator", "PLT-008", "on_site", "Isaac Tumusiime", "2025-03-04"),
      eq("eq-bypass-3", "Tipper truck", "PLT-031", "idle", "Pool", "2026-10-11"),
    ],
    risks: [
      risk("rsk-bypass-1", "Drainage shop drawings still with the client", "issue", "medium", "mitigating", "Piers cannot be poured until the drawings are approved.", "Helen Nabirye is chasing the comment sheet this week.", "Helen Nabirye"),
      risk("rsk-bypass-2", "Rain on the northern cut", "delay", "low", "open", "A wet week slips the base course by about four days.", "Keep the stockpile covered and hold a dry-weather pour window.", "Isaac Tumusiime"),
    ],
    labour: [
      gang("lab-bypass-1", "Earthworks", 46, 44),
      gang("lab-bypass-2", "Structures", 22, 19),
    ],
  },
  "prj-cargo": {
    milestones: [
      ms("ms-cargo-1", "Apron bay 1–3 poured", "2026-08-15", "2026-09-02"),
      ms("ms-cargo-2", "Cold-room steel on site", "2026-10-10", null),
      ms("ms-cargo-3", "Customs hall watertight", "2026-11-06", null),
      ms("ms-cargo-4", "Practical completion", "2026-11-18", null),
    ],
    materials: [
      mat("mat-cargo-1", "Apron concrete", "m3", 8200, 6400, 6100),
      mat("mat-cargo-2", "Cold-room structural steel", "t", 180, 96, 80),
      mat("mat-cargo-3", "Blockwork", "m2", 6400, 4300, 4100),
      mat("mat-cargo-4", "Reinforcement", "t", 900, 700, 640),
    ],
    equipment: [
      eq("eq-cargo-1", "Concrete pump", "PLT-022", "idle", "Unassigned", "2026-10-18"),
      eq("eq-cargo-2", "Mobile crane 50 t", "PLT-019", "on_site", "Daniel Opio", "2026-07-01"),
      eq("eq-cargo-3", "Telehandler", "PLT-027", "on_site", "Martha Akello", "2026-06-20"),
    ],
    risks: [
      risk("rsk-cargo-1", "Cold-room steel package has not arrived", "delay", "high", "open", "Completion is 18 Nov 2026 and the steel is still short. The hall cannot close.", "Recover the balance tonnes and rebaseline the customs hall programme.", "Sarah Namakula"),
      risk("rsk-cargo-2", "Night pour cancelled — no concrete delivery", "issue", "high", "mitigating", "Apron bay 4 has not started. The pump is standing.", "Hold the pump until the next confirmed delivery, then pour bay 4.", "Lydia Atim"),
    ],
    labour: [
      gang("lab-cargo-1", "Concrete", 30, 22),
      gang("lab-cargo-2", "Steel fixers", 24, 11),
      gang("lab-cargo-3", "Blockwork", 18, 16),
    ],
  },
  "prj-bridge": {
    milestones: [
      ms("ms-bridge-1", "Traffic management in place", "2025-01-15", "2025-01-20"),
      ms("ms-bridge-2", "Bearing replacement — west", "2026-08-30", "2026-09-14"),
      ms("ms-bridge-3", "Night closure for east bearings", "2026-11-28", null),
      ms("ms-bridge-4", "Practical completion", "2026-12-12", null),
    ],
    materials: [
      mat("mat-bridge-1", "Bridge bearings", "nr", 16, 16, 12),
      mat("mat-bridge-2", "Deck joint sealant", "m", 240, 180, 90),
      mat("mat-bridge-3", "Night-shift concrete", "m3", 80, 40, 28),
    ],
    equipment: [
      eq("eq-bridge-1", "Underbridge unit", "PLT-041", "on_site", "Moses Wanyama", "2026-10-01"),
      eq("eq-bridge-2", "Lighting tower", "PLT-044", "idle", "Pool", "2026-11-01"),
    ],
    risks: [
      risk("rsk-bridge-1", "Night closure not confirmed", "delay", "medium", "mitigating", "The east bearing replacement cannot start without the 28 Nov closure.", "Moses Wanyama is waiting on the traffic authority.", "Moses Wanyama"),
    ],
    labour: [
      gang("lab-bridge-1", "Night shift", 14, 8),
      gang("lab-bridge-2", "Day shift", 12, 12),
    ],
  },
  "prj-hospital": {
    milestones: [
      ms("ms-hospital-1", "Substructure complete", "2026-01-30", "2026-02-18"),
      ms("ms-hospital-2", "Funding review", "2026-11-25", null),
      ms("ms-hospital-3", "Superstructure restart", "2027-01-15", null),
      ms("ms-hospital-4", "Practical completion", "2027-08-01", null),
    ],
    materials: [
      mat("mat-hospital-1", "Stored wall finishes", "m2", 2400, 1800, 0),
      mat("mat-hospital-2", "Structural concrete", "m3", 3100, 900, 860),
    ],
    equipment: [
      eq("eq-hospital-1", "Tower crane", "PLT-052", "idle", "Stood down", "2026-10-28"),
      eq("eq-hospital-2", "Materials hoist", "PLT-053", "off_hire", "Off hire", "2026-10-30"),
    ],
    risks: [
      risk("rsk-hospital-1", "Funding review has paused the site", "delay", "high", "open", "Works stay on hold until the client confirms the next certificate.", "Protect stored finishes and keep the review on 25 Nov.", "Peter Ochieng"),
      risk("rsk-hospital-2", "Stored finishes can spoil in the pause", "issue", "medium", "mitigating", "Boards and fittings are in an open store.", "Robert Mbabazi is sheeting the store and logging moisture.", "Robert Mbabazi"),
    ],
    labour: [
      gang("lab-hospital-1", "Caretaker crew", 8, 4),
    ],
  },
  "prj-drain": {
    milestones: [
      ms("ms-drain-1", "Channel lining complete", "2026-05-30", "2026-06-04"),
      ms("ms-drain-2", "Snag list closed", "2026-08-20", "2026-08-23"),
      ms("ms-drain-3", "Handover", "2026-08-30", "2026-08-30"),
    ],
    materials: [
      mat("mat-drain-1", "Channel concrete", "m3", 2600, 2600, 2600),
      mat("mat-drain-2", "Silt trap covers", "nr", 18, 18, 18),
    ],
    equipment: [
      eq("eq-drain-1", "Excavator", "PLT-061", "off_hire", "Off hire", "2026-08-31"),
    ],
    risks: [
      risk("rsk-drain-1", "Defects liability watch", "issue", "low", "closed", "No open defects at handover.", "Liability period is on the certificate. No further mitigation.", "Sarah Namakula"),
    ],
    labour: [
      gang("lab-drain-1", "Close-out crew", 10, 0),
    ],
  },
  "prj-gulu": {
    milestones: [
      ms("ms-gulu-1", "Mobilisation", "2026-07-20", "2026-08-18"),
      ms("ms-gulu-2", "Gravel stockpile in place", "2026-11-22", null),
      ms("ms-gulu-3", "First 4 km surfaced", "2027-03-31", null),
      ms("ms-gulu-4", "Practical completion", "2027-09-15", null),
    ],
    materials: [
      mat("mat-gulu-1", "Gravel", "m3", 14000, 3200, 900),
      mat("mat-gulu-2", "Culvert rings", "nr", 86, 40, 12),
      mat("mat-gulu-3", "Street-light columns", "nr", 120, 0, 0),
    ],
    equipment: [
      eq("eq-gulu-1", "Grader", "PLT-071", "on_site", "Emmanuel Twesigye", "2026-08-18"),
      eq("eq-gulu-2", "Water bowser", "PLT-074", "idle", "Pool", "2026-09-01"),
    ],
    risks: [
      risk("rsk-gulu-1", "Gravel stockpile is short of the programme", "delay", "high", "open", "Surfacing cannot start on the first 4 km.", "Mobilise the balance stockpile before 22 Nov.", "Emmanuel Twesigye"),
    ],
    labour: [
      gang("lab-gulu-1", "Roadworks", 36, 14),
    ],
  },
  "prj-schools": {
    milestones: [
      ms("ms-schools-1", "Plot surveys confirmed", "2026-11-30", null),
      ms("ms-schools-2", "Design sign-off", "2027-02-15", null),
      ms("ms-schools-3", "Site start", "2027-03-01", null),
      ms("ms-schools-4", "Practical completion", "2027-12-01", null),
    ],
    materials: [
      mat("mat-schools-1", "Classroom blocks — not yet called", "nr", 8, 0, 0),
    ],
    equipment: [],
    risks: [
      risk("rsk-schools-1", "Plot surveys are not confirmed", "issue", "medium", "open", "Design cannot be frozen, so the site start stays in 2027.", "Joseph Mugisha is booking the four school plots.", "Joseph Mugisha"),
    ],
    labour: [
      gang("lab-schools-1", "Design coordination", 3, 2),
    ],
  },
  "prj-industrial": {
    milestones: [
      ms("ms-ind-1", "Access road open", "2025-08-01", "2025-08-20"),
      ms("ms-ind-2", "Water main and duct banks", "2026-10-02", null),
      ms("ms-ind-3", "Power ducts energised", "2026-12-15", null),
    ],
    materials: [
      mat("mat-ind-1", "uPVC duct", "m", 4800, 2600, 2100),
      mat("mat-ind-2", "Water main pipe", "m", 2200, 1500, 1200),
      mat("mat-ind-3", "Road base", "m3", 3600, 2000, 1600),
    ],
    equipment: [
      eq("eq-ind-1", "Trencher", "PLT-081", "on_site", "George Wasswa", "2026-09-12"),
      eq("eq-ind-2", "Compactor", "PLT-084", "idle", "Christine Auma", "2026-10-02"),
    ],
    risks: [
      risk("rsk-ind-1", "Utility contractor missed the October milestone", "delay", "high", "open", "The programme date of 2 Oct 2026 has passed at 35% progress.", "Chase the recovery plan and keep the east trench safe.", "George Wasswa"),
      risk("rsk-ind-2", "Open trench on the east access road", "issue", "medium", "mitigating", "The water main trench is a fall risk for other contractors.", "Barriers stay up until the main is backfilled.", "George Wasswa"),
    ],
    labour: [
      gang("lab-ind-1", "Utilities", 20, 12),
      gang("lab-ind-2", "Roadworks", 16, 9),
    ],
  },
};

function ms(id: string, name: string, plannedDate: string, actualDate: string | null): ProjectMilestone {
  return { id, name, plannedDate, actualDate };
}

function mat(id: string, name: string, unit: string, required: number, received: number, consumed: number): ProjectMaterial {
  return { id, name, unit, required, received, consumed };
}

function eq(
  id: string,
  name: string,
  code: string,
  status: ProjectEquipment["status"],
  operator: string,
  assignedOn: string,
): ProjectEquipment {
  return { id, name, code, status, operator, assignedOn };
}

function risk(
  id: string,
  title: string,
  kind: ProjectRisk["kind"],
  severity: ProjectRisk["severity"],
  status: ProjectRisk["status"],
  impact: string,
  mitigation: string,
  owner: string,
): ProjectRisk {
  return { id, title, kind, severity, status, impact, mitigation, owner };
}

function gang(id: string, trade: string, planned: number, onSite: number): LabourGang {
  return { id, trade, planned, onSite };
}
