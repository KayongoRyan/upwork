import type {
  AccountStatus,
  ActivityStatus,
  EmploymentStatus,
  NotificationType,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
  UserRole,
} from "@/types";

export const projectStatusLabel: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  delayed: "Delayed",
  completed: "Completed",
};

export const roleLabel: Record<UserRole, string> = {
  administrator: "Administrator",
  project_manager: "Project Manager",
  site_engineer: "Site Engineer",
  quantity_surveyor: "Quantity Surveyor",
};

export const accountStatusLabel: Record<AccountStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const employmentStatusLabel: Record<EmploymentStatus, string> = {
  active: "Active",
  on_leave: "On leave",
  contract: "Contract",
  inactive: "Inactive",
};

export const activityStatusLabel: Record<ActivityStatus, string> = {
  success: "Success",
  warning: "Warning",
  failed: "Failed",
};

export const notificationTypeLabel: Record<NotificationType, string> = {
  project: "Project",
  user: "User",
  status: "Status",
  delay: "Delay",
  system: "System",
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  todo: "To do",
  pending: "Pending",
  done: "Done",
};

export const taskPriorityLabel: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const departments = [
  "Construction",
  "Engineering",
  "Survey",
  "Health & Safety",
  "Plant & Logistics",
  "Administration",
] as const;

export const projectStatuses = Object.keys(projectStatusLabel) as ProjectStatus[];
export const userRoles = Object.keys(roleLabel) as UserRole[];
export const accountStatuses = Object.keys(accountStatusLabel) as AccountStatus[];
export const employmentStatuses = Object.keys(employmentStatusLabel) as EmploymentStatus[];
export const taskStatuses = Object.keys(taskStatusLabel) as TaskStatus[];
export const taskPriorities = Object.keys(taskPriorityLabel) as TaskPriority[];
