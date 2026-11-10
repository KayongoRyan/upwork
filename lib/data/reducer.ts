import { billLines, expenditureFor, linesActual, parseBoq } from "@/lib/boq";
import { createSeedState } from "@/lib/mock-data/seed";
import { PREVIEW_ACTOR_ID, PREVIEW_PM_ID } from "@/lib/utils";
import type {
  ActivityLog,
  ActivityStatus,
  AdminState,
  AppNotification,
  BoqInput,
  BoqItem,
  CostReport,
  EmployeeInput,
  EngineerReport,
  EngineerReportInput,
  EngineerReportStatus,
  NotificationType,
  DocumentRevision,
  ProjectDocument,
  ProjectInput,
  TaskInput,
  TaskItem,
  TaskPriority,
  UserInput,
  UserRole,
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
  | { type: "assign-task"; id: string; projectId: string; stamp: Stamp }
  | { type: "schedule-task"; id: string; projectId: string; assignee: string; dueDate: string; priority: TaskPriority; stamp: Stamp }
  | { type: "delete-task"; id: string; stamp: Stamp }
  | { type: "add-calendar-event"; title: string; kind: "meeting" | "other"; date: string; stamp: Stamp }
  | { type: "delete-calendar-event"; id: string; stamp: Stamp }
  | { type: "set-progress"; id: string; progress: number; note: string; stamp: Stamp }
  | { type: "set-task-progress"; id: string; engineerId: string; progress: number; status: TaskInput["status"]; stamp: Stamp }
  | { type: "submit-report"; input: EngineerReportInput; stamp: Stamp; toAdmin?: boolean }
  | { type: "resubmit-report"; id: string; progress: number; summary: string; issues: string; photos: EngineerReport["photos"]; stamp: Stamp }
  | { type: "open-report-review"; id: string; stamp: Stamp }
  | { type: "decide-report"; id: string; decision: Extract<EngineerReportStatus, "approved" | "rejected">; note: string; stamp: Stamp }
  | { type: "create-boq"; surveyorId: string; input: BoqInput; stamp: Stamp }
  | { type: "update-boq"; surveyorId: string; id: string; input: BoqInput; stamp: Stamp }
  | { type: "delete-boq"; surveyorId: string; id: string; stamp: Stamp }
  | { type: "submit-cost-report"; projectId: string; surveyorId: string; stamp: Stamp }
  | { type: "revise-cost-bill"; projectId: string; lines: { id: string; estimatedQty: number; actualQty: number; unitRate: number }[]; stamp: Stamp }
  | { type: "register-document"; document: Omit<ProjectDocument, "id" | "revisions">; revision: Omit<DocumentRevision, "id" | "revision" | "uploadedAt">; stamp: Stamp }
  | { type: "revise-document"; documentId: string; revision: Omit<DocumentRevision, "id" | "revision" | "uploadedAt" | "status">; stamp: Stamp }
  | { type: "issue-revision"; documentId: string; stamp: Stamp }
  | { type: "set-document-access"; documentId: string; access: ProjectDocument["access"]; stamp: Stamp }
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
      const manager = state.users.find((user) => user.id === project.managerId);
      const assignee = manager ? `${manager.firstName} ${manager.lastName}` : "Unassigned";
      return audit(
        {
          ...state,
          projects: [project, ...state.projects],
          tasks: [...projectTasks(project.id, project.code, assignee, project.expectedEndDate, action.stamp.id), ...state.tasks],
          notifications: maybeNotify(state, action.stamp, {
            type: "project",
            title: "Project created",
            message: `${project.name} (${project.code}) was added to the portfolio and assigned on To do, Pending, and Done.`,
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
          documents: (state.documents ?? []).filter((item) => item.projectId !== project.id),
          boq: state.boq.filter((item) => item.projectId !== project.id),
          costReports: (state.costReports ?? []).filter((item) => item.projectId !== project.id),
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
    case "add-calendar-event": {
      const title = action.title.trim();
      if (title.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(action.date)) return state;
      const actor = pmActor(state);
      return audit(
        {
          ...state,
          calendarEvents: [
            { id: action.stamp.id, title, kind: action.kind === "meeting" ? "meeting" : "other", date: action.date },
            ...(state.calendarEvents ?? []),
          ],
        },
        action.stamp,
        "Added calendar event",
        "Schedule",
        title,
        "success",
        actor,
      );
    }
    case "delete-calendar-event": {
      return { ...state, calendarEvents: (state.calendarEvents ?? []).filter((event) => event.id !== action.id) };
    }
    case "create-task": {
      const item: TaskItem = {
        ...action.input,
        id: action.stamp.id,
        progress: action.input.progress ?? (action.input.status === "done" ? 100 : 0),
      };
      return audit(
        { ...state, tasks: [item, ...state.tasks] },
        action.stamp,
        "Created task",
        "Tasks",
        item.title,
        "success",
      );
    }
    case "assign-task": {
      const item = state.tasks.find((task) => task.id === action.id);
      const project = state.projects.find((entry) => entry.id === action.projectId);
      if (!item || !project) return state;
      return audit(
        {
          ...state,
          tasks: state.tasks.map((task) => (task.id === item.id ? { ...task, projectId: project.id } : task)),
        },
        action.stamp,
        "Assigned task to project",
        "Tasks",
        `${item.title} → ${project.code}`,
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
    case "schedule-task": {
      const item = state.tasks.find((task) => task.id === action.id);
      const project = managedProject(state, action.projectId);
      const current = item ? managedProject(state, item.projectId) : undefined;
      if (!item || !project || !current) return state;
      return audit(
        {
          ...state,
          tasks: state.tasks.map((task) =>
            task.id === item.id
              ? { ...task, projectId: project.id, assignee: action.assignee.trim(), dueDate: action.dueDate, priority: action.priority }
              : task,
          ),
        },
        action.stamp,
        "Scheduled task",
        "Tasks",
        item.title,
        "success",
        pmActor(state),
      );
    }
    case "set-progress": {
      const project = managedProject(state, action.id);
      if (!project || project.status === "completed") return state;
      const progress = Math.min(100, Math.max(0, Math.round(action.progress)));
      const actor = pmActor(state);
      const note = action.note.trim();
      return audit(
        {
          ...state,
          projects: state.projects.map((item) => (item.id === project.id ? { ...item, progress } : item)),
          progressMarks: [
            {
              id: `mark-${action.stamp.id}`,
              projectId: project.id,
              progress,
              previous: project.progress,
              note,
              recordedAt: action.stamp.at,
            },
            ...(state.progressMarks ?? []),
          ],
          notifications: maybeNotify(state, action.stamp, {
            type: "status",
            title: `${project.code} progress updated`,
            message: `${actor.name} set progress to ${progress}%. ${note}`.trim(),
            source: "project_manager",
            senderName: actor.name,
            projectId: project.id,
          }),
        },
        action.stamp,
        "Updated project progress",
        "Projects",
        project.code,
        "success",
        actor,
      );
    }
    case "set-task-progress": {
      const task = state.tasks.find((item) => item.id === action.id);
      const engineer = state.users.find((user) => user.id === action.engineerId && user.role === "site_engineer" && user.status === "active");
      if (!task || !engineer || engineer.projectId !== task.projectId) return state;
      const name = `${engineer.firstName} ${engineer.lastName}`;
      if (task.assignee !== name) return state;
      const progress = Math.min(100, Math.max(0, Math.round(action.progress)));
      const status = progress >= 100 ? "done" : action.status;
      const project = state.projects.find((item) => item.id === task.projectId);
      return audit(
        {
          ...state,
          tasks: state.tasks.map((item) => (item.id === task.id ? { ...item, progress, status } : item)),
          notifications: maybeNotify(state, action.stamp, {
            type: "status",
            title: `${project?.code ?? "Task"} progress updated`,
            message: `${name} set “${task.title}” to ${progress}%.`,
            source: "site_engineer",
            senderName: name,
            projectId: task.projectId,
          }),
        },
        action.stamp,
        "Updated task progress",
        "Tasks",
        task.title,
        "success",
        { id: engineer.id, name },
      );
    }
    case "submit-report": {
      const project = managedProject(state, action.input.projectId);
      const engineer = state.users.find((user) => user.id === action.input.engineerId && user.role === "site_engineer" && user.status === "active");
      if (!project || !engineer) return state;
      const report: EngineerReport = {
        ...action.input,
        id: action.stamp.id,
        progress: Math.min(100, Math.max(0, Math.round(action.input.progress))),
        summary: action.input.summary.trim(),
        issues: action.input.issues.trim(),
        photos: action.input.photos ?? [],
        status: "submitted",
        submittedAt: action.stamp.at,
        reviewedAt: null,
        reviewerId: null,
        decisionNote: "",
        rejectionNote: "",
      };
      const sender = `${engineer.firstName} ${engineer.lastName}`;
      const adminName = state.settings.profileName;
      const manager = pmActor(state);
      const filed = maybeNotify(state, action.stamp, {
        type: "project",
        title: `${project.code} daily report submitted`,
        message: `${sender} filed a site report for ${project.name} (${report.periodStart} to ${report.periodEnd}) at ${report.progress}% progress.`,
        source: "site_engineer",
        senderName: sender,
        projectId: project.id,
      });
      const notifications = action.toAdmin
        ? [
            receipt(state, action.stamp, project.id, `${project.code} report sent`, `Sent successfully to ${adminName}, who reviews this report.`),
            {
              id: `${action.stamp.notificationId ?? `ntf-${action.stamp.id}`}-review`,
              type: "project" as const,
              title: `${project.code} report submitted for review`,
              message: `${manager.name} sent a report on ${project.name} for ${adminName} to review.`,
              source: "project_manager" as const,
              senderName: manager.name,
              projectId: project.id,
              read: false,
              createdAt: action.stamp.at,
            },
            ...filed,
          ]
        : filed;
      return audit(
        {
          ...state,
          reports: [report, ...state.reports],
          notifications,
        },
        action.stamp,
        "Submitted engineer report",
        "Reports",
        project.code,
        "success",
        { id: engineer.id, name: sender },
      );
    }
    case "open-report-review": {
      const report = state.reports.find((item) => item.id === action.id);
      const project = report ? managedProject(state, report.projectId) : undefined;
      if (!report || !project || report.status !== "submitted") return state;
      const actor = pmActor(state);
      return audit(
        {
          ...state,
          reports: state.reports.map((item) => (item.id === report.id ? { ...item, status: "in_review", reviewerId: actor.id } : item)),
        },
        action.stamp,
        "Opened engineer report",
        "Reports",
        project.code,
        "success",
        actor,
      );
    }
    case "decide-report": {
      const report = state.reports.find((item) => item.id === action.id);
      const project = report ? managedProject(state, report.projectId) : undefined;
      if (!report || !project || report.status !== "in_review") return state;
      const actor = pmActor(state);
      const approved = action.decision === "approved";
      const progress = approved ? Math.max(project.progress, report.progress) : project.progress;
      const engineer = state.users.find((user) => user.id === report.engineerId);
      const engineerName = engineer ? `${engineer.firstName} ${engineer.lastName}` : "the sender";
      const comment = action.note.trim();
      return audit(
        {
          ...state,
          projects: state.projects.map((item) => (item.id === project.id ? { ...item, progress: item.status === "completed" ? 100 : progress } : item)),
          reports: state.reports.map((item) =>
            item.id === report.id
              ? {
                  ...item,
                  status: action.decision,
                  reviewedAt: action.stamp.at,
                  reviewerId: actor.id,
                  decisionNote: action.note.trim(),
                  rejectionNote: action.decision === "rejected" ? action.note.trim() : item.rejectionNote,
                }
              : item,
          ),
          notifications: maybeNotify(state, action.stamp, {
            type: approved ? "status" : "delay",
            title: `${project.code} report ${approved ? "approved" : "rejected"}`,
            message: `${actor.name} sent this review to ${engineerName}: ${comment || "No comment."}${approved ? ` Project progress is ${progress}%.` : ""}`,
            source: "project_manager",
            senderName: actor.name,
            projectId: project.id,
          }),
        },
        action.stamp,
        approved ? "Approved engineer report" : "Rejected engineer report",
        "Reports",
        project.code,
        approved ? "success" : "warning",
        actor,
      );
    }
    case "resubmit-report": {
      const report = state.reports.find((item) => item.id === action.id);
      const engineer = report ? state.users.find((user) => user.id === report.engineerId && user.role === "site_engineer" && user.status === "active") : undefined;
      const project = report ? state.projects.find((item) => item.id === report.projectId) : undefined;
      if (!report || !engineer || !project || report.status !== "rejected" || engineer.projectId !== project.id) return state;
      const name = `${engineer.firstName} ${engineer.lastName}`;
      const progress = Math.min(100, Math.max(0, Math.round(action.progress)));
      return audit(
        {
          ...state,
          reports: state.reports.map((item) =>
            item.id === report.id
              ? {
                  ...item,
                  progress,
                  summary: action.summary.trim(),
                  issues: action.issues.trim(),
                  photos: action.photos,
                  status: "submitted",
                  submittedAt: action.stamp.at,
                  reviewedAt: null,
                  reviewerId: null,
                  decisionNote: "",
                }
              : item,
          ),
          notifications: maybeNotify(state, action.stamp, {
            type: "project",
            title: `${project.code} daily report resubmitted`,
            message: `${name} resubmitted the site report after rejection. ${project.name} is now at ${progress}%.`,
            source: "site_engineer",
            senderName: name,
            projectId: project.id,
          }),
        },
        action.stamp,
        "Resubmitted engineer report",
        "Reports",
        project.code,
        "success",
        { id: engineer.id, name },
      );
    }
    case "create-boq": {
      const surveyor = activeSurveyor(state, action.surveyorId);
      const input = parseBoq(action.input);
      if (!surveyor || !input || input.projectId !== surveyor.projectId) return state;
      const name = `${surveyor.firstName} ${surveyor.lastName}`;
      const item: BoqItem = { ...input, id: action.stamp.id };
      return measure(
        state,
        input.projectId,
        [item, ...state.boq],
        action.stamp,
        `${item.code} added to the bill`,
        `${name} added ${item.description} on the bill of quantities.`,
        { id: surveyor.id, name },
      );
    }
    case "update-boq": {
      const current = state.boq.find((item) => item.id === action.id);
      const surveyor = activeSurveyor(state, action.surveyorId);
      const input = parseBoq(action.input);
      if (!current || !surveyor || !input || current.projectId !== surveyor.projectId || input.projectId !== surveyor.projectId) return state;
      const name = `${surveyor.firstName} ${surveyor.lastName}`;
      const item: BoqItem = { ...input, id: current.id };
      return measure(
        state,
        current.projectId,
        state.boq.map((row) => (row.id === current.id ? item : row)),
        action.stamp,
        `${item.code} quantities updated`,
        `${name} set ${item.description} to ${item.actualQty} ${item.unit} measured at ${item.unitRate} per unit.`,
        { id: surveyor.id, name },
      );
    }
    case "delete-boq": {
      const current = state.boq.find((item) => item.id === action.id);
      const surveyor = activeSurveyor(state, action.surveyorId);
      if (!current || !surveyor || current.projectId !== surveyor.projectId) return state;
      const name = `${surveyor.firstName} ${surveyor.lastName}`;
      return measure(
        state,
        current.projectId,
        state.boq.filter((item) => item.id !== current.id),
        action.stamp,
        `${current.code} removed from the bill`,
        `${name} removed ${current.description} from the bill of quantities.`,
        { id: surveyor.id, name },
      );
    }
    case "revise-cost-bill": {
      const project = managedProject(state, action.projectId);
      if (!project || action.lines.length === 0) return state;
      const edits = new Map(action.lines.map((line) => [line.id, line]));
      let changed = false;
      const boq = state.boq.map((item) => {
        if (item.projectId !== project.id) return item;
        const next = edits.get(item.id);
        if (!next) return item;
        const parsed = parseBoq({ ...item, estimatedQty: next.estimatedQty, actualQty: next.actualQty, unitRate: next.unitRate });
        if (!parsed) return item;
        if (parsed.estimatedQty === item.estimatedQty && parsed.actualQty === item.actualQty && parsed.unitRate === item.unitRate) return item;
        changed = true;
        return { ...item, estimatedQty: parsed.estimatedQty, actualQty: parsed.actualQty, unitRate: parsed.unitRate };
      });
      if (!changed) return state;
      const actor = pmActor(state);
      const spent = expenditureFor(boq, project.id);
      return audit(
        {
          ...state,
          boq,
          projects: state.projects.map((item) => (item.id === project.id ? { ...item, spent } : item)),
          notifications: maybeNotify(state, action.stamp, {
            type: "project",
            title: `${project.code} quantities revised`,
            message: `${actor.name} edited the cost report before submission.`,
            source: "project_manager",
            senderName: actor.name,
            projectId: project.id,
          }),
        },
        action.stamp,
        "Revised cost report",
        "Reports",
        project.code,
        "success",
        actor,
      );
    }
    case "submit-cost-report": {
      const project = managedProject(state, action.projectId);
      const surveyor = state.users.find((user) => user.id === action.surveyorId && user.role === "quantity_surveyor" && user.status === "active" && user.projectId === action.projectId);
      const lines = billLines(state.boq, action.projectId);
      if (!project || !surveyor || lines.length === 0) return state;
      const actor = pmActor(state);
      const report: CostReport = {
        id: action.stamp.id,
        projectId: project.id,
        surveyorId: surveyor.id,
        status: "submitted",
        lines,
        submittedAt: action.stamp.at,
        submittedBy: actor.id,
      };
      const expenditure = linesActual(lines);
      const surveyorName = `${surveyor.firstName} ${surveyor.lastName}`;
      return audit(
        {
          ...state,
          costReports: [report, ...(state.costReports ?? [])],
          notifications: [
            receipt(state, action.stamp, project.id, `${project.code} cost report sent`, `Sent successfully to ${state.settings.profileName}, who reviews this cost report.`),
            ...maybeNotify(state, action.stamp, {
              type: "project",
              title: `${project.code} cost report submitted`,
              message: `${actor.name} submitted ${surveyorName}'s cost statement for ${project.name}. Measured expenditure is ${expenditure} RWF. ${state.settings.profileName} reviews it.`,
              source: "project_manager",
              senderName: actor.name,
              projectId: project.id,
            }),
          ],
        },
        action.stamp,
        "Submitted cost report",
        "Reports",
        project.code,
        "success",
        actor,
      );
    }
    case "register-document": {
      const document: ProjectDocument = {
        ...action.document,
        id: action.stamp.id,
        number: action.document.number.trim().toUpperCase(),
        access: withAdmin(action.document.access),
        revisions: [
          {
            ...action.revision,
            id: `${action.stamp.id}-rev`,
            revision: "01",
            uploadedAt: action.stamp.at,
          },
        ],
      };
      return audit(
        {
          ...state,
          documents: [document, ...(state.documents ?? [])],
          notifications: maybeNotify(state, action.stamp, {
            type: "project",
            title: `${document.number} registered`,
            message: document.revisions[0].status === "approved"
              ? `${document.title} Rev 01 is issued.`
              : `${document.title} Rev 01 is not issued. Do not build from it.`,
            projectId: document.projectId,
          }),
        },
        action.stamp,
        "Registered document",
        "Documents",
        document.number,
        document.revisions[0].status === "approved" ? "success" : "warning",
      );
    }
    case "revise-document": {
      const current = (state.documents ?? []).find((item) => item.id === action.documentId);
      if (!current) return state;
      const code = nextRevision(current);
      const revision: DocumentRevision = {
        ...action.revision,
        id: action.stamp.id,
        revision: code,
        status: "in_review",
        uploadedAt: action.stamp.at,
      };
      return audit(
        {
          ...state,
          documents: (state.documents ?? []).map((item) =>
            item.id === current.id ? { ...item, revisions: [...item.revisions, revision] } : item,
          ),
          notifications: maybeNotify(state, action.stamp, {
            type: "status",
            title: `${current.number} Rev ${code} is not issued`,
            message: `${current.title} has a new file in review. Keep building from the issued revision.`,
            projectId: current.projectId,
          }),
        },
        action.stamp,
        "Uploaded a revision",
        "Documents",
        `${current.number} Rev ${code}`,
        "warning",
      );
    }
    case "issue-revision": {
      const current = (state.documents ?? []).find((item) => item.id === action.documentId);
      const latest = current?.revisions[current.revisions.length - 1];
      if (!current || !latest || latest.status === "approved") return state;
      return audit(
        {
          ...state,
          documents: (state.documents ?? []).map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  revisions: item.revisions.map((revision) =>
                    revision.id === latest.id ? { ...revision, status: "approved" } : revision,
                  ),
                }
              : item,
          ),
          notifications: maybeNotify(state, action.stamp, {
            type: "status",
            title: `${current.number} Rev ${latest.revision} issued`,
            message: `${current.title} Rev ${latest.revision} is now the revision to build from. Earlier revisions are superseded.`,
            projectId: current.projectId,
          }),
        },
        action.stamp,
        "Issued revision",
        "Documents",
        `${current.number} Rev ${latest.revision}`,
        "success",
      );
    }
    case "set-document-access": {
      const current = (state.documents ?? []).find((item) => item.id === action.documentId);
      if (!current) return state;
      return audit(
        {
          ...state,
          documents: (state.documents ?? []).map((item) =>
            item.id === current.id ? { ...item, access: withAdmin(action.access) } : item,
          ),
        },
        action.stamp,
        "Changed document access",
        "Documents",
        current.number,
        "success",
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
              source: "administrator",
              senderName: state.settings.profileName,
              projectId: null,
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

function projectTasks(projectId: string, code: string, assignee: string, dueDate: string, stampId: string): TaskItem[] {
  return [
    { id: `${stampId}-todo`, title: `Open ${code}`, projectId, assignee, dueDate, priority: "high", status: "todo", progress: 0 },
    { id: `${stampId}-pending`, title: `Track ${code}`, projectId, assignee, dueDate, priority: "medium", status: "pending", progress: 40 },
    { id: `${stampId}-done`, title: `Register ${code}`, projectId, assignee, dueDate, priority: "low", status: "done", progress: 100 },
  ];
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

function activeSurveyor(state: AdminState, id: string) {
  return state.users.find((user) => user.id === id && user.role === "quantity_surveyor" && user.status === "active") ?? null;
}

function measure(
  state: AdminState,
  projectId: string,
  boq: BoqItem[],
  stamp: Stamp,
  title: string,
  message: string,
  sender: { id: string; name: string },
) {
  const spent = expenditureFor(boq, projectId);
  const project = state.projects.find((item) => item.id === projectId);
  return audit(
    {
      ...state,
      boq,
      projects: state.projects.map((item) => (item.id === projectId ? { ...item, spent } : item)),
      notifications: maybeNotify(state, stamp, {
        type: "project",
        title: project ? `${project.code} ${title}` : title,
        message,
        source: "quantity_surveyor",
        senderName: sender.name,
        projectId,
      }),
    },
    stamp,
    title,
    "BOQ",
    project?.code ?? projectId,
    "success",
    sender,
  );
}

function managedProject(state: AdminState, projectId: string) {
  return state.projects.find((project) => project.id === projectId && project.managerId === PREVIEW_PM_ID);
}

function withAdmin(access: ProjectDocument["access"]): ProjectDocument["access"] {
  return access.includes("administrator") ? access : ["administrator", ...access];
}

function nextRevision(document: ProjectDocument) {
  const latest = document.revisions[document.revisions.length - 1];
  const current = latest ? Number(latest.revision) : 0;
  return String((Number.isFinite(current) ? current : document.revisions.length) + 1).padStart(2, "0");
}

function pmActor(state: AdminState) {
  const user = state.users.find((item) => item.id === PREVIEW_PM_ID);
  return { id: PREVIEW_PM_ID, name: user ? `${user.firstName} ${user.lastName}` : "Project manager" };
}

function audit(
  state: AdminState,
  stamp: Stamp,
  action: string,
  module: string,
  record: string,
  status: ActivityStatus,
  actor?: { id: string; name: string },
): AdminState {
  const entry: ActivityLog = {
    id: stamp.id.startsWith("log") ? stamp.id : `log-${stamp.id}`,
    userId: actor?.id ?? PREVIEW_ACTOR_ID,
    userName: actor?.name ?? state.settings.profileName,
    action,
    module,
    record,
    timestamp: stamp.at,
    status,
  };
  return { ...state, activityLogs: [entry, ...state.activityLogs] };
}

function receipt(state: AdminState, stamp: Stamp, projectId: string, title: string, message: string): AppNotification {
  return {
    id: `${stamp.notificationId ?? `ntf-${stamp.id}`}-ack`,
    type: "project",
    title,
    message,
    source: "administrator",
    senderName: state.settings.profileName,
    projectId,
    recipientId: PREVIEW_PM_ID,
    read: false,
    createdAt: stamp.at,
  };
}

function maybeNotify(
  state: AdminState,
  stamp: Stamp,
  draft: { type: NotificationType; title: string; message: string; source?: UserRole; senderName?: string; projectId?: string | null },
  enabled = true,
): AppNotification[] {
  if (!enabled) return state.notifications;
  const item: AppNotification = {
    id: stamp.notificationId ?? `ntf-${stamp.id}`,
    type: draft.type,
    title: draft.title,
    message: draft.message,
    source: draft.source ?? "administrator",
    senderName: draft.senderName ?? state.settings.profileName,
    projectId: draft.projectId ?? null,
    read: false,
    createdAt: stamp.at,
  };
  return [item, ...state.notifications];
}
