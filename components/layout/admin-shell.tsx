"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Toaster } from "sonner";
import { AdminProvider, useAdmin } from "@/lib/data/admin-store";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <Frame>{children}</Frame>
      <Toaster position="top-right" closeButton />
    </AdminProvider>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { settings } = useAdmin();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence>
        {mobileOpen ? (
          <motion.button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-[#0c2340]/50 lg:hidden"
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
        profileName={settings.profileName}
        profileTitle={settings.profileTitle}
        onNavigate={() => setMobileOpen(false)}
      />
      <div className={cn("min-h-screen transition-[padding] duration-200", collapsed ? "lg:pl-20" : "lg:pl-[264px]", settings.compactTables && "compact-tables")}>
        <Header collapsed={collapsed} onToggleCollapse={() => setCollapsed((value) => !value)} onOpenMobile={() => setMobileOpen(true)} />
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          {children}
          <p className="mt-8 text-xs text-muted-foreground">
            Demonstration workspace for Harbours & Highlands Construction. People, budgets, and activity are sample records, not a live company.
          </p>
        </main>
      </div>
    </div>
  );
}
