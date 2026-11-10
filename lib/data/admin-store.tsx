"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { adminReducer, type AdminAction } from "@/lib/data/reducer";
import { billLines, estimateFor, expenditureFor, parseBoq, sameBill } from "@/lib/boq";
import { nextId, PREVIEW_PM_ID, PREVIEW_QS_ID, PREVIEW_SE_ID } from "@/lib/utils";
import type {
  ActionResult,
  AdminState,
  BoqInput,
  DocumentRevision,
  ProjectDocument,
  UserRole,
  EmployeeInput,
  EngineerReportInput,
  EngineerReportStatus,
  OrgSettings,
  ReportPhoto,
  Project,
  ProjectInput,
  TaskInput,
  TaskPriority,
  TaskStatus,
  UserAccount,
  UserInput,
} from "@/types";

interface AdminContextValue {
  state: AdminState;
  dispatch: (action: AdminAction) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ initialState, children }: { initialState: AdminState; children: React.ReactNode }) {
  const [state, setState] = useState(initialState);
  const pending = useRef(0);
  const chain = useRef(Promise.resolve());

  const dispatch = useCallback((action: AdminAction) => {
    setState((current) => adminReducer(current, action));
    pending.current += 1;
    chain.current = chain.current.then(async () => {
      try {
        const response = await fetch("/api/state", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action),
          cache: "no-store",
        });
        if (!response.ok) return;
        const next = (await response.json()) as AdminState;
        if (pending.current === 1) setState(next);
      } finally {
        pending.current -= 1;
      }
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (pending.current > 0) return;
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as AdminState;
      setState((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    }, 1200);
    return () => window.clearInterval(timer);
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);
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
    createTask(input: TaskInput): ActionResult {
      dispatch({ type: "create-task", input, stamp: stamp() });
      return { ok: true };
    },
    setTaskStatus(id: string, status: TaskInput["status"]) {
      dispatch({ type: "set-task-status", id, status, stamp: stamp() });
    },
    assignTask(id: string, projectId: string) {
      dispatch({ type: "assign-task", id, projectId, stamp: stamp() });
    },
    scheduleTask(id: string, input: { projectId: string; assignee: string; dueDate: string; priority: TaskPriority }): ActionResult {
      const task = state.tasks.find((item) => item.id === id);
      const project = state.projects.find((item) => item.id === input.projectId);
      const current = task ? state.projects.find((item) => item.id === task.projectId) : undefined;
      if (!task || !project || !current) return { ok: false, error: "That task is no longer on the portfolio." };
      if (project.managerId !== PREVIEW_PM_ID || current.managerId !== PREVIEW_PM_ID) {
        return { ok: false, error: "You can only schedule tasks on your own projects." };
      }
      dispatch({ type: "schedule-task", id, ...input, stamp: stamp() });
      return { ok: true };
    },
    setProjectProgress(id: string, progress: number, note: string): ActionResult {
      const project = state.projects.find((item) => item.id === id);
      if (!project || project.managerId !== PREVIEW_PM_ID) return { ok: false, error: "That project is not on your portfolio." };
      if (project.status === "completed") return { ok: false, error: "A completed project keeps its recorded progress." };
      dispatch({ type: "set-progress", id, progress, note: note.trim(), stamp: stamp() });
      return { ok: true };
    },
    submitEngineerReport(input: EngineerReportInput): ActionResult {
      const project = state.projects.find((item) => item.id === input.projectId && item.managerId === PREVIEW_PM_ID);
      const engineer = state.users.find((user) => user.id === input.engineerId && user.role === "site_engineer" && user.status === "active");
      if (!project) return { ok: false, error: "Choose one of your projects." };
      if (!engineer) return { ok: false, error: "Choose an active site engineer." };
      if (input.periodEnd < input.periodStart) return { ok: false, error: "Period end must be on or after the start." };
      dispatch({ type: "submit-report", input, stamp: stamp(), toAdmin: true });
      return { ok: true };
    },
    openReportReview(id: string): ActionResult {
      const report = state.reports.find((item) => item.id === id);
      const project = report ? state.projects.find((item) => item.id === report.projectId) : undefined;
      if (!report || !project || project.managerId !== PREVIEW_PM_ID) return { ok: false, error: "That report is not on your portfolio." };
      if (report.status !== "submitted") return { ok: false, error: "Only a submitted report can be opened for review." };
      dispatch({ type: "open-report-review", id, stamp: stamp() });
      return { ok: true };
    },
    decideReport(id: string, decision: Extract<EngineerReportStatus, "approved" | "rejected">, note: string): ActionResult {
      const report = state.reports.find((item) => item.id === id);
      const project = report ? state.projects.find((item) => item.id === report.projectId) : undefined;
      if (!report || !project || project.managerId !== PREVIEW_PM_ID) return { ok: false, error: "That report is not on your portfolio." };
      if (report.status !== "in_review") return { ok: false, error: "Open the report for review before you approve or reject it." };
      if (decision === "rejected" && note.trim().length < 3) return { ok: false, error: "A rejection needs a note the engineer can act on." };
      dispatch({ type: "decide-report", id, decision, note, stamp: stamp() });
      return { ok: true };
    },
    deleteTask(id: string) {
      dispatch({ type: "delete-task", id, stamp: stamp() });
    },
    setAssignedTaskProgress(engineerId: string, id: string, progress: number, status: TaskStatus) {
      dispatch({ type: "set-task-progress", id, engineerId, progress, status, stamp: stamp() });
    },
    submitSiteReport(input: EngineerReportInput) {
      dispatch({ type: "submit-report", input, stamp: stamp() });
    },
    resubmitSiteReport(id: string, input: { progress: number; summary: string; issues: string; photos: ReportPhoto[] }) {
      dispatch({ type: "resubmit-report", id, ...input, stamp: stamp() });
    },
    createBoqLine(surveyorId: string, input: BoqInput) {
      dispatch({ type: "create-boq", surveyorId, input, stamp: stamp() });
    },
    updateBoqLine(surveyorId: string, id: string, input: BoqInput) {
      dispatch({ type: "update-boq", surveyorId, id, input, stamp: stamp() });
    },
    deleteBoqLine(surveyorId: string, id: string) {
      dispatch({ type: "delete-boq", surveyorId, id, stamp: stamp() });
    },
    submitCostReport(projectId: string, surveyorId: string) {
      dispatch({ type: "submit-cost-report", projectId, surveyorId, stamp: stamp() });
    },
    registerDocument(
      document: Omit<ProjectDocument, "id" | "revisions">,
      revision: Omit<DocumentRevision, "id" | "revision" | "uploadedAt">,
    ): ActionResult {
      const number = document.number.trim().toUpperCase();
      if (!number || !document.title.trim()) return { ok: false, error: "Number and title are required." };
      if (!revision.fileName) return { ok: false, error: "Choose a file." };
      if ((state.documents ?? []).some((item) => item.projectId === document.projectId && item.number.toUpperCase() === number)) {
        return { ok: false, error: "That document number is already on this project." };
      }
      dispatch({
        type: "register-document",
        document: { ...document, number, title: document.title.trim() },
        revision: { ...revision, status: revision.status },
        stamp: stamp(),
      });
      return { ok: true };
    },
    reviseDocument(documentId: string, revision: Omit<DocumentRevision, "id" | "revision" | "uploadedAt" | "status">): ActionResult {
      const current = (state.documents ?? []).find((item) => item.id === documentId);
      if (!current) return { ok: false, error: "That document is not on the register." };
      if (!revision.fileName) return { ok: false, error: "Choose a file." };
      dispatch({ type: "revise-document", documentId, revision, stamp: stamp() });
      return { ok: true };
    },
    issueRevision(documentId: string): ActionResult {
      const current = (state.documents ?? []).find((item) => item.id === documentId);
      const latest = current?.revisions[current.revisions.length - 1];
      if (!current || !latest) return { ok: false, error: "That document is not on the register." };
      if (latest.status === "approved") return { ok: false, error: "The latest revision is already issued." };
      dispatch({ type: "issue-revision", documentId, stamp: stamp() });
      return { ok: true };
    },
    setDocumentAccess(documentId: string, access: UserRole[]): ActionResult {
      if (!(state.documents ?? []).some((item) => item.id === documentId)) return { ok: false, error: "That document is not on the register." };
      dispatch({ type: "set-document-access", documentId, access, stamp: stamp() });
      return { ok: true };
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

export function usePm() {
  const data = useAdmin();
  const projects = data.projects.filter((project) => project.managerId === PREVIEW_PM_ID);
  const ids = new Set(projects.map((project) => project.id));
  const actor = data.users.find((user) => user.id === PREVIEW_PM_ID) ?? null;
  return {
    actor,
    projects,
    tasks: data.tasks.filter((task) => ids.has(task.projectId)),
    reports: data.reports.filter((report) => ids.has(report.projectId)),
    boq: data.boq.filter((item) => ids.has(item.projectId)),
    costReports: (data.costReports ?? []).filter((report) => ids.has(report.projectId)),
    progressMarks: (data.progressMarks ?? []).filter((mark) => ids.has(mark.projectId)),
    events: data.calendarEvents ?? [],
    surveyors: data.users.filter((user) => user.role === "quantity_surveyor" && user.status === "active" && user.projectId && ids.has(user.projectId)),
    engineers: data.users.filter((user) => user.role === "site_engineer" && user.status === "active"),
    crew: data.employees.filter((employee) => employee.projectId && ids.has(employee.projectId) && employee.status !== "inactive"),
    inbox: data.notifications.filter((item) => isManagerFieldNotice(item, projects)),
    users: data.users,
    submitReport: data.submitEngineerReport,
    submitCostReport(projectId: string): ActionResult {
      if (!ids.has(projectId)) return { ok: false, error: "That project is not on your portfolio." };
      const surveyor = data.users.find((user) => user.role === "quantity_surveyor" && user.status === "active" && user.projectId === projectId);
      if (!surveyor) return { ok: false, error: "No quantity surveyor is assigned to that project." };
      const live = billLines(data.boq, projectId);
      if (live.length === 0) return { ok: false, error: "There is no bill to submit." };
      const latest = (data.costReports ?? []).find((report) => report.projectId === projectId && report.status === "submitted");
      if (latest && sameBill(latest.lines, live)) return { ok: false, error: "This measurement is already submitted." };
      data.submitCostReport(projectId, surveyor.id);
      return { ok: true };
    },
    openReview: data.openReportReview,
    decideReport: data.decideReport,
    setProgress: data.setProjectProgress,
    scheduleTask: data.scheduleTask,
    setTaskStatus: data.setTaskStatus,
    createTask(input: TaskInput): ActionResult {
      if (!ids.has(input.projectId)) return { ok: false, error: "Assign the task to one of your projects." };
      return data.createTask(input);
    },
    deleteTask(id: string) {
      const task = data.tasks.find((item) => item.id === id);
      if (!task || !ids.has(task.projectId)) return;
      data.deleteTask(id);
    },
    markNotification: data.markNotification,
    projectById: data.projectById,
  };
}

export function useSiteEngineer() {
  const data = useAdmin();
  const actor = data.users.find((user) => user.id === PREVIEW_SE_ID) ?? null;
  const name = actor ? `${actor.firstName} ${actor.lastName}` : "";
  const projects = data.projects.filter((project) => actor?.projectId === project.id);
  const ids = new Set(projects.map((project) => project.id));
  const tasks = data.tasks.filter((task) => ids.has(task.projectId) && task.assignee === name);
  const reports = data.reports.filter((report) => ids.has(report.projectId) && report.engineerId === actor?.id);

  return {
    actor,
    project: projects[0] ?? null,
    tasks,
    reports,
    updateTask(id: string, progress: number, status: TaskStatus): ActionResult {
      const task = tasks.find((item) => item.id === id);
      if (!task || !actor) return { ok: false, error: "That task is not assigned to you." };
      data.setAssignedTaskProgress(actor.id, id, progress, status);
      return { ok: true };
    },
    submitDaily(input: { date: string; progress: number; summary: string; issues: string; photos: ReportPhoto[] }): ActionResult {
      if (!actor?.projectId) return { ok: false, error: "No project is assigned to this account." };
      if (input.summary.trim().length < 12) return { ok: false, error: "Write a short account of the shift, at least a sentence." };
      data.submitSiteReport({
        projectId: actor.projectId,
        engineerId: actor.id,
        periodStart: input.date,
        periodEnd: input.date,
        progress: input.progress,
        summary: input.summary,
        issues: input.issues,
        photos: input.photos,
      });
      return { ok: true };
    },
    resubmit(id: string, input: { progress: number; summary: string; issues: string; photos: ReportPhoto[] }): ActionResult {
      const report = reports.find((item) => item.id === id);
      if (!report) return { ok: false, error: "That report is not on your project." };
      if (report.status !== "rejected") return { ok: false, error: "Only a rejected report can be sent back." };
      if (input.summary.trim().length < 12) return { ok: false, error: "Write what changed since the rejection." };
      data.resubmitSiteReport(id, input);
      return { ok: true };
    },
  };
}

export function useQuantitySurveyor() {
  const data = useAdmin();
  const actor = data.users.find((user) => user.id === PREVIEW_QS_ID) ?? null;
  const project = data.projects.find((item) => item.id === actor?.projectId) ?? null;
  const lines = data.boq.filter((item) => item.projectId === project?.id).sort((a, b) => a.code.localeCompare(b.code));
  const notices = project ? data.notifications.filter((item) => isManagerFieldNotice(item, [project])) : [];

  function checked(input: BoqInput): ActionResult | BoqInput {
    if (!actor?.projectId || !project) return { ok: false, error: "No project is assigned to this account." };
    if (input.projectId !== actor.projectId) return { ok: false, error: "That line is not on your project." };
    const parsed = parseBoq(input);
    if (!parsed) return { ok: false, error: "Check the code, description, unit, quantities, and rate." };
    return parsed;
  }

  return {
    actor,
    project,
    lines,
    notices,
    submissions: (data.costReports ?? []).filter((report) => report.projectId === project?.id && report.status === "submitted"),
    submitter: data.users.find((user) => user.id === (data.costReports ?? []).find((report) => report.projectId === project?.id && report.status === "submitted")?.submittedBy) ?? null,
    estimated: project ? estimateFor(lines, project.id) : 0,
    expenditure: project ? expenditureFor(lines, project.id) : 0,
    add(input: BoqInput): ActionResult {
      const parsed = checked(input);
      if ("ok" in parsed) return parsed;
      data.createBoqLine(actor!.id, parsed);
      return { ok: true };
    },
    save(id: string, input: BoqInput): ActionResult {
      if (!lines.some((item) => item.id === id)) return { ok: false, error: "That line is not on your bill." };
      const parsed = checked(input);
      if ("ok" in parsed) return parsed;
      data.updateBoqLine(actor!.id, id, parsed);
      return { ok: true };
    },
    remove(id: string): ActionResult {
      if (!lines.some((item) => item.id === id)) return { ok: false, error: "That line is not on your bill." };
      if (!actor) return { ok: false, error: "No project is assigned to this account." };
      data.deleteBoqLine(actor.id, id);
      return { ok: true };
    },
    markNotification: data.markNotification,
  };
}

export function isManagerFieldNotice(
  item: { source: string; projectId: string | null; title: string; message: string },
  projects: { id: string; code: string; name: string }[],
) {
  if (item.source !== "site_engineer" && item.source !== "quantity_surveyor") return false;
  if (item.projectId && projects.some((project) => project.id === item.projectId)) return true;
  const text = `${item.title} ${item.message}`;
  return projects.some((project) => text.includes(project.code) || text.includes(project.name));
}

function emailTaken(users: UserAccount[], email: string, exceptId?: string) {
  const needle = email.trim().toLowerCase();
  return users.some((user) => user.id !== exceptId && user.email.toLowerCase() === needle);
}
