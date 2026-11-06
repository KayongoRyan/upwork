"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { SearchDialog } from "@/components/layout/search-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAdmin } from "@/lib/data/admin-store";
import { formatDateTime, initials } from "@/lib/utils";

export function Header({
  collapsed,
  onToggleCollapse,
  onOpenMobile,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
}) {
  const { settings, notifications, markNotification } = useAdmin();
  const [searchOpen, setSearchOpen] = useState(false);
  const unread = notifications.filter((item) => !item.read);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-[#f3f3f3]/90 px-3 pt-3 pb-2 backdrop-blur sm:px-5 lg:px-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <button type="button" className="grid size-11 place-items-center rounded-2xl border border-black/5 bg-white text-black lg:hidden" onClick={onOpenMobile} aria-label="Open navigation">
          <Menu className="size-4" />
        </button>
        <button type="button" className="hidden size-11 place-items-center rounded-2xl border border-black/5 bg-white text-black lg:grid" onClick={onToggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
        <button type="button" onClick={() => setSearchOpen(true)} className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-black/5 bg-white px-4 text-left text-sm text-black/40">
          <Search className="size-4 shrink-0" />
          <span className="truncate">Search projects, people, pages</span>
        </button>
        <button type="button" onClick={() => setSearchOpen(true)} className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-white" aria-label="Search">
          <Search className="size-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="relative grid size-11 place-items-center rounded-2xl border border-black/5 bg-white text-black" aria-label="Notifications">
              <Bell className="size-4" />
              {unread.length > 0 ? <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-accent" /> : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80">
            <DropdownMenuLabel>{unread.length} unread</DropdownMenuLabel>
            {notifications.slice(0, 5).map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => markNotification(item.id, true)} className="items-start">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    {!item.read ? <span className="size-1.5 rounded-full bg-accent" /> : null}
                    <span className="truncate font-medium">{item.title}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin/notifications">Open notifications</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-2.5 rounded-2xl border border-black/5 bg-white py-1 pr-3 pl-1">
              <span className="grid size-9 place-items-center rounded-full bg-black text-xs font-semibold text-white">
                {initials(settings.profileName)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-semibold">{settings.profileName}</span>
                <span className="block text-[11px] text-black/45">Administrator</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>
              <span className="block text-sm font-medium text-foreground">{settings.profileName}</span>
              <span className="block">{settings.profileEmail}</span>
              <span className="mt-1 block">Preview session. Sign-in is not connected.</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin/settings">Profile settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/notifications">Notifications</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 px-1">
        <Breadcrumbs />
        <span className="rounded-full bg-[#fff1eb] px-2 py-0.5 text-[11px] font-medium text-black">Demo data</span>
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
