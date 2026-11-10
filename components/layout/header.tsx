"use client";

import Link from "next/link";
import { Bell, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { SearchField } from "@/components/layout/search-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { isManagerFieldNotice, useAdmin } from "@/lib/data/admin-store";
import { navItems, type NavItem } from "@/lib/navigation";
import { portalUrl } from "@/lib/portals";
import { formatDateTime, initials } from "@/lib/utils";

export function Header({
  collapsed,
  onToggleCollapse,
  onOpenMobile,
  identity,
  links = {
    notifications: "/admin/notifications",
    settings: "/admin/settings",
    switchHref: portalUrl("project_manager"),
    switchLabel: "Project manager portal",
  },
  crumbs,
  scope = "all",
  siteCode,
  portfolio,
  search,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
  identity?: { name: string; email: string; role: string };
  links?: { notifications: string; settings: string; switchHref: string; switchLabel: string };
  crumbs?: { items: NavItem[]; root: { href: string; label: string } };
  scope?: "all" | "field" | "site";
  userId?: string;
  siteCode?: string;
  portfolio?: { id: string; code: string; name: string }[];
  search?: { pages: NavItem[]; projectIds: string[]; projectBase?: string };
}) {
  const { settings, notifications: allNotifications, markNotification } = useAdmin();
  const notifications = scope === "field"
    ? allNotifications.filter((item) => isManagerFieldNotice(item, portfolio ?? []))
    : scope === "site"
      ? allNotifications.filter((item) => Boolean(siteCode) && `${item.title} ${item.message}`.includes(siteCode ?? ""))
      : allNotifications;
  const name = identity?.name ?? settings.profileName;
  const email = identity?.email ?? settings.profileEmail;
  const role = identity?.role ?? "Administrator";
  const unread = notifications.filter((item) => !item.read);

  return (
    <header className="sticky top-0 z-[60] bg-light-gray/90 px-3 pt-3 pb-2 backdrop-blur sm:px-5 lg:px-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <button type="button" className="grid size-11 place-items-center rounded-2xl border border-black/5 bg-white text-black lg:hidden" onClick={onOpenMobile} aria-label="Open navigation">
          <Menu className="size-4" />
        </button>
        <input id="nav-collapse" type="checkbox" className="sr-only" defaultChecked={collapsed} />
        <label htmlFor="nav-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="hidden size-11 cursor-pointer place-items-center rounded-2xl border border-black/5 bg-white text-black lg:grid">
          <PanelLeftClose className="icon-expanded size-4" />
          <PanelLeftOpen className="icon-collapsed hidden size-4" />
        </label>
        <SearchField pages={search?.pages} projectIds={search?.projectIds} projectBase={search?.projectBase} />
        <details className="relative">
          <summary className="relative grid size-11 cursor-pointer list-none place-items-center rounded-2xl border border-black/5 bg-white text-black [&::-webkit-details-marker]:hidden" aria-label="Notifications">
            <Bell className="size-4" />
            {unread.length > 0 ? <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-accent" /> : null}
          </summary>
          <div className="absolute right-0 top-[calc(100%+8px)] z-[80] w-80 max-w-[calc(100vw-1.5rem)] rounded-[22px] border border-black/5 bg-white p-2 shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
            <p className="px-2 py-1.5 text-xs text-black/45">{unread.length} unread</p>
            <ul>
              {notifications.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <a href={links.notifications} onClick={() => markNotification(item.id, true)} className="block rounded-lg px-2 py-2 hover:bg-light-gray">
                    <span className="flex items-center gap-2">
                      {!item.read ? <span className="size-1.5 shrink-0 rounded-full bg-accent" /> : null}
                      <span className="truncate text-sm font-medium">{item.title}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-black/45">{item.senderName} · {formatDateTime(item.createdAt)}</span>
                  </a>
                </li>
              ))}
            </ul>
            <a href={links.notifications} className="mt-1 block rounded-lg px-2 py-2 text-sm font-medium hover:bg-[#fff1eb]">Open notifications</a>
          </div>
        </details>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-2.5 rounded-2xl border border-black/5 bg-white py-1 pr-3 pl-1">
              <span className="grid size-9 place-items-center rounded-full bg-black text-xs font-semibold text-white">
                {initials(name)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-semibold">{name}</span>
                <span className="block text-[11px] text-black/45">{role}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>
              <span className="block text-sm font-medium text-foreground">{name}</span>
              <span className="block">{email}</span>
              <span className="mt-1 block">Preview session. Sign-in is not connected.</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              {links.settings.startsWith("http") ? <a href={links.settings}>Profile settings</a> : <Link href={links.settings} prefetch={false}>Profile settings</Link>}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              {links.notifications.startsWith("http") ? <a href={links.notifications}>Notifications</a> : <Link href={links.notifications} prefetch={false}>Notifications</Link>}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              {links.switchHref.startsWith("http") ? <a href={links.switchHref}>{links.switchLabel}</a> : <Link href={links.switchHref} prefetch={false}>{links.switchLabel}</Link>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 px-1">
        <Breadcrumbs items={crumbs?.items ?? navItems} root={crumbs?.root ?? { href: "/admin", label: "CPMIS" }} />
        <span className="rounded-full bg-[#fff1eb] px-2 py-0.5 text-[11px] font-medium text-black">Demo data</span>
      </div>
    </header>
  );
}
