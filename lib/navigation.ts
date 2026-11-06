import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  Settings,
  Users,
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

export function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function crumbsFor(pathname: string) {
  const item = navItems.find((entry) => isActive(pathname, entry));
  return [
    { href: "/admin", label: "CPMIS" },
    { href: item?.href ?? pathname, label: item?.label ?? "Page" },
  ];
}
