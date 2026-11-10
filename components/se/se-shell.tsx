"use client";

import { useState } from "react";
import { Toaster } from "sonner";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { useSiteEngineer } from "@/lib/data/admin-store";
import { seNavItems } from "@/lib/navigation";
import { portalUrl } from "@/lib/portals";
import { cn, fullName } from "@/lib/utils";

export function SeShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Frame>{children}</Frame>
      <Toaster position="top-right" closeButton />
    </>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const data = useSiteEngineer();
  const [collapsed, setCollapsed] = useState(false);
  const name = data.actor ? fullName(data.actor) : "Site engineer";
  const code = data.project?.code ?? "";

  return (
    <div className="shell min-h-screen bg-background">
      <label htmlFor="nav-mobile" aria-label="Close navigation" className="nav-scrim fixed inset-0 z-40 bg-black/40" />
      <Sidebar
        collapsed={collapsed}
        profileName={name}
        profileTitle={code ? `${code} · Site engineer` : "Site engineer"}
        portalLabel="Site engineer"
        profileHref="/se"
        items={seNavItems}
        onNavigate={() => undefined}
      />
      <div className={cn("shell-main min-h-screen transition-[padding] duration-200", collapsed ? "lg:pl-[108px]" : "lg:pl-[276px]")}>
        <Header
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          scope="site"
          siteCode={code}
          identity={{ name, email: data.actor?.email ?? "", role: "Site engineer" }}
          links={{
            notifications: "/se/history",
            settings: portalUrl("administrator", "/admin/settings"),
            switchHref: portalUrl("project_manager"),
            switchLabel: "Project manager portal",
          }}
          crumbs={{ items: seNavItems, root: { href: "/se", label: "CPMIS" } }}
          search={{ pages: seNavItems, projectIds: data.project ? [data.project.id] : [] }}
        />
        <main className="px-3 pt-2 pb-6 sm:px-5 lg:px-6">
          {children}
          <p className="mt-8 text-xs text-muted-foreground">
            Site engineer preview for {name}. Only {code || "the assigned project"} is visible. Reports and task updates use the same demonstration records as the other portals.
          </p>
        </main>
      </div>
    </div>
  );
}
