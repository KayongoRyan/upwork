"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, navItems, navSections, type NavItem } from "@/lib/navigation";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function Sidebar({
  collapsed,
  mobileOpen,
  profileName,
  profileTitle,
  onNavigate,
  items = navItems,
  portalLabel = "Administrator",
  profileHref = "/admin/settings",
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  profileName: string;
  profileTitle: string;
  onNavigate: () => void;
  items?: NavItem[];
  portalLabel?: string;
  profileHref?: string;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden bg-white text-black shadow-[0_12px_40px_rgba(0,0,0,0.05)]",
        "top-3 bottom-3 left-3 rounded-[28px] border border-black/5",
        "max-lg:top-0 max-lg:bottom-0 max-lg:left-0 max-lg:!w-[248px] max-lg:rounded-none",
        mobileOpen ? "translate-x-0" : "-translate-x-[120%] lg:translate-x-0",
        "transition-[width,transform] duration-200",
      )}
    >
      <div className={cn("nav-row flex h-[72px] items-center gap-3 px-4", collapsed && "justify-center px-2")}>
        <Logo />
        {!collapsed ? (
          <div className="when-expanded min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-tight">CPMIS</p>
            <p className="truncate text-xs text-black/45">{portalLabel}</p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label={portalLabel}>
        {navSections.map((section) => {
          const sectionItems = items.filter((item) => item.section === section);
          if (sectionItems.length === 0) return null;
          return (
          <div key={section}>
            {!collapsed ? (
              <p className="when-expanded mb-1.5 px-3 text-[11px] font-medium text-black/35">{section}</p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-black/10" />
            )}
            <ul className="space-y-0.5">
              {sectionItems.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        onClick={onNavigate}
                        className={cn(
                          "nav-row flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors",
                          active ? "bg-[#fff1eb] font-medium text-black" : "text-black/55 hover:bg-light-gray hover:text-black",
                          collapsed && "justify-center px-0",
                        )}
                      >
                        <Icon className={cn("size-4 shrink-0", active && "text-accent")} />
                        {!collapsed ? <span className="when-expanded truncate">{item.label}</span> : null}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
          );
        })}
      </nav>

      <Link
        href={profileHref}
        onClick={onNavigate}
        className={cn(
          "nav-row mx-3 mb-3 flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-light-gray",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-white">
          {initials(profileName)}
        </span>
        {!collapsed ? (
          <span className="when-expanded min-w-0">
            <span className="block truncate text-sm font-medium">{profileName}</span>
            <span className="block truncate text-xs text-black/45">{profileTitle}</span>
          </span>
        ) : null}
      </Link>
    </aside>
  );
}

function Logo() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent text-white">
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
        <path d="M4 18V10.5L12 5l8 5.5V18" fill="none" stroke="white" strokeWidth="1.8" />
        <path d="M9.5 18v-5h5v5" fill="none" stroke="white" strokeWidth="1.8" />
      </svg>
    </span>
  );
}
