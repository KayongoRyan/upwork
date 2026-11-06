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

export interface MonthlyPoint {
  month: string;
  started: number;
  completed: number;
  updates: number;
}

export interface AdminState {
  projects: Project[];
  users: UserAccount[];
  employees: Employee[];
  activityLogs: ActivityLog[];
  notifications: AppNotification[];
  tasks: TaskItem[];
  settings: OrgSettings;
  monthlyActivity: MonthlyPoint[];
}

export type ProjectInput = Omit<Project, "id" | "createdAt">;
export type UserInput = Omit<UserAccount, "id" | "registeredAt">;
export type EmployeeInput = Omit<Employee, "id">;
export type TaskInput = Omit<TaskItem, "id">;

export type ActionResult = { ok: true } | { ok: false; error: string };
