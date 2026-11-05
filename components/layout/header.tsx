"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { SearchDialog } from "@/components/layout/search-dialog";
import { Button } from "@/components/ui/button";
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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-5">
      <Button type="button" variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobile} aria-label="Open navigation">
        <Menu />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={onToggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>
      <Breadcrumbs />
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <span className="hidden rounded-full bg-[#fff4dc] px-2 py-1 text-[11px] font-medium text-[#8a5b04] md:inline">Demo data</span>
        <Button type="button" variant="outline" className="h-9 px-2.5 text-muted-foreground" onClick={() => setSearchOpen(true)}>
          <Search />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground lg:inline">Ctrl K</kbd>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell />
              {unread.length > 0 ? (
                <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                  {unread.length}
                </span>
              ) : null}
            </Button>
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
            <button type="button" className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 hover:bg-muted">
              <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {initials(settings.profileName)}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-sm font-medium">{settings.profileName}</span>
                <span className="block text-[11px] text-muted-foreground">Administrator</span>
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
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
