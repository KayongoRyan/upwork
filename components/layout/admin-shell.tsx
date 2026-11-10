"use client";

import { useState } from "react";
import { Toaster } from "sonner";
import { useAdmin } from "@/lib/data/admin-store";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Frame>{children}</Frame>
      <Toaster position="top-right" closeButton />
    </>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { settings } = useAdmin();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="shell min-h-screen bg-background">
      <label htmlFor="nav-mobile" aria-label="Close navigation" className="nav-scrim fixed inset-0 z-40 bg-black/40" />
      <Sidebar
        collapsed={collapsed}
        profileName={settings.profileName}
        profileTitle={settings.profileTitle}
        onNavigate={() => undefined}
      />
      <div className={cn("shell-main min-h-screen transition-[padding] duration-200", collapsed ? "lg:pl-[108px]" : "lg:pl-[276px]", settings.compactTables && "compact-tables")}>
        <Header collapsed={collapsed} onToggleCollapse={() => setCollapsed((value) => !value)} />
        <main className="px-3 pt-2 pb-6 sm:px-5 lg:px-6">
          {children}
          <p className="mt-8 text-xs text-muted-foreground">
            Demonstration workspace for Vertexa Group. People, budgets, and activity are sample records, not a live company.
          </p>
        </main>
      </div>
    </div>
  );
}
