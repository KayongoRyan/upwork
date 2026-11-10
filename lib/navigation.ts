import {
  BarChart3,
  Bell,
  Building2,
  Camera,
  ClipboardCheck,
  ChartGantt,
  ClipboardList,
  FileBarChart,
  Files,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  Ruler,
  ScrollText,
  Settings,
  Users,
  Wallet,
  HardHat,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  section: "Main" | "Management" | "System";
  exact?: boolean;
  description: string;
}

export const navItems: NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
    section: "Main",
    exact: true,
    description: "Portfolio health, workforce, and items that need a decision.",
  },
  {
    href: "/admin/projects",
    label: "Projects",
    icon: Building2,
    section: "Main",
    description: "Create, update, and track construction projects.",
  },
  {
    href: "/admin/documents",
    label: "Documents",
    icon: Files,
    section: "Main",
    description: "Drawings, contracts, and revisions. Issued files are the ones to build from.",
  },
  {
    href: "/admin/users",
    label: "User Management",
    icon: Users,
    section: "Main",
    description: "Application accounts and role assignments.",
  },
  {
    href: "/admin/employees",
    label: "Employees",
    icon: HardHat,
    section: "Main",
    description: "Company workforce records, separate from login accounts.",
  },
  {
    href: "/admin/reports",
    label: "Reports & Analytics",
    icon: BarChart3,
    section: "Main",
    description: "Performance, budget, and workforce summaries.",
  },
  {
    href: "/admin/overview",
    label: "Project Overview",
    icon: FolderKanban,
    section: "Management",
    description: "Portfolio cards with progress and budget use.",
  },
  {
    href: "/admin/tasks",
    label: "Tasks & Activities",
    icon: ClipboardList,
    section: "Management",
    description: "Work packages across active projects.",
  },
  {
    href: "/admin/activity-logs",
    label: "System Activity Logs",
    icon: ScrollText,
    section: "Management",
    description: "Who changed what, and when.",
  },
  {
    href: "/admin/notifications",
    label: "Notifications",
    icon: Bell,
    section: "System",
    description: "Alerts for projects, accounts, and delays.",
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
    section: "System",
    description: "Organization profile and preview preferences.",
  },
  {
    href: "/admin/help",
    label: "Help & Support",
    icon: LifeBuoy,
    section: "System",
    description: "How this preview works, and a local support note.",
  },
];

export const navSections = ["Main", "Management", "System"] as const;

export const pmNavItems: NavItem[] = [
  {
    href: "/pm",
    label: "Dashboard",
    icon: LayoutDashboard,
    section: "Main",
    exact: true,
    description: "Portfolio position for the projects you manage.",
  },
  {
    href: "/pm/projects",
    label: "My projects",
    icon: Building2,
    section: "Main",
    description: "Monitor status, dates, and budget use.",
  },
  {
    href: "/pm/schedule",
    label: "Schedule",
    icon: ChartGantt,
    section: "Management",
    description: "Gantt programme: phases, dependencies, float, and the critical path.",
  },
  {
    href: "/pm/tasks",
    label: "Tasks",
    icon: ClipboardList,
    section: "Management",
    description: "Assign work and set due dates.",
  },
  {
    href: "/pm/people",
    label: "Team review",
    icon: Users,
    section: "Management",
    description: "Review site engineers and quantity surveyors, with their tasks and reports.",
  },
  {
    href: "/pm/progress",
    label: "Progress",
    icon: BarChart3,
    section: "Management",
    description: "Record progress against each project.",
  },
  {
    href: "/pm/reports",
    label: "Engineer reports",
    icon: ClipboardCheck,
    section: "Management",
    description: "Review site reports: submit, then approve or reject.",
  },
  {
    href: "/pm/costs",
    label: "Cost reports",
    icon: FileBarChart,
    section: "Management",
    description: "Statements the surveyor sends you. You submit the cost report.",
  },
  {
    href: "/pm/notifications",
    label: "Inbox",
    icon: Bell,
    section: "System",
    description: "Notices sent in from the other portals.",
  },
];

export const seNavItems: NavItem[] = [
  {
    href: "/se",
    label: "Dashboard",
    icon: LayoutDashboard,
    section: "Main",
    exact: true,
    description: "Today on your assigned site.",
  },
  {
    href: "/se/report",
    label: "Daily report",
    icon: Camera,
    section: "Main",
    description: "File the shift, with photos.",
  },
  {
    href: "/se/tasks",
    label: "Assigned tasks",
    icon: ClipboardList,
    section: "Management",
    description: "Update progress on work assigned to you.",
  },
  {
    href: "/se/history",
    label: "Report history",
    icon: ClipboardCheck,
    section: "Management",
    description: "Past reports, rejection notes, and resubmission.",
  },
];

export const qsNavItems: NavItem[] = [
  {
    href: "/qs",
    label: "Dashboard",
    icon: LayoutDashboard,
    section: "Main",
    exact: true,
    description: "Budget, measured expenditure, and variance on your project.",
  },
  {
    href: "/qs/boq",
    label: "Bill of quantities",
    icon: Ruler,
    section: "Main",
    description: "Estimated quantities, measured quantities, and unit rates.",
  },
  {
    href: "/qs/expenditure",
    label: "Expenditure",
    icon: Wallet,
    section: "Management",
    description: "Project spend, budget use, and cost variance.",
  },
  {
    href: "/qs/reports",
    label: "Financial report",
    icon: FileBarChart,
    section: "Management",
    description: "Cost statement for the assigned project. Send it to the project manager.",
  },
  {
    href: "/qs/notices",
    label: "Notices",
    icon: Bell,
    section: "System",
    description: "Measurement notices on your project.",
  },
];

export function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function crumbsFor(pathname: string, items: NavItem[] = navItems, root = { href: "/admin", label: "CPMIS" }) {
  const item = items.find((entry) => isActive(pathname, entry));
  return [
    root,
    { href: item?.href ?? pathname, label: item?.label ?? "Page" },
  ];
}
