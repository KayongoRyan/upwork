"use client";

import { createContext, useContext, useMemo, useReducer, type Dispatch } from "react";
import { adminReducer, type AdminAction } from "@/lib/data/reducer";
import { createSeedState } from "@/lib/mock-data/seed";
import { nextId } from "@/lib/utils";
import type {
  ActionResult,
  AdminState,
  EmployeeInput,
  OrgSettings,
  Project,
  ProjectInput,
  TaskInput,
  UserAccount,
  UserInput,
} from "@/types";

interface AdminContextValue {
  state: AdminState;
  dispatch: Dispatch<AdminAction>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(adminReducer, undefined, createSeedState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

function useAdminContext() {
  const context = useContext(AdminContext);
  if (!context) throw new Error("useAdmin must be used inside AdminProvider");
  return context;
}

function stamp() {
  const id = nextId("act");
  return { id, at: new Date().toISOString(), notificationId: `ntf-${id}` };
}

export function useAdmin() {
  const { state, dispatch } = useAdminContext();

  return {
    ...state,
    createProject(input: ProjectInput): ActionResult {
      const code = input.code.trim().toUpperCase();
      if (state.projects.some((project) => project.code.toUpperCase() === code)) {
        return { ok: false, error: "That project code is already in use." };
      }
      dispatch({ type: "create-project", input, stamp: stamp() });
      return { ok: true };
    },
    updateProject(id: string, input: ProjectInput): ActionResult {
      const code = input.code.trim().toUpperCase();
      if (state.projects.some((project) => project.id !== id && project.code.toUpperCase() === code)) {
        return { ok: false, error: "That project code is already in use." };
      }
      dispatch({ type: "update-project", id, input, stamp: stamp() });
      return { ok: true };
    },
    deleteProject(id: string) {
      dispatch({ type: "delete-project", id, stamp: stamp() });
    },
    createUser(input: UserInput): ActionResult {
      if (emailTaken(state.users, input.email)) return { ok: false, error: "That email is already registered." };
      dispatch({ type: "create-user", input, stamp: stamp() });
      return { ok: true };
    },
    updateUser(id: string, input: UserInput): ActionResult {
      if (emailTaken(state.users, input.email, id)) return { ok: false, error: "That email is already registered." };
      dispatch({ type: "update-user", id, input, stamp: stamp() });
      return { ok: true };
    },
    setUserStatus(id: string, status: UserInput["status"]): ActionResult {
      if (id === "u-admin" && status === "inactive") {
        return { ok: false, error: "The preview administrator account stays active." };
      }
      dispatch({ type: "set-user-status", id, status, stamp: stamp() });
      return { ok: true };
    },
    deleteUser(id: string): ActionResult {
      if (id === "u-admin") return { ok: false, error: "The preview administrator account cannot be deleted." };
      const managed = state.projects.filter((project) => project.managerId === id);
      if (managed.length) {
        return {
          ok: false,
          error: `Reassign ${managed.map((project) => project.code).join(", ")} before deleting this manager.`,
        };
      }
      dispatch({ type: "delete-user", id, stamp: stamp() });
      return { ok: true };
    },
    createEmployee(input: EmployeeInput): ActionResult {
      if (state.employees.some((employee) => employee.employeeCode.toLowerCase() === input.employeeCode.trim().toLowerCase())) {
        return { ok: false, error: "That employee ID is already in use." };
      }
      dispatch({ type: "create-employee", input, stamp: stamp() });
      return { ok: true };
    },
    updateEmployee(id: string, input: EmployeeInput): ActionResult {
      if (
        state.employees.some(
          (employee) => employee.id !== id && employee.employeeCode.toLowerCase() === input.employeeCode.trim().toLowerCase(),
        )
      ) {
        return { ok: false, error: "That employee ID is already in use." };
      }
      dispatch({ type: "update-employee", id, input, stamp: stamp() });
      return { ok: true };
    },
    deleteEmployee(id: string) {
      dispatch({ type: "delete-employee", id, stamp: stamp() });
    },
    createTask(input: TaskInput) {
      dispatch({ type: "create-task", input, stamp: stamp() });
    },
    setTaskStatus(id: string, status: TaskInput["status"]) {
      dispatch({ type: "set-task-status", id, status, stamp: stamp() });
    },
    assignTask(id: string, projectId: string) {
      dispatch({ type: "assign-task", id, projectId, stamp: stamp() });
    },
    deleteTask(id: string) {
      dispatch({ type: "delete-task", id, stamp: stamp() });
    },
    markNotification(id: string, read: boolean) {
      dispatch({ type: "mark-notification", id, read });
    },
    markAllNotifications() {
      dispatch({ type: "mark-all-notifications" });
    },
    updateSettings(patch: Partial<OrgSettings>) {
      dispatch({ type: "update-settings", patch, stamp: stamp() });
    },
    saveSupportRequest(topic: string, message: string) {
      dispatch({ type: "support-request", topic, message, stamp: stamp() });
    },
    resetDemo() {
      dispatch({ type: "reset" });
    },
    projectById(id: string | null | undefined) {
      return state.projects.find((project) => project.id === id) ?? null;
    },
    managerName(project: Pick<Project, "managerId">) {
      const manager = state.users.find((user) => user.id === project.managerId);
      return manager ? `${manager.firstName} ${manager.lastName}` : "Unassigned";
    },
  };
}

function emailTaken(users: UserAccount[], email: string, exceptId?: string) {
  const needle = email.trim().toLowerCase();
  return users.some((user) => user.id !== exceptId && user.email.toLowerCase() === needle);
}
