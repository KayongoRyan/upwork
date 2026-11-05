"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { isActive, navItems, navSections } from "@/lib/navigation";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function Sidebar({
  collapsed,
  mobileOpen,
  profileName,
  profileTitle,
  onNavigate,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  profileName: string;
  profileTitle: string;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const width = collapsed ? 80 : 264;

  return (
    <motion.aside
      initial={false}
      animate={{ width }}
      transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }}
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        "transition-transform duration-200 lg:transition-none",
      )}
    >
      <div className={cn("flex h-16 items-center gap-3 border-b border-white/10 px-4", collapsed && "justify-center px-2")}>
        <Logo />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-wide">CPMIS</p>
            <p className="truncate text-xs text-sidebar-muted">Administrator</p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Administrator">
        {navSections.map((section) => (
          <div key={section}>
            {!collapsed ? (
              <p className="mb-2 px-2 text-[11px] font-semibold tracking-[0.14em] text-sidebar-muted uppercase">{section}</p>
            ) : (
              <div className="mx-auto mb-2 h-px w-8 bg-white/10" />
            )}
            <ul className="space-y-1">
              {navItems
                .filter((item) => item.section === section)
                .map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        onClick={onNavigate}
                        className={cn(
                          "relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                          active ? "bg-white/10 text-white" : "text-sidebar-muted hover:bg-white/5 hover:text-white",
                          collapsed && "justify-center px-0",
                        )}
                      >
                        {active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-accent" /> : null}
                        <Icon className="size-4 shrink-0" />
                        {!collapsed ? <span className="truncate">{item.label}</span> : null}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>

      <Link
        href="/admin/settings"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 border-t border-white/10 px-4 py-4 hover:bg-white/5",
          collapsed && "justify-center px-2",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initials(profileName)}
        </span>
        {!collapsed ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{profileName}</span>
            <span className="block truncate text-xs text-sidebar-muted">{profileTitle}</span>
          </span>
        ) : null}
      </Link>
    </motion.aside>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-9 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#e08a12" />
      <path d="M7 23.5V14.2L16 8l9 6.2v9.3" fill="none" stroke="#0c2340" strokeWidth="1.8" />
      <path d="M13 23.5v-6h6v6" fill="none" stroke="#0c2340" strokeWidth="1.8" />
    </svg>
  );
}
