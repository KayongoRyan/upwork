"use client";

import { useState } from "react";
import { Toaster } from "sonner";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { usePm } from "@/lib/data/admin-store";
import { pmNavItems } from "@/lib/navigation";
import { portalUrl } from "@/lib/portals";
import { cn, fullName } from "@/lib/utils";

export function PmShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Frame>{children}</Frame>
      <Toaster position="top-right" closeButton />
    </>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { actor, projects } = usePm();
  const [collapsed, setCollapsed] = useState(false);
  const name = actor ? fullName(actor) : "Project manager";

  return (
    <div className="shell min-h-screen bg-background">
      <label htmlFor="nav-mobile" aria-label="Close navigation" className="nav-scrim fixed inset-0 z-40 bg-black/40" />
      <Sidebar
        collapsed={collapsed}
        profileName={name}
        profileTitle="Project manager"
        portalLabel="Project manager"
        profileHref="/pm"
        items={pmNavItems}
        onNavigate={() => undefined}
      />
      <div className={cn("shell-main min-h-screen transition-[padding] duration-200", collapsed ? "lg:pl-[108px]" : "lg:pl-[276px]")}>
        <Header
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          scope="field"
          userId={actor?.id}
          portfolio={projects}
          identity={{ name, email: actor?.email ?? "", role: "Project manager" }}
          links={{
            notifications: "/pm/notifications",
            settings: portalUrl("administrator", "/admin/settings"),
            switchHref: portalUrl("administrator"),
            switchLabel: "Administrator portal",
          }}
          crumbs={{ items: pmNavItems, root: { href: "/pm", label: "CPMIS" } }}
          search={{ pages: pmNavItems, projectIds: projects.map((project) => project.id), projectBase: "/pm/projects" }}
        />
        <main className="px-3 pt-2 pb-6 sm:px-5 lg:px-6">
          {children}
          <p className="mt-8 text-xs text-muted-foreground">
            Project manager preview for {name}. Projects, tasks, and engineer reports are the same demonstration records as the administrator portal.
          </p>
        </main>
      </div>
    </div>
  );
}
