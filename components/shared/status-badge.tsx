import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  accountStatusLabel,
  activityStatusLabel,
  employmentStatusLabel,
  projectStatusLabel,
  taskPriorityLabel,
  taskStatusLabel,
} from "@/lib/labels";
import type { AccountStatus, ActivityStatus, EmploymentStatus, ProjectStatus, TaskPriority, TaskStatus } from "@/types";

const projectTone: Record<ProjectStatus, BadgeTone> = {
  planning: "slate",
  active: "blue",
  on_hold: "amber",
  delayed: "red",
  completed: "green",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge tone={projectTone[status]}>{projectStatusLabel[status]}</Badge>;
}

export function AccountBadge({ status }: { status: AccountStatus }) {
  return <Badge tone={status === "active" ? "green" : "slate"}>{accountStatusLabel[status]}</Badge>;
}

export function EmploymentBadge({ status }: { status: EmploymentStatus }) {
  const tone: Record<EmploymentStatus, BadgeTone> = {
    active: "green",
    on_leave: "amber",
    contract: "blue",
    inactive: "slate",
  };
  return <Badge tone={tone[status]}>{employmentStatusLabel[status]}</Badge>;
}

export function ActivityBadge({ status }: { status: ActivityStatus }) {
  const tone: Record<ActivityStatus, BadgeTone> = { success: "green", warning: "amber", failed: "red" };
  return <Badge tone={tone[status]}>{activityStatusLabel[status]}</Badge>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const tone: Record<TaskStatus, BadgeTone> = { todo: "slate", in_progress: "blue", review: "amber", done: "green" };
  return <Badge tone={tone[status]}>{taskStatusLabel[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const tone: Record<TaskPriority, BadgeTone> = { low: "slate", medium: "blue", high: "amber", critical: "red" };
  return <Badge tone={tone[priority]}>{taskPriorityLabel[priority]}</Badge>;
}
