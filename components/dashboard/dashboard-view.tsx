"use client";

import { Building2, CheckCircle2, Clock3, HardHat, Ruler, TimerReset, Users, UserRound } from "lucide-react";
import { AttentionProjects } from "@/components/dashboard/attention-projects";
import { MonthlyActivityChart } from "@/components/dashboard/monthly-activity-chart";
import { ProjectProgressChart } from "@/components/dashboard/project-progress-chart";
import { ProjectStatusChart } from "@/components/dashboard/project-status-chart";
import { RecentActivities } from "@/components/dashboard/recent-activities";
import { StatCard } from "@/components/dashboard/stat-card";
import { WorkforceChart } from "@/components/dashboard/workforce-chart";
import { PageHeader } from "@/components/shared/page-header";
import { useAdmin } from "@/lib/data/admin-store";
import { countEmployees, countProjects, countRoles, previousMonthSnapshot } from "@/lib/metrics";
import { signed } from "@/lib/utils";

export function DashboardView() {
  const data = useAdmin();
  const projects = countProjects(data.projects);
  const roles = countRoles(data.users);
  const employees = countEmployees(data.employees);
  const previous = previousMonthSnapshot;

  const cards = [
    card("Total projects", projects.total, previous.projects, "/admin/projects", Building2, true),
    card("Active projects", projects.active, previous.active, "/admin/projects", TimerReset, true),
    card("Completed projects", projects.completed, previous.completed, "/admin/projects", CheckCircle2, true),
    card("Delayed projects", projects.delayed, previous.delayed, "/admin/overview", Clock3, false),
    card("Total employees", employees.total, previous.employees, "/admin/employees", HardHat, true),
    card("Registered engineers", roles.site_engineer, previous.engineers, "/admin/users", UserRound, true),
    card("Project managers", roles.project_manager, previous.managers, "/admin/users", Users, true),
    card("Quantity surveyors", roles.quantity_surveyor, previous.surveyors, "/admin/users", Ruler, true),
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Portfolio position for the demonstration company. Counts update when you add or edit records in this session."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item, index) => (
          <StatCard key={item.label} index={index} {...item} />
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ProjectStatusChart projects={data.projects} />
        <WorkforceChart users={data.users} />
        <ProjectProgressChart projects={data.projects} />
        <MonthlyActivityChart series={data.monthlyActivity} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <RecentActivities logs={data.activityLogs} />
        </div>
        <div className="xl:col-span-2">
          <AttentionProjects projects={data.projects} managerName={data.managerName} />
        </div>
      </div>
    </div>
  );
}

function card(label: string, value: number, previous: number, href: string, icon: typeof Building2, upIsGood: boolean) {
  const delta = value - previous;
  const tone = delta === 0 ? "flat" : delta > 0 === upIsGood ? "up" : "down";
  return {
    label,
    value,
    href,
    icon,
    trend: { text: `${signed(delta)} vs last month (demo)`, tone } as const,
  };
}
