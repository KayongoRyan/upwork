import { createSeedState } from "@/lib/mock-data/seed";
import { PREVIEW_ACTOR_ID } from "@/lib/utils";
import type {
  ActivityLog,
  ActivityStatus,
  AdminState,
  AppNotification,
  EmployeeInput,
  NotificationType,
  ProjectInput,
  TaskInput,
  UserInput,
} from "@/types";

interface Stamp {
  id: string;
  at: string;
  notificationId?: string;
}

export type AdminAction =
  | { type: "reset" }
  | { type: "create-project"; input: ProjectInput; stamp: Stamp }
  | { type: "update-project"; id: string; input: ProjectInput; stamp: Stamp }
  | { type: "delete-project"; id: string; stamp: Stamp }
  | { type: "create-user"; input: UserInput; stamp: Stamp }
  | { type: "update-user"; id: string; input: UserInput; stamp: Stamp }
  | { type: "set-user-status"; id: string; status: UserInput["status"]; stamp: Stamp }
  | { type: "delete-user"; id: string; stamp: Stamp }
  | { type: "create-employee"; input: EmployeeInput; stamp: Stamp }
  | { type: "update-employee"; id: string; input: EmployeeInput; stamp: Stamp }
  | { type: "delete-employee"; id: string; stamp: Stamp }
  | { type: "create-task"; input: TaskInput; stamp: Stamp }
  | { type: "set-task-status"; id: string; status: TaskInput["status"]; stamp: Stamp }
  | { type: "delete-task"; id: string; stamp: Stamp }
  | { type: "mark-notification"; id: string; read: boolean }
  | { type: "mark-all-notifications" }
  | { type: "update-settings"; patch: Partial<AdminState["settings"]>; stamp?: Stamp }
  | { type: "support-request"; topic: string; message: string; stamp: Stamp };

