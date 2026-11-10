"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Toaster } from "sonner";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { useQuantitySurveyor } from "@/lib/data/admin-store";
import { qsNavItems } from "@/lib/navigation";
import { portalUrl } from "@/lib/portals";
import { cn, fullName } from "@/lib/utils";

export function QsShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Frame>{children}</Frame>
      <Toaster position="top-right" closeButton />
    </>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const data = useQuantitySurveyor();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduce = useReducedMotion();
  const name = data.actor ? fullName(data.actor) : "Quantity surveyor";
  const code = data.project?.code ?? "";

  return (
    <div className="shell min-h-screen bg-background">
      <AnimatePresence>
        {mobileOpen ? (
          <motion.button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          />
        ) : null}
      </AnimatePresence>
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        profileName={name}
        profileTitle={code ? `${code} · Quantity surveyor` : "Quantity surveyor"}
        portalLabel="Quantity surveyor"
        profileHref="/qs"
        items={qsNavItems}
        onNavigate={() => setMobileOpen(false)}
      />
      <div className={cn("shell-main min-h-screen transition-[padding] duration-200", collapsed ? "lg:pl-[108px]" : "lg:pl-[276px]")}>
        <Header
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          onOpenMobile={() => setMobileOpen(true)}
          scope="field"
          portfolio={data.project ? [data.project] : []}
          identity={{ name, email: data.actor?.email ?? "", role: "Quantity surveyor" }}
          links={{
            notifications: "/qs/notices",
            settings: portalUrl("administrator", "/admin/settings"),
            switchHref: portalUrl("project_manager"),
            switchLabel: "Project manager portal",
          }}
          crumbs={{ items: qsNavItems, root: { href: "/qs", label: "CPMIS" } }}
          search={{ pages: qsNavItems, projectIds: data.project ? [data.project.id] : [] }}
        />
        <main className="px-3 pt-2 pb-6 sm:px-5 lg:px-6">
          {children}
          <p className="mt-8 text-xs text-muted-foreground">
            Quantity surveyor preview for {name}. Only {code || "the assigned project"} is on this account. Line amounts are quantity times the unit rate, rounded to the franc, and that total is the project expenditure.
          </p>
        </main>
      </div>
    </div>
  );
}
