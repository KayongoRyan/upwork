import { billLines, expenditureFor, linesActual, parseBoq, sameBill } from "@/lib/boq";
import { createSeedState } from "@/lib/mock-data/seed";
import { formatMoney } from "@/lib/utils";
import type {
  ActivityLog,
  ActivityStatus,
  AdminState,
  AppNotification,
  BoqInput,
  BoqItem,
  CostReport,
  CostChangeRecord,
  EmployeeInput,
  EngineerReport,
  EngineerReportInput,
  EngineerReportStatus,
  ExpenseRecord,
  FinancialReviewEvent,
  NotificationType,
  DocumentRevision,
  PaymentRecord,
  ProjectDocument,
  ProjectInput,
  ReportReviewEvent,
  TaskInput,
  TaskItem,
  TaskPriority,
  UserInput,
  UserRole,
  VariationRecord,
  WorkKind,
} from "@/types";

export interface Stamp {
  id: string;
  at: string;
  notificationId?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: UserRole;
}

export type AdminAction =
  | { type: "reset" }
  | { type: "create-project"; input: ProjectInput; stamp: Stamp }
  | { type: "update-project"; id: string; input: ProjectInput; stamp: Stamp }
  | { type: "delete-project"; id: string; stamp: Stamp }
  | { type: "create-user"; input: UserInput; stamp: Stamp; password?: string }
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
  | { type: "delete-report"; id: string; stamp: Stamp }
  | { type: "resubmit-report"; id: string; progress: number; summary: string; issues: string; photos: EngineerReport["photos"]; stamp: Stamp }
  | { type: "open-report-review"; id: string; stamp: Stamp }
  | { type: "decide-report"; id: string; decision: Extract<EngineerReportStatus, "approved" | "rejected">; note: string; stamp: Stamp }
  | { type: "create-boq"; surveyorId: string; input: BoqInput; stamp: Stamp }
  | { type: "create-boq-batch"; surveyorId: string; projectId: string; inputs: BoqInput[]; stamp: Stamp }
  | { type: "update-boq"; surveyorId: string; id: string; input: BoqInput; stamp: Stamp }
  | { type: "delete-boq"; surveyorId: string; id: string; stamp: Stamp }
  | { type: "submit-cost-report"; projectId: string; surveyorId: string; stamp: Stamp }
  | { type: "send-cost-report"; surveyorId: string; stamp: Stamp }
  | { type: "open-cost-report-review"; id: string; stamp: Stamp }
  | { type: "decide-cost-report"; id: string; decision: "approved" | "rejected"; note: string; stamp: Stamp }
  | { type: "delete-cost-report"; id: string; stamp: Stamp }
  | { type: "revise-cost-bill"; projectId: string; lines: { id: string; estimatedQty: number; actualQty: number; unitRate: number }[]; stamp: Stamp }
  | { type: "create-variation"; input: { projectId: string; boqItemId: string | null; reference: string; title: string; description: string; reason: string; type: "addition" | "omission"; amount: number; currency: string }; stamp: Stamp }
  | { type: "update-variation"; id: string; input: { projectId: string; boqItemId: string | null; reference: string; title: string; description: string; reason: string; type: "addition" | "omission"; amount: number; currency: string }; stamp: Stamp }
  | { type: "submit-variation"; id: string; stamp: Stamp }
  | { type: "open-variation-review"; id: string; stamp: Stamp }
  | { type: "decide-variation"; id: string; decision: "approved" | "rejected"; note: string; stamp: Stamp }
  | { type: "cancel-variation"; id: string; note: string; stamp: Stamp }
  | { type: "delete-variation"; id: string; stamp: Stamp }
  | { type: "create-expense"; input: { projectId: string; category: "labor" | "material" | "equipment" | "subcontractor" | "service" | "other"; description: string; amount: number; currency: string; vendor: string; incurredDate: string }; stamp: Stamp }
  | { type: "submit-expense"; id: string; stamp: Stamp }
  | { type: "decide-expense"; id: string; decision: "approved" | "rejected"; note: string; stamp: Stamp }
  | { type: "cancel-expense"; id: string; note: string; stamp: Stamp }
  | { type: "create-payment"; input: { projectId: string; expenseId: string; amount: number; currency: string; method: "cash" | "bank_transfer" | "mobile_money" | "cheque" | "other"; reference: string; scheduledFor: string | null }; stamp: Stamp }
  | { type: "approve-payment"; id: string; note: string; stamp: Stamp }
  | { type: "mark-payment-paid"; id: string; note: string; paidAt: string | null; stamp: Stamp }
  | { type: "fail-payment"; id: string; note: string; stamp: Stamp }
  | { type: "cancel-payment"; id: string; note: string; stamp: Stamp }
  | { type: "reverse-payment"; id: string; note: string; stamp: Stamp }
  | { type: "register-document"; document: Omit<ProjectDocument, "id" | "revisions">; revision: Omit<DocumentRevision, "id" | "revision" | "uploadedAt">; stamp: Stamp }
  | { type: "revise-document"; documentId: string; revision: Omit<DocumentRevision, "id" | "revision" | "uploadedAt" | "status">; stamp: Stamp }
  | { type: "issue-revision"; documentId: string; stamp: Stamp }
  | { type: "set-document-access"; documentId: string; access: ProjectDocument["access"]; stamp: Stamp }
  | { type: "add-work-comment"; kind: WorkKind; workId: string; projectId: string; body: string; stamp: Stamp }
  | { type: "delete-work-comment"; id: string; stamp: Stamp }
  | { type: "mark-notification"; id: string; read: boolean }
  | { type: "mark-all-notifications" }
  | { type: "update-settings"; patch: Partial<AdminState["settings"]>; stamp?: Stamp }
  | { type: "support-request"; topic: string; message: string; stamp: Stamp }
  | {
      type: "vertexa-inquiry";
      serviceName: string;
      clientName: string;
      message: string;
      /** Project manager who should receive a copy, when the deployment has one. */
      recipientId?: string | null;
      stamp: Stamp;
    }
  | { type: "delete-support-note"; id: string; stamp: Stamp };

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
      if (project.managerId && (!manager || manager.role !== "project_manager" || manager.status !== "active")) return state;
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
      const manager = next.managerId ? state.users.find((user) => user.id === next.managerId) : null;
      if (next.managerId && (!manager || manager.role !== "project_manager" || manager.status !== "active")) return state;
      const becameDelayed = current.status !== "delayed" && next.status === "delayed";
      let result = audit(
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
      if (current.budget !== next.budget) {
        result = costChange(result, action.stamp, { id: `cc-${action.stamp.id}-budget`, projectId: next.id, sourceType: "project", sourceId: next.id, action: "update-project", field: "budget", previousValue: current.budget, newValue: next.budget, delta: next.budget - current.budget, currency: state.settings.currency, note: `Budget updated for ${next.code}` });
      }
      if (current.spent !== next.spent) {
        result = costChange(result, action.stamp, { id: `cc-${action.stamp.id}-spent`, projectId: next.id, sourceType: "project", sourceId: next.id, action: "update-project", field: "spent", previousValue: current.spent, newValue: next.spent, delta: next.spent - current.spent, currency: state.settings.currency, note: `Spent updated for ${next.code}` });
      }
      return result;
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
      const actor = pmActor(state, action.stamp);
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
      const project = managedProject(state, action.input.projectId, action.stamp.actorId);
      if (!project) return state;
      if (!isValidEngineerAssignee(state, project.id, action.input.assignee ?? "")) return state;
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
      const project = managedProject(state, action.projectId, action.stamp.actorId);
      const current = item ? managedProject(state, item.projectId, action.stamp.actorId) : undefined;
      if (!item || !project || !current) return state;
      if (!isValidEngineerAssignee(state, project.id, item.assignee)) return state;
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
      const project = item ? managedProject(state, item.projectId, action.stamp.actorId) : undefined;
      if (!item || !project) return state;
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
      const project = item ? managedProject(state, item.projectId, action.stamp.actorId) : undefined;
      if (!item || !project) return state;
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
      const project = managedProject(state, action.projectId, action.stamp.actorId);
      const current = item ? managedProject(state, item.projectId, action.stamp.actorId) : undefined;
      if (!item || !project || !current) return state;
      if (!isValidEngineerAssignee(state, project.id, action.assignee)) return state;
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
        pmActor(state, action.stamp),
      );
    }
    case "set-progress": {
      const project = managedProject(state, action.id, action.stamp.actorId);
      if (!project || project.status === "completed") return state;
      const progress = Math.min(100, Math.max(0, Math.round(action.progress)));
      const actor = pmActor(state, action.stamp);
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
    case "delete-report": {
      const id = action.id;
      return {
        ...state,
        reports: state.reports.filter((item) => item.id !== id),
        notifications: state.notifications.filter((item) => item.id !== `ntf-${id}`),
        activityLogs: state.activityLogs.filter((item) => item.id !== `log-${id}`),
      };
    }
    case "submit-report": {
      const project = managedProject(state, action.input.projectId, action.stamp.actorId);
      const engineer = state.users.find((user) => user.id === action.input.engineerId && user.role === "site_engineer" && user.status === "active");
      if (!project || !engineer) return state;
      if (engineer.projectId !== project.id) return state; // engineer must be assigned to project
      // Duplicate submission protection: same engineer+project+period already has a non-rejected report
      const duplicate = state.reports.some(
        (r) => r.projectId === project.id && r.engineerId === engineer.id && r.periodStart === action.input.periodStart && r.periodEnd === action.input.periodEnd && r.status !== "rejected",
      );
      if (duplicate) return state;
      const historyEvent: ReportReviewEvent = {
        id: action.stamp.id,
        action: "submitted",
        actorId: action.stamp.actorId ?? engineer.id,
        actorName: action.stamp.actorName ?? `${engineer.firstName} ${engineer.lastName}`,
        actorRole: (action.stamp.actorRole ?? "site_engineer") as UserRole,
        note: "",
        at: action.stamp.at,
      };
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
        reviewHistory: [historyEvent],
      };
      const sender = `${engineer.firstName} ${engineer.lastName}`;
      const adminName = state.settings.profileName;
      const manager = pmActor(state, action.stamp);
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
      const project = report ? managedProject(state, report.projectId, action.stamp.actorId) : undefined;
      if (!report || !project || report.status !== "submitted") return state;
      const actor = pmActor(state, action.stamp);
      const historyEvent: ReportReviewEvent = {
        id: action.stamp.id,
        action: "in_review",
        actorId: actor.id,
        actorName: actor.name,
        actorRole: "project_manager",
        note: "",
        at: action.stamp.at,
      };
      return audit(
        {
          ...state,
          reports: state.reports.map((item) => (item.id === report.id ? { ...item, status: "in_review", reviewerId: actor.id, reviewHistory: [...(item.reviewHistory ?? []), historyEvent] } : item)),
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
      const project = report ? managedProject(state, report.projectId, action.stamp.actorId) : undefined;
      if (!report || !project || report.status !== "in_review") return state;
      const actor = pmActor(state, action.stamp);
      const approved = action.decision === "approved";
      const comment = action.note.trim();
      if (!approved && comment.length < 3) return state; // rejection reason required
      const progress = approved ? Math.max(project.progress, report.progress) : project.progress;
      const engineer = state.users.find((user) => user.id === report.engineerId);
      const engineerName = engineer ? `${engineer.firstName} ${engineer.lastName}` : "the sender";
      const historyEvent: ReportReviewEvent = {
        id: action.stamp.id,
        action: action.decision,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: "project_manager",
        note: comment,
        at: action.stamp.at,
      };
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
                  decisionNote: comment,
                  rejectionNote: action.decision === "rejected" ? comment : item.rejectionNote,
                  reviewHistory: [...(item.reviewHistory ?? []), historyEvent],
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
      const historyEvent: ReportReviewEvent = {
        id: action.stamp.id,
        action: "resubmitted",
        actorId: engineer.id,
        actorName: name,
        actorRole: "site_engineer",
        note: "",
        at: action.stamp.at,
      };
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
                  reviewHistory: [...(item.reviewHistory ?? []), historyEvent],
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
    case "create-boq-batch": {
      const surveyor = activeSurveyor(state, action.surveyorId);
      if (!surveyor) return state;
      if (action.projectId !== surveyor.projectId) return state;
      const inputs = Array.isArray(action.inputs) ? action.inputs : [];
      if (inputs.length === 0) return state;
      const name = `${surveyor.firstName} ${surveyor.lastName}`;
      const items: BoqItem[] = [];
      for (let i = 0; i < inputs.length; i++) {
        const input = parseBoq(inputs[i]);
        if (!input) continue;
        if (input.projectId !== action.projectId) continue;
        items.push({ ...input, id: `${action.stamp.id}-b${i + 1}` });
      }
      if (items.length === 0) return state;
      return measure(
        state,
        action.projectId,
        [...items.reverse(), ...state.boq],
        action.stamp,
        `${items.length} BOQ line${items.length === 1 ? "" : "s"} imported`,
        `${name} imported ${items.length} BOQ line${items.length === 1 ? "" : "s"} from a validated Excel import.`,
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
      const project = managedProject(state, action.projectId, action.stamp.actorId);
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
      const actor = pmActor(state, action.stamp);
      const spent = expenditureFor(boq, project.id);
      let result = audit(
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
      if (project.spent !== spent) {
        result = costChange(result, action.stamp, {
          id: `cc-${action.stamp.id}-spent`,
          projectId: project.id,
          sourceType: "cost_report",
          sourceId: project.id,
          action: "revise-cost-bill",
          field: "project.spent",
          previousValue: project.spent,
          newValue: spent,
          delta: spent - project.spent,
          currency: state.settings.currency,
          note: `${actor.name} revised cost bill quantities`,
        });
      }
      return result;
    }
    case "send-cost-report": {
      const surveyor = activeSurveyor(state, action.surveyorId);
      const project = surveyor?.projectId ? state.projects.find((item) => item.id === surveyor.projectId) : undefined;
      const lines = surveyor?.projectId ? billLines(state.boq, surveyor.projectId) : [];
      if (!surveyor || !project || lines.length === 0) return state;
      const already = (state.costReports ?? []).some(
        (report) =>
          report.projectId === project.id &&
          report.submittedBy === surveyor.id &&
          report.status !== "rejected" &&
          sameBill(report.lines, lines),
      );
      if (already) return state;
      const name = `${surveyor.firstName} ${surveyor.lastName}`;
      const manager = state.users.find((user) => user.id === project.managerId);
      const managerName = manager ? `${manager.firstName} ${manager.lastName}` : "the project manager";
      const report: CostReport = {
        id: action.stamp.id,
        projectId: project.id,
        surveyorId: surveyor.id,
        status: "pending",
        lines,
        submittedAt: action.stamp.at,
        submittedBy: surveyor.id,
        reviewHistory: [
          {
            id: action.stamp.id,
            action: "submitted",
            actorId: surveyor.id,
            actorName: name,
            actorRole: "quantity_surveyor",
            note: "",
            at: action.stamp.at,
          },
        ],
      };
      return audit(
        {
          ...state,
          costReports: [report, ...(state.costReports ?? [])],
          notifications: maybeNotify(state, action.stamp, {
            type: "project",
            title: `${project.code} cost statement sent`,
            message: `${name} sent the cost statement for ${project.name} to ${managerName}. Measured expenditure is ${formatMoney(linesActual(lines))}.`,
            source: "quantity_surveyor",
            senderName: name,
            projectId: project.id,
          }),
        },
        action.stamp,
        "Sent cost statement",
        "Reports",
        project.code,
        "success",
        { id: surveyor.id, name },
      );
    }
    case "open-cost-report-review": {
      const report = (state.costReports ?? []).find((item) => item.id === action.id);
      const project = report ? state.projects.find((item) => item.id === report.projectId) : undefined;
      if (!report || !project || report.status !== "submitted") return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "Administrator" };
      const historyEvent: ReportReviewEvent = {
        id: action.stamp.id,
        action: "in_review",
        actorId: actor.id,
        actorName: actor.name,
        actorRole: (action.stamp.actorRole ?? "administrator") as UserRole,
        note: "",
        at: action.stamp.at,
      };
      return audit(
        {
          ...state,
          costReports: (state.costReports ?? []).map((item) =>
            item.id === report.id
              ? { ...item, status: "in_review", reviewerId: actor.id, reviewHistory: [...(item.reviewHistory ?? []), historyEvent] }
              : item,
          ),
        },
        action.stamp,
        "Opened cost report review",
        "Reports",
        project.code,
        "success",
        actor,
      );
    }
    case "decide-cost-report": {
      const report = (state.costReports ?? []).find((item) => item.id === action.id);
      const project = report ? state.projects.find((item) => item.id === report.projectId) : undefined;
      if (!report || !project || report.status !== "in_review") return state;
      const approved = action.decision === "approved";
      const comment = action.note.trim();
      if (!approved && comment.length < 3) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "Administrator" };
      const historyEvent: ReportReviewEvent = {
        id: action.stamp.id,
        action: action.decision,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: (action.stamp.actorRole ?? "administrator") as UserRole,
        note: comment,
        at: action.stamp.at,
      };
      return audit(
        {
          ...state,
          costReports: (state.costReports ?? []).map((item) =>
            item.id === report.id
              ? {
                  ...item,
                  status: action.decision,
                  reviewedAt: action.stamp.at,
                  reviewerId: actor.id,
                  decisionNote: comment,
                  rejectionNote: approved ? (item.rejectionNote ?? "") : comment,
                  reviewHistory: [...(item.reviewHistory ?? []), historyEvent],
                }
              : item,
          ),
          notifications: maybeNotify(state, action.stamp, {
            type: approved ? "status" : "delay",
            title: `${project.code} cost report ${approved ? "approved" : "rejected"}`,
            message: `${actor.name} ${approved ? "approved" : "rejected"} the cost report for ${project.name}.${comment ? ` Note: ${comment}` : ""}`,
            source: "administrator",
            senderName: actor.name,
            projectId: project.id,
          }),
        },
        action.stamp,
        approved ? "Approved cost report" : "Rejected cost report",
        "Reports",
        project.code,
        approved ? "success" : "warning",
        actor,
      );
    }
    case "delete-cost-report": {
      const id = action.id;
      return {
        ...state,
        costReports: (state.costReports ?? []).filter((report) => report.id !== id),
        notifications: state.notifications.filter((item) => item.id !== `ntf-${id}`),
        activityLogs: state.activityLogs.filter((item) => item.id !== `log-${id}`),
      };
    }
    case "create-variation": {
      const project = state.projects.find((p) => p.id === action.input.projectId);
      if (!project) return state;
      const amount = Number(action.input.amount);
      if (!Number.isFinite(amount) || amount <= 0) return state;
      const title = action.input.title.trim();
      const description = action.input.description.trim();
      const reason = action.input.reason.trim();
      if (title.length < 3 || description.length < 3 || reason.length < 3) return state;
      if (action.input.boqItemId && !state.boq.some((b) => b.id === action.input.boqItemId && b.projectId === project.id)) return state;
      const reference = action.input.reference.trim();
      const currency = (action.input.currency || state.settings.currency || "RWF").trim().toUpperCase();
      const normalizedAmount = Math.round(amount * 100) / 100;
      const duplicateVariation = (state.variations ?? []).some((v) =>
        v.projectId === project.id &&
        !["cancelled", "rejected"].includes(v.status) &&
        (
          (reference !== "" && v.reference.trim().toLowerCase() === reference.toLowerCase()) ||
          (reference === "" && v.title.trim().toLowerCase() === title.toLowerCase() && v.type === action.input.type && v.amount === normalizedAmount && v.currency === currency && (v.boqItemId ?? null) === (action.input.boqItemId ?? null))
        ),
      );
      if (duplicateVariation) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "User" };
      const variation: VariationRecord = {
        id: action.stamp.id,
        projectId: project.id,
        boqItemId: action.input.boqItemId ?? null,
        reference,
        title,
        description,
        reason,
        type: action.input.type,
        amount: normalizedAmount,
        currency,
        status: "draft",
        submittedBy: null,
        submittedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        decisionNote: "",
        rejectionNote: "",
        createdBy: actor.id,
        createdAt: action.stamp.at,
        updatedAt: action.stamp.at,
        reviewHistory: [{ id: action.stamp.id, action: "created", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "quantity_surveyor") as UserRole, note: "", at: action.stamp.at }],
      };
      return audit({ ...state, variations: [variation, ...(state.variations ?? [])] }, action.stamp, "Created variation", "Variations", project.code, "success", actor);
    }
    case "update-variation": {
      const variation = (state.variations ?? []).find((v) => v.id === action.id);
      const project = variation ? state.projects.find((p) => p.id === variation.projectId) : undefined;
      if (!variation || !project) return state;
      if (!["draft", "rejected"].includes(variation.status)) return state;
      if (action.input.projectId !== variation.projectId) return state;
      const amount = Number(action.input.amount);
      if (!Number.isFinite(amount) || amount <= 0) return state;
      const title = action.input.title.trim();
      const description = action.input.description.trim();
      const reason = action.input.reason.trim();
      if (title.length < 3 || description.length < 3 || reason.length < 3) return state;
      if (action.input.boqItemId && !state.boq.some((b) => b.id === action.input.boqItemId && b.projectId === project.id)) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "User" };
      return audit({
        ...state,
        variations: (state.variations ?? []).map((v) => v.id === variation.id ? {
          ...v,
          boqItemId: action.input.boqItemId ?? null,
          reference: action.input.reference.trim(),
          title, description, reason,
          type: action.input.type,
          amount: Math.round(amount * 100) / 100,
          currency: (action.input.currency || v.currency || state.settings.currency || "RWF").trim().toUpperCase(),
          updatedAt: action.stamp.at,
          reviewHistory: [...(v.reviewHistory ?? []), { id: action.stamp.id, action: "updated", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "quantity_surveyor") as UserRole, note: "", at: action.stamp.at }],
        } : v),
      }, action.stamp, "Updated variation", "Variations", project.code, "success", actor);
    }
    case "submit-variation": {
      const variation = (state.variations ?? []).find((v) => v.id === action.id);
      const project = variation ? state.projects.find((p) => p.id === variation.projectId) : undefined;
      if (!variation || !project) return state;
      if (!["draft", "rejected"].includes(variation.status)) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "User" };
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: "submitted", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "quantity_surveyor") as UserRole, note: "", at: action.stamp.at };
      return audit({
        ...state,
        variations: (state.variations ?? []).map((v) => v.id === variation.id ? { ...v, status: "submitted", submittedBy: actor.id, submittedAt: action.stamp.at, updatedAt: action.stamp.at, reviewHistory: [...(v.reviewHistory ?? []), ev] } : v),
      }, action.stamp, "Submitted variation", "Variations", project.code, "success", actor);
    }
    case "open-variation-review": {
      const variation = (state.variations ?? []).find((v) => v.id === action.id);
      const project = variation ? state.projects.find((p) => p.id === variation.projectId) : undefined;
      if (!variation || !project || variation.status !== "submitted") return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "Administrator" };
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: "in_review", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note: "", at: action.stamp.at };
      return audit({
        ...state,
        variations: (state.variations ?? []).map((v) => v.id === variation.id ? { ...v, status: "in_review", updatedAt: action.stamp.at, reviewHistory: [...(v.reviewHistory ?? []), ev] } : v),
      }, action.stamp, "Opened variation review", "Variations", project.code, "warning", actor);
    }
    case "decide-variation": {
      const variation = (state.variations ?? []).find((v) => v.id === action.id);
      const project = variation ? state.projects.find((p) => p.id === variation.projectId) : undefined;
      if (!variation || !project || !["submitted", "in_review"].includes(variation.status)) return state;
      const note = action.note.trim();
      if (action.decision === "rejected" && note.length < 3) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "Administrator" };
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: action.decision, actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note, at: action.stamp.at };
      let result = audit({
        ...state,
        variations: (state.variations ?? []).map((v) => v.id === variation.id ? {
          ...v, status: action.decision, reviewedBy: actor.id, reviewedAt: action.stamp.at, decisionNote: note,
          rejectionNote: action.decision === "rejected" ? note : v.rejectionNote, updatedAt: action.stamp.at, reviewHistory: [...(v.reviewHistory ?? []), ev],
        } : v),
        notifications: maybeNotify(state, action.stamp, { type: action.decision === "approved" ? "status" : "delay", title: `${project.code} variation ${action.decision}`, message: `${actor.name} ${action.decision} variation "${variation.title}".${note ? ` Note: ${note}` : ""}`, source: "administrator", senderName: actor.name, projectId: project.id }),
      }, action.stamp, action.decision === "approved" ? "Approved variation" : "Rejected variation", "Variations", project.code, action.decision === "approved" ? "success" : "warning", actor);
      if (action.decision === "approved") {
        const delta = variation.type === "addition" ? variation.amount : -variation.amount;
        result = costChange(result, action.stamp, {
          id: `cc-${action.stamp.id}-variation`,
          projectId: project.id,
          sourceType: "variation",
          sourceId: variation.id,
          action: "approve-variation",
          field: "approvedVariationAmount",
          previousValue: 0,
          newValue: variation.amount,
          delta,
          currency: variation.currency,
          note: `${variation.reference ? `${variation.reference}: ` : ""}${variation.title}`,
        });
      }
      return result;
    }
    case "cancel-variation": {
      const variation = (state.variations ?? []).find((v) => v.id === action.id);
      const project = variation ? state.projects.find((p) => p.id === variation.projectId) : undefined;
      if (!variation || !project) return state;
      if (["approved", "cancelled"].includes(variation.status)) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "User" };
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: "cancelled", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note: action.note.trim(), at: action.stamp.at };
      return audit({
        ...state,
        variations: (state.variations ?? []).map((v) => v.id === variation.id ? { ...v, status: "cancelled", updatedAt: action.stamp.at, reviewHistory: [...(v.reviewHistory ?? []), ev] } : v),
      }, action.stamp, "Cancelled variation", "Variations", project.code, "warning", actor);
    }
    case "delete-variation": {
      const id = action.id;
      return {
        ...state,
        variations: (state.variations ?? []).filter((v) => v.id !== id),
        notifications: state.notifications.filter((item) => item.id !== `ntf-${id}`),
        activityLogs: state.activityLogs.filter((item) => item.id !== `log-${id}`),
      };
    }
    case "create-expense": {
      const project = state.projects.find((p) => p.id === action.input.projectId);
      if (!project) return state;
      const amount = Number(action.input.amount);
      if (!Number.isFinite(amount) || amount <= 0) return state;
      const desc = action.input.description.trim();
      const vendor = action.input.vendor.trim();
      if (desc.length < 3) return state;
      const currency = (action.input.currency || state.settings.currency || "RWF").trim().toUpperCase();
      const normalizedAmount = Math.round(amount * 100) / 100;
      const duplicateExpense = (state.expenses ?? []).some((e) =>
        e.projectId === project.id &&
        !["cancelled", "rejected"].includes(e.status) &&
        e.category === action.input.category &&
        e.description.trim().toLowerCase() === desc.toLowerCase() &&
        e.amount === normalizedAmount &&
        e.currency === currency &&
        e.vendor.trim().toLowerCase() === vendor.toLowerCase() &&
        e.incurredDate === action.input.incurredDate,
      );
      if (duplicateExpense) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "User" };
      const expense: ExpenseRecord = {
        id: action.stamp.id,
        projectId: project.id,
        category: action.input.category,
        description: desc,
        amount: Math.round(amount * 100) / 100,
        currency: (action.input.currency || state.settings.currency || "RWF").trim().toUpperCase(),
        vendor,
        incurredDate: action.input.incurredDate,
        status: "draft",
        submittedBy: null,
        submittedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        decisionNote: "",
        rejectionNote: "",
        createdBy: actor.id,
        createdAt: action.stamp.at,
        updatedAt: action.stamp.at,
        reviewHistory: [{ id: action.stamp.id, action: "created", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note: "", at: action.stamp.at }],
      };
      return audit({ ...state, expenses: [expense, ...(state.expenses ?? [])] }, action.stamp, "Created expense", "Expenses", project.code, "success", actor);
    }
    case "submit-expense": {
      const expense = (state.expenses ?? []).find((e) => e.id === action.id);
      const project = expense ? state.projects.find((p) => p.id === expense.projectId) : undefined;
      if (!expense || !project) return state;
      if (expense.status !== "draft" && expense.status !== "rejected") return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "User" };
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: "submitted", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "project_manager") as UserRole, note: "", at: action.stamp.at };
      return audit({
        ...state,
        expenses: (state.expenses ?? []).map((e) => e.id === expense.id ? { ...e, status: "submitted", submittedBy: actor.id, submittedAt: action.stamp.at, updatedAt: action.stamp.at, reviewHistory: [...(e.reviewHistory ?? []), ev] } : e),
      }, action.stamp, "Submitted expense", "Expenses", project.code, "success", actor);
    }
    case "decide-expense": {
      const expense = (state.expenses ?? []).find((e) => e.id === action.id);
      const project = expense ? state.projects.find((p) => p.id === expense.projectId) : undefined;
      if (!expense || !project || expense.status !== "submitted") return state;
      const note = action.note.trim();
      if (action.decision === "rejected" && note.length < 3) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "Administrator" };
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: action.decision, actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note, at: action.stamp.at };
      let result = audit({
        ...state,
        expenses: (state.expenses ?? []).map((e) => e.id === expense.id ? {
          ...e, status: action.decision, reviewedBy: actor.id, reviewedAt: action.stamp.at, decisionNote: note,
          rejectionNote: action.decision === "rejected" ? note : e.rejectionNote, updatedAt: action.stamp.at, reviewHistory: [...(e.reviewHistory ?? []), ev],
        } : e),
        notifications: maybeNotify(state, action.stamp, { type: action.decision === "approved" ? "status" : "delay", title: `${project.code} expense ${action.decision}`, message: `${actor.name} ${action.decision} expense "${expense.description}".${note ? ` Note: ${note}` : ""}`, source: "administrator", senderName: actor.name, projectId: project.id }),
      }, action.stamp, action.decision === "approved" ? "Approved expense" : "Rejected expense", "Expenses", project.code, action.decision === "approved" ? "success" : "warning", actor);
      if (action.decision === "approved") {
        result = costChange(result, action.stamp, { id: `cc-${action.stamp.id}-expense`, projectId: project.id, sourceType: "expense", sourceId: expense.id, action: "approve-expense", field: "approvedExpenseAmount", previousValue: 0, newValue: expense.amount, delta: expense.amount, currency: expense.currency, note: expense.description });
      }
      return result;
    }
    case "cancel-expense": {
      const expense = (state.expenses ?? []).find((e) => e.id === action.id);
      const project = expense ? state.projects.find((p) => p.id === expense.projectId) : undefined;
      if (!expense || !project) return state;
      if (["cancelled"].includes(expense.status)) return state;
      // do not cancel if there are paid/reversed payments? allow cancel only when no active payments
      const hasActivePayments = (state.payments ?? []).some((p) => p.expenseId === expense.id && ["pending", "approved", "paid"].includes(p.status));
      if (hasActivePayments) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "User" };
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: "cancelled", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note: action.note.trim(), at: action.stamp.at };
      return audit({
        ...state,
        expenses: (state.expenses ?? []).map((e) => e.id === expense.id ? { ...e, status: "cancelled", updatedAt: action.stamp.at, reviewHistory: [...(e.reviewHistory ?? []), ev] } : e),
      }, action.stamp, "Cancelled expense", "Expenses", project.code, "warning", actor);
    }
    case "create-payment": {
      const expense = (state.expenses ?? []).find((e) => e.id === action.input.expenseId);
      const project = expense ? state.projects.find((p) => p.id === expense.projectId) : undefined;
      if (!expense || !project) return state;
      if (expense.projectId !== action.input.projectId) return state;
      if (expense.status !== "approved") return state;
      const amount = Number(action.input.amount);
      if (!Number.isFinite(amount) || amount <= 0) return state;
      const currency = (action.input.currency || expense.currency || state.settings.currency || "RWF").trim().toUpperCase();
      if (currency !== expense.currency) return state;
      const reference = action.input.reference.trim();
      const scheduledFor = action.input.scheduledFor ?? null;
      const duplicatePayment = (state.payments ?? []).some((p) =>
        p.expenseId === expense.id &&
        ["pending", "approved", "paid"].includes(p.status) &&
        (
          (reference !== "" && p.reference.trim().toLowerCase() === reference.toLowerCase()) ||
          (reference === "" && p.reference.trim() === "" && p.amount === Math.round(amount * 100) / 100 && p.currency === currency && p.method === action.input.method && (p.scheduledFor ?? null) === scheduledFor)
        ),
      );
      if (duplicatePayment) return state;
      const activePaid = (state.payments ?? [])
        .filter((p) => p.expenseId === expense.id && ["pending", "approved", "paid"].includes(p.status))
        .reduce((sum, p) => sum + p.amount, 0);
      if (Math.round((activePaid + amount) * 100) > Math.round(expense.amount * 100)) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "User" };
      const payment: PaymentRecord = {
        id: action.stamp.id,
        projectId: project.id,
        expenseId: expense.id,
        amount: Math.round(amount * 100) / 100,
        currency,
        method: action.input.method,
        reference,
        status: "pending",
        scheduledFor,
        paidAt: null,
        recordedBy: actor.id,
        recordedAt: action.stamp.at,
        reviewedBy: null,
        reviewedAt: null,
        decisionNote: "",
        failureNote: "",
        createdAt: action.stamp.at,
        updatedAt: action.stamp.at,
        reviewHistory: [{ id: action.stamp.id, action: "created", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note: "", at: action.stamp.at }],
      };
      return audit({ ...state, payments: [payment, ...(state.payments ?? [])] }, action.stamp, "Recorded payment", "Payments", project.code, "success", actor);
    }
    case "approve-payment": {
      const payment = (state.payments ?? []).find((p) => p.id === action.id);
      const project = payment ? state.projects.find((p) => p.id === payment.projectId) : undefined;
      if (!payment || !project || payment.status !== "pending") return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "Administrator" };
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: "approved", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note: action.note.trim(), at: action.stamp.at };
      return audit({
        ...state,
        payments: (state.payments ?? []).map((p) => p.id === payment.id ? { ...p, status: "approved", reviewedBy: actor.id, reviewedAt: action.stamp.at, decisionNote: action.note.trim(), updatedAt: action.stamp.at, reviewHistory: [...(p.reviewHistory ?? []), ev] } : p),
      }, action.stamp, "Approved payment", "Payments", project.code, "success", actor);
    }
    case "mark-payment-paid": {
      const payment = (state.payments ?? []).find((p) => p.id === action.id);
      const project = payment ? state.projects.find((p) => p.id === payment.projectId) : undefined;
      if (!payment || !project || payment.status !== "approved") return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "Administrator" };
      const paidAt = action.paidAt || action.stamp.at;
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: "paid", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note: action.note.trim(), at: action.stamp.at };
      let result = audit({
        ...state,
        payments: (state.payments ?? []).map((p) => p.id === payment.id ? { ...p, status: "paid", paidAt, updatedAt: action.stamp.at, reviewHistory: [...(p.reviewHistory ?? []), ev] } : p),
      }, action.stamp, "Marked payment paid", "Payments", project.code, "success", actor);
      result = costChange(result, action.stamp, { id: `cc-${action.stamp.id}-payment`, projectId: project.id, sourceType: "payment", sourceId: payment.id, action: "mark-payment-paid", field: "paidAmount", previousValue: 0, newValue: payment.amount, delta: payment.amount, currency: payment.currency, note: payment.reference ? `Payment ${payment.reference}` : "Payment marked paid" });
      return result;
    }
    case "fail-payment": {
      const payment = (state.payments ?? []).find((p) => p.id === action.id);
      const project = payment ? state.projects.find((p) => p.id === payment.projectId) : undefined;
      if (!payment || !project || !["pending", "approved"].includes(payment.status)) return state;
      const note = action.note.trim();
      if (note.length < 3) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "Administrator" };
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: "failed", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note, at: action.stamp.at };
      return audit({
        ...state,
        payments: (state.payments ?? []).map((p) => p.id === payment.id ? { ...p, status: "failed", failureNote: note, updatedAt: action.stamp.at, reviewHistory: [...(p.reviewHistory ?? []), ev] } : p),
      }, action.stamp, "Marked payment failed", "Payments", project.code, "warning", actor);
    }
    case "cancel-payment": {
      const payment = (state.payments ?? []).find((p) => p.id === action.id);
      const project = payment ? state.projects.find((p) => p.id === payment.projectId) : undefined;
      if (!payment || !project || !["pending", "approved", "failed"].includes(payment.status)) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "User" };
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: "cancelled", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note: action.note.trim(), at: action.stamp.at };
      return audit({
        ...state,
        payments: (state.payments ?? []).map((p) => p.id === payment.id ? { ...p, status: "cancelled", updatedAt: action.stamp.at, reviewHistory: [...(p.reviewHistory ?? []), ev] } : p),
      }, action.stamp, "Cancelled payment", "Payments", project.code, "warning", actor);
    }
    case "reverse-payment": {
      const payment = (state.payments ?? []).find((p) => p.id === action.id);
      const project = payment ? state.projects.find((p) => p.id === payment.projectId) : undefined;
      if (!payment || !project || payment.status !== "paid") return state;
      const note = action.note.trim();
      if (note.length < 3) return state;
      const actor = { id: action.stamp.actorId ?? "system", name: action.stamp.actorName ?? "Administrator" };
      const ev: FinancialReviewEvent = { id: action.stamp.id, action: "reversed", actorId: actor.id, actorName: actor.name, actorRole: (action.stamp.actorRole ?? "administrator") as UserRole, note, at: action.stamp.at };
      let result = audit({
        ...state,
        payments: (state.payments ?? []).map((p) => p.id === payment.id ? { ...p, status: "reversed", updatedAt: action.stamp.at, reviewHistory: [...(p.reviewHistory ?? []), ev] } : p),
      }, action.stamp, "Reversed payment", "Payments", project.code, "warning", actor);
      result = costChange(result, action.stamp, { id: `cc-${action.stamp.id}-payment-reversal`, projectId: project.id, sourceType: "payment", sourceId: payment.id, action: "reverse-payment", field: "paidAmount", previousValue: payment.amount, newValue: 0, delta: -payment.amount, currency: payment.currency, note });
      return result;
    }
    case "submit-cost-report": {
      const project = managedProject(state, action.projectId, action.stamp.actorId);
      const surveyor = state.users.find((user) => user.id === action.surveyorId && user.role === "quantity_surveyor" && user.status === "active" && user.projectId === action.projectId);
      const lines = billLines(state.boq, action.projectId);
      if (!project || !surveyor || lines.length === 0) return state;
      const already = (state.costReports ?? []).some(
        (report) =>
          report.projectId === project.id &&
          ["submitted", "in_review", "approved"].includes(report.status) &&
          sameBill(report.lines, lines),
      );
      if (already) return state; // duplicate submission protection
      const actor = pmActor(state, action.stamp);
      const historyEvent: ReportReviewEvent = {
        id: action.stamp.id,
        action: "submitted",
        actorId: actor.id,
        actorName: actor.name,
        actorRole: "project_manager",
        note: "",
        at: action.stamp.at,
      };
      const report: CostReport = {
        id: action.stamp.id,
        projectId: project.id,
        surveyorId: surveyor.id,
        status: "submitted",
        lines,
        submittedAt: action.stamp.at,
        submittedBy: actor.id,
        reviewHistory: [historyEvent],
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
                  revisions: item.revisions.map((revision) => {
                    if (revision.id === latest.id) return { ...revision, status: "approved" as const };
                    if (revision.status === "approved") return { ...revision, status: "superseded" as const };
                    return revision;
                  }),
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
    case "add-work-comment": {
      const body = action.body.trim();
      if (body.length < 3 || body.length > 500 || !action.workId) return state;
      return audit(
        {
          ...state,
          workComments: [
            {
              id: action.stamp.id,
              kind: action.kind,
              workId: action.workId,
              projectId: action.projectId,
              body,
              createdAt: action.stamp.at,
            },
            ...(state.workComments ?? []),
          ],
        },
        action.stamp,
        "Commented on portal work",
        "Notifications",
        action.workId,
        "success",
      );
    }
    case "delete-work-comment":
      return {
        ...state,
        workComments: (state.workComments ?? []).filter((item) => item.id !== action.id),
        activityLogs: state.activityLogs.filter((item) => item.id !== `log-${action.id}`),
      };
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
    case "vertexa-inquiry": {
      const title = `New project inquiry — ${action.serviceName}`;
      const shared = {
        type: "system" as const,
        title,
        message: action.message,
        senderName: action.clientName,
        projectId: null,
        read: false,
        createdAt: action.stamp.at,
      };
      const noteId = action.stamp.notificationId ?? `ntf-${action.stamp.id}`;
      return audit(
        {
          ...state,
          notifications: [
            {
              ...shared,
              id: `${noteId}-admin`,
              source: "administrator",
            },
            ...(action.recipientId
              ? [{
                  ...shared,
                  id: `${noteId}-pm`,
                  source: "administrator" as const,
                  recipientId: action.recipientId,
                }]
              : []),
            ...state.notifications,
          ],
        },
        action.stamp,
        "Received a Vertexa project inquiry",
        "Vertexa",
        action.serviceName,
        "success",
        { id: "vertexa-public", name: action.clientName },
      );
    }
    case "delete-support-note":
      return {
        ...state,
        notifications: state.notifications.filter((item) => item.id !== `ntf-${action.id}`),
        activityLogs: state.activityLogs.filter((item) => item.id !== `log-${action.id}`),
      };
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

function isValidEngineerAssignee(state: AdminState, projectId: string, assignee: string) {
  const name = assignee.trim();
  if (!name || name.toLowerCase() === "unassigned") return true; // allow unassigned
  return state.users.some(
    (user) =>
      user.role === "site_engineer" &&
      user.status === "active" &&
      user.projectId === projectId &&
      `${user.firstName} ${user.lastName}`.trim().toLowerCase() === name.toLowerCase(),
  );
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
  let result = audit(
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
  if (project && project.spent !== spent) {
    result = costChange(result, stamp, {
      id: `cc-${stamp.id}-spent`,
      projectId,
      sourceType: "boq",
      sourceId: projectId,
      action: "measure-boq",
      field: "project.spent",
      previousValue: project.spent,
      newValue: spent,
      delta: spent - project.spent,
      currency: state.settings.currency,
      note: message,
    });
  }
  return result;
}

function managedProject(state: AdminState, projectId: string, managerId?: string) {
  if (!managerId) return undefined;
  const actor = state.users.find((user) => user.id === managerId);
  const project = state.projects.find((item) => item.id === projectId);
  if (!project || !actor) return undefined;
  if (actor.role === "administrator") return project;
  if (actor.role === "project_manager") return project.managerId === managerId ? project : undefined;
  if (actor.role === "site_engineer" || actor.role === "quantity_surveyor") {
    return actor.projectId === projectId ? project : undefined;
  }
  return undefined;
}

function withAdmin(access: ProjectDocument["access"]): ProjectDocument["access"] {
  return access.includes("administrator") ? access : ["administrator", ...access];
}

function nextRevision(document: ProjectDocument) {
  const latest = document.revisions[document.revisions.length - 1];
  const current = latest ? Number(latest.revision) : 0;
  return String((Number.isFinite(current) ? current : document.revisions.length) + 1).padStart(2, "0");
}

function actorFromStamp(state: AdminState, stamp: Stamp) {
  if (stamp.actorId) {
    const user = state.users.find((item) => item.id === stamp.actorId);
    return {
      id: stamp.actorId,
      name: stamp.actorName ?? (user ? `${user.firstName} ${user.lastName}` : "User"),
      role: stamp.actorRole ?? user?.role,
    };
  }
  return { id: "unknown", name: stamp.actorName ?? "Unknown user", role: undefined as UserRole | undefined };
}

function pmActor(state: AdminState, stamp?: Stamp) {
  const actor = stamp ? actorFromStamp(state, stamp) : null;
  if (actor && actor.role === "project_manager") return { id: actor.id, name: actor.name };
  if (stamp?.actorId) {
    const user = state.users.find((item) => item.id === stamp.actorId);
    return { id: stamp.actorId, name: user ? `${user.firstName} ${user.lastName}` : stamp.actorName ?? "User" };
  }
  return { id: "unknown", name: stamp?.actorName ?? "Unassigned" };
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
  const resolved = actor ?? (stamp.actorId ? { id: stamp.actorId, name: stamp.actorName ?? state.settings.profileName } : undefined);
  const entry: ActivityLog = {
    id: stamp.id.startsWith("log") ? stamp.id : `log-${stamp.id}`,
    userId: resolved?.id ?? "unknown",
    userName: resolved?.name ?? state.settings.profileName,
    action,
    module,
    record,
    timestamp: stamp.at,
    status,
  };
  return { ...state, activityLogs: [entry, ...state.activityLogs] };
}

function costChange(
  state: AdminState,
  stamp: Stamp,
  entry: Omit<CostChangeRecord, "id" | "actorId" | "actorName" | "actorRole" | "createdAt"> & { id?: string },
): AdminState {
  const actor = actorFromStamp(state, stamp);
  const record: CostChangeRecord = {
    id: entry.id ?? `cc-${stamp.id}-${(state.costChanges ?? []).length + 1}`,
    projectId: entry.projectId,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    action: entry.action,
    field: entry.field,
    previousValue: entry.previousValue,
    newValue: entry.newValue,
    delta: entry.delta,
    currency: entry.currency,
    note: entry.note,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: (actor.role ?? stamp.actorRole ?? "administrator") as UserRole,
    createdAt: stamp.at,
  };
  return { ...state, costChanges: [record, ...(state.costChanges ?? [])] };
}

function receipt(state: AdminState, stamp: Stamp, projectId: string, title: string, message: string): AppNotification {
  const actor = actorFromStamp(state, stamp);
  const project = state.projects.find((item) => item.id === projectId);
  const recipientId = actor.role === "project_manager" ? actor.id : project?.managerId ?? null;
  return {
    id: `${stamp.notificationId ?? `ntf-${stamp.id}`}-ack`,
    type: "project",
    title,
    message,
    source: "administrator",
    senderName: state.settings.profileName,
    projectId,
    recipientId,
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