export function adminReducer(state: AdminState, action: AdminAction): AdminState {
  switch (action.type) {
    case "reset":
      return createSeedState();
    case "create-project": {
      const project = {
        ...normalizeProject(action.input),
        id: action.stamp.id,
        createdAt: action.stamp.at,
      };
      return audit(
        {
          ...state,
          projects: [project, ...state.projects],
          notifications: maybeNotify(state, action.stamp, {
            type: "project",
            title: "Project created",
            message: `${project.name} (${project.code}) was added to the portfolio.`,
          }),
        },
        action.stamp,
        "Created project",
        "Projects",
        project.code,
        "success",
      );
    }
    case "update-project": {
      const current = state.projects.find((project) => project.id === action.id);
      if (!current) return state;
      const next = { ...current, ...normalizeProject(action.input), id: current.id, createdAt: current.createdAt };
      const becameDelayed = current.status !== "delayed" && next.status === "delayed";
      return audit(
        {
          ...state,
          projects: state.projects.map((project) => (project.id === next.id ? next : project)),
          notifications: becameDelayed
            ? maybeNotify(state, action.stamp, {
                type: "delay",
                title: `${next.code} marked delayed`,
                message: `${next.name} is now delayed at ${next.progress}% progress.`,
              }, state.settings.delayAlerts)
            : maybeNotify(state, action.stamp, {
                type: "status",
                title: `${next.code} updated`,
                message: `${next.name} is now ${next.status.replace("_", " ")} at ${next.progress}% progress.`,
              }),
        },
        action.stamp,
        "Updated project",
        "Projects",
        next.code,
        becameDelayed ? "warning" : "success",
      );
    }
    case "delete-project": {
      const project = state.projects.find((item) => item.id === action.id);
      if (!project) return state;
      return audit(
        {
          ...state,
          projects: state.projects.filter((item) => item.id !== project.id),
          users: state.users.map((user) => (user.projectId === project.id ? { ...user, projectId: null } : user)),
          employees: state.employees.map((employee) =>
            employee.projectId === project.id ? { ...employee, projectId: null } : employee,
          ),
          tasks: state.tasks.filter((task) => task.projectId !== project.id),
        },
        action.stamp,
        "Deleted project",
        "Projects",
        project.code,
        "warning",
      );
    }
    case "create-user": {
      const user = { ...normalizeUser(action.input), id: action.stamp.id, registeredAt: action.stamp.at.slice(0, 10) };
      return audit(
        {
          ...state,
          users: [user, ...state.users],
          notifications: maybeNotify(
            state,
            action.stamp,
            {
              type: "user",
              title: "User registered",
              message: `${user.firstName} ${user.lastName} was added as ${user.role.replaceAll("_", " ")}.`,
            },
            state.settings.userRegistrationAlerts,
          ),
        },
        action.stamp,
        "Registered user",
        "Users",
        `${user.firstName} ${user.lastName}`,
        "success",
      );
    }
    case "update-user": {
      const current = state.users.find((user) => user.id === action.id);
      if (!current) return state;
      const next = { ...current, ...normalizeUser(action.input), id: current.id, registeredAt: current.registeredAt };
      return audit(
        { ...state, users: state.users.map((user) => (user.id === next.id ? next : user)) },
        action.stamp,
        "Updated user",
        "Users",
        `${next.firstName} ${next.lastName}`,
        "success",
      );
    }
    case "set-user-status": {
      const user = state.users.find((item) => item.id === action.id);
      if (!user) return state;
      return audit(
        {
          ...state,
          users: state.users.map((item) => (item.id === user.id ? { ...item, status: action.status } : item)),
        },
        action.stamp,
        action.status === "active" ? "Activated user" : "Deactivated user",
        "Users",
        `${user.firstName} ${user.lastName}`,
        "success",
      );
    }
    case "delete-user": {
      const user = state.users.find((item) => item.id === action.id);
      if (!user) return state;
      return audit(
        { ...state, users: state.users.filter((item) => item.id !== user.id) },
        action.stamp,
        "Deleted user",
        "Users",
        `${user.firstName} ${user.lastName}`,
        "warning",
      );
    }
    case "create-employee": {
      const employee = { ...action.input, id: action.stamp.id, projectId: emptyToNull(action.input.projectId) };
      return audit(
        { ...state, employees: [employee, ...state.employees] },
        action.stamp,
        "Registered employee",
        "Employees",
        employee.employeeCode,
        "success",
      );
    }
    case "update-employee": {
      const current = state.employees.find((employee) => employee.id === action.id);
      if (!current) return state;
      const next = { ...action.input, id: current.id, projectId: emptyToNull(action.input.projectId) };
      return audit(
        { ...state, employees: state.employees.map((employee) => (employee.id === next.id ? next : employee)) },
        action.stamp,
        "Updated employee",
        "Employees",
        next.employeeCode,
        "success",
      );
    }
    case "delete-employee": {
      const employee = state.employees.find((item) => item.id === action.id);
      if (!employee) return state;
      return audit(
        { ...state, employees: state.employees.filter((item) => item.id !== employee.id) },
        action.stamp,
        "Removed employee",
        "Employees",
        employee.employeeCode,
        "warning",
      );
    }
    case "create-task": {
      const item = { ...action.input, id: action.stamp.id };
      return audit(
        { ...state, tasks: [item, ...state.tasks] },
        action.stamp,
        "Created task",
        "Tasks",
        item.title,
        "success",
      );
    }
    case "set-task-status": {
      const item = state.tasks.find((task) => task.id === action.id);
      if (!item) return state;
      return audit(
        {
          ...state,
          tasks: state.tasks.map((task) => (task.id === item.id ? { ...task, status: action.status } : task)),
        },
        action.stamp,
        "Updated task status",
        "Tasks",
        item.title,
        action.status === "done" ? "success" : "success",
      );
    }
    case "delete-task": {
      const item = state.tasks.find((task) => task.id === action.id);
      if (!item) return state;
      return audit(
        { ...state, tasks: state.tasks.filter((task) => task.id !== item.id) },
        action.stamp,
        "Deleted task",
        "Tasks",
        item.title,
        "warning",
      );
    }
    case "mark-notification":
      return {
        ...state,
        notifications: state.notifications.map((item) =>
          item.id === action.id ? { ...item, read: action.read } : item,
        ),
      };
    case "mark-all-notifications":
      return { ...state, notifications: state.notifications.map((item) => ({ ...item, read: true })) };
    case "update-settings": {
      const next = { ...state, settings: { ...state.settings, ...action.patch } };
      if (!action.stamp) return next;
      return audit(next, action.stamp, "Updated settings", "Settings", "Organization profile", "success");
    }
    case "support-request":
      return audit(
        {
          ...state,
          notifications: [
            {
              id: action.stamp.notificationId ?? `${action.stamp.id}-note`,
              type: "system",
              title: "Support note saved",
              message: `${action.topic}: ${action.message}`,
              read: false,
              createdAt: action.stamp.at,
            },
            ...state.notifications,
          ],
        },
        action.stamp,
        "Saved a help request",
        "Help",
        action.topic,
        "success",
      );
    default:
      return state;
  }
}

function normalizeProject(input: ProjectInput): ProjectInput {
  return {
    ...input,
    code: input.code.toUpperCase(),
    progress: input.status === "completed" ? 100 : input.progress,
    spent: input.spent,
  };
}

function normalizeUser(input: UserInput): UserInput {
  return {
    ...input,
    email: input.email.toLowerCase(),
    projectId: emptyToNull(input.projectId),
  };
}

function emptyToNull(value: string | null) {
  if (!value || value === "unassigned") return null;
  return value;
}

function audit(
  state: AdminState,
  stamp: Stamp,
  action: string,
  module: string,
  record: string,
  status: ActivityStatus,
): AdminState {
  const entry: ActivityLog = {
    id: stamp.id.startsWith("log") ? stamp.id : `log-${stamp.id}`,
    userId: PREVIEW_ACTOR_ID,
    userName: state.settings.profileName,
    action,
    module,
    record,
    timestamp: stamp.at,
    status,
  };
  return { ...state, activityLogs: [entry, ...state.activityLogs] };
}

function maybeNotify(
  state: AdminState,
  stamp: Stamp,
  draft: { type: NotificationType; title: string; message: string },
  enabled = true,
): AppNotification[] {
  if (!enabled) return state.notifications;
  const item: AppNotification = {
    id: stamp.notificationId ?? `ntf-${stamp.id}`,
    ...draft,
    read: false,
    createdAt: stamp.at,
  };
  return [item, ...state.notifications];
}
