export type ProjectStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "delayed"
  | "completed";

export type UserRole =
  | "administrator"
  | "project_manager"
  | "site_engineer"
  | "quantity_surveyor";

export type AccountStatus = "active" | "inactive";

export type EmploymentStatus = "active" | "on_leave" | "contract" | "inactive";

export type ActivityStatus = "success" | "warning" | "failed";

export type NotificationType =
  | "project"
  | "user"
  | "status"
  | "delay"
  | "system";

export type TaskStatus = "todo" | "pending" | "done";

/** Site engineer report moving through the project manager. */
export type EngineerReportStatus = "submitted" | "in_review" | "approved" | "rejected";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface Project {
  id: string;
  name: string;
  code: string;
  description: string;
  client: string;
  location: string;
  managerId: string;
  startDate: string;
  expectedEndDate: string;
  budget: number;
  spent: number;
  progress: number;
  status: ProjectStatus;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  projectId: string | null;
  status: AccountStatus;
  registeredAt: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  phone: string;
  email: string;
  projectId: string | null;
  status: EmploymentStatus;
  hiredAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  record: string;
  timestamp: string;
  status: ActivityStatus;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  /** Portal that sent this notice to the administrator. */
  source: UserRole;
  senderName: string;
  /** Project this notice belongs to. The managing project manager receives it. */
  projectId: string | null;
  /** Account that should see this notice in its own bell. */
  recipientId?: string | null;
  read: boolean;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  projectId: string;
  assignee: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** 0–100 site progress recorded by the assignee. */
  progress: number;
}

export interface ReportPhoto {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export type CostReportStatus = "pending" | "submitted";

/** Frozen bill of quantities filed by the project manager. */
export interface CostReportLine {
  code: string;
  description: string;
  unit: string;
  estimatedQty: number;
  actualQty: number;
  unitRate: number;
}

export interface CostReport {
  id: string;
  projectId: string;
  surveyorId: string;
  status: CostReportStatus;
  lines: CostReportLine[];
  submittedAt: string | null;
  submittedBy: string | null;
}

export interface BoqItem {
  id: string;
  projectId: string;
  code: string;
  description: string;
  unit: string;
  estimatedQty: number;
  actualQty: number;
  /** Francs per unit. Line amounts are round(quantity × rate). */
  unitRate: number;
}

export interface EngineerReport {
  id: string;
  projectId: string;
  engineerId: string;
  periodStart: string;
  periodEnd: string;
  progress: number;
  summary: string;
  issues: string;
  photos: ReportPhoto[];
  status: EngineerReportStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewerId: string | null;
  decisionNote: string;
  /** Kept after a resubmit so the engineer still sees why it was sent back. */
  rejectionNote: string;
}

export interface OrgSettings {
  organizationName: string;
  registrationNumber: string;
  industry: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  timezone: string;
  dateFormat: string;
  currency: string;
  language: string;
  compactTables: boolean;
  emailAlerts: boolean;
  delayAlerts: boolean;
  userRegistrationAlerts: boolean;
  weeklyDigest: boolean;
  profileName: string;
  profileEmail: string;
  profilePhone: string;
  profileTitle: string;
}

export type DocumentCategory =
  | "drawing"
  | "contract"
  | "boq"
  | "photograph"
  | "technical"
  | "minutes"
  | "inspection"
  | "correspondence";

export type RevisionStatus = "draft" | "in_review" | "approved";

export interface DocumentRevision {
  id: string;
  revision: string;
  fileName: string;
  fileType: string;
  size: number;
  note: string;
  status: RevisionStatus;
  uploadedBy: string;
  uploadedAt: string;
  /** Set only for a file uploaded in this preview. Seed revisions have no bytes. */
  dataUrl?: string;
}

/** One controlled document. Older revisions stay on the record when a new file is added. */
export interface ProjectDocument {
  id: string;
  projectId: string;
  number: string;
  title: string;
  category: DocumentCategory;
  discipline: string;
  ownerId: string;
  /** Roles that may open the file. The administrator is always included. */
  access: UserRole[];
  revisions: DocumentRevision[];
}

export interface MonthlyPoint {
  month: string;
  started: number;
  completed: number;
  updates: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  kind: "meeting" | "other";
  date: string;
}

/** A progress percentage saved from the project manager progress page. */
export interface ProgressMark {
  id: string;
  projectId: string;
  progress: number;
  previous: number;
  note: string;
  recordedAt: string;
}

export interface AdminState {
  projects: Project[];
  users: UserAccount[];
  employees: Employee[];
  activityLogs: ActivityLog[];
  notifications: AppNotification[];
  tasks: TaskItem[];
  reports: EngineerReport[];
  boq: BoqItem[];
  costReports: CostReport[];
  documents: ProjectDocument[];
  settings: OrgSettings;
  monthlyActivity: MonthlyPoint[];
  progressMarks: ProgressMark[];
  calendarEvents: CalendarEvent[];
}

export type ProjectInput = Omit<Project, "id" | "createdAt">;
export type UserInput = Omit<UserAccount, "id" | "registeredAt">;
export type EmployeeInput = Omit<Employee, "id">;
export type TaskInput = Omit<TaskItem, "id" | "progress"> & { progress?: number };
export type BoqInput = Omit<BoqItem, "id">;
export type EngineerReportInput = Pick<
  EngineerReport,
  "projectId" | "engineerId" | "periodStart" | "periodEnd" | "progress" | "summary" | "issues"
> & { photos?: ReportPhoto[] };

export type ActionResult = { ok: true } | { ok: false; error: string };
