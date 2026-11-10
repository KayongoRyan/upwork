"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { navItems } from "@/lib/navigation";
import { useAdmin } from "@/lib/data/admin-store";
import { portalForPath } from "@/lib/portals";
import { searchRecords } from "@/lib/search";
import { useSearchQuery } from "@/components/search/search-query";

export function SearchField({
  pages = navItems,
  projectIds,
  projectBase,
}: {
  pages?: typeof navItems;
  projectIds?: string[];
  projectBase?: string;
}) {
  const pathname = usePathname();
  const seeded = useSearchQuery();
  const data = useAdmin();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const here = portalForPath(pathname);
  const action = `${here?.basePath ?? "/admin"}/search`;
  const needle = query.trim().toLowerCase();
  const shown = !dismissed && (open || needle.length > 0);
  const groups = searchRecords({
    query,
    pages,
    projects: data.projects ?? [],
    users: data.users ?? [],
    employees: data.employees ?? [],
    documents: data.documents ?? [],
    tasks: data.tasks ?? [],
    projectIds,
    projectBase,
    portal: here?.id,
    recordLimit: 6,
    idlePages: true,
  });
  const flat = groups.flatMap((group) => group.items);

  function place() {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = { top: rect.bottom + 8, left: rect.left, width: rect.width };
    setBox((current) => (current && current.top === next.top && current.left === next.left && current.width === next.width ? current : next));
  }

  function reveal() {
    setDismissed(false);
    setOpen(true);
    place();
  }

  useEffect(() => {
    setActive(0);
  }, [needle]);

  useEffect(() => {
    const word = new URLSearchParams(window.location.search).get("q") ?? "";
    if (!word || !inputRef.current) return;
    inputRef.current.value = word;
    setQuery(word);
    setOpen(false);
    setDismissed(true);
  }, [pathname]);

  useEffect(() => {
    if (!shown) return;
    place();
    function onMove() {
      place();
    }
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [shown, needle]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setDismissed(false);
        setOpen(true);
      }
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setDismissed(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const typed = inputRef.current?.value.trim() ?? "";
    if (!typed) event.preventDefault();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      reveal();
      setActive((index) => Math.min(index + 1, Math.max(flat.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      reveal();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Escape") {
      setOpen(false);
      setDismissed(true);
    }
  }

  let cursor = 0;
  const panel = shown ? (
    <div
      ref={panelRef}
      id={listId}
      role="listbox"
      style={box ? { position: "fixed", top: box.top, left: box.left, width: box.width, zIndex: 80 } : undefined}
      className={box ? "max-h-96 space-y-4 overflow-y-auto rounded-[22px] border border-black/5 bg-white p-3 shadow-[0_18px_50px_rgba(0,0,0,0.12)]" : "hidden"}
    >
      {needle && flat.length === 0 ? <p className="px-2 text-sm text-black/50">Nothing matches “{query.trim()}”. Press Enter to search.</p> : null}
      {groups.map((group) => (
        <section key={group.title}>
          <h3 className="mb-1 px-2 text-[11px] font-semibold tracking-[0.14em] text-black/40 uppercase">{group.title}</h3>
          <div className="space-y-1">
            {group.items.map((item) => {
              const index = cursor;
              cursor += 1;
              const selected = index === Math.min(active, flat.length - 1);
              return (
                <a
                  key={item.key}
                  href={item.href}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  className={selected ? "flex w-full items-center justify-between gap-3 rounded-lg bg-[#fff1eb] px-2 py-2 text-left" : "flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-light-gray"}
                >
                  <span className="truncate text-sm font-medium text-black">{item.title}</span>
                  <span className="shrink-0 text-xs text-black/45">{item.meta}</span>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  ) : null;

  return (
    <form ref={rootRef} role="search" action={action} method="get" onSubmit={onSubmit} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
      <div ref={fieldRef} className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-black/5 bg-white px-4">
        <Search className="size-4 shrink-0 text-black/40" />
        <input
          key={seeded}
          ref={inputRef}
          id="portal-search"
          name="q"
          defaultValue={seeded}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            reveal();
          }}
          onFocus={() => reveal()}
          onKeyDown={onKeyDown}
          placeholder="Search projects, drawings, people, pages"
          aria-label="Search projects, drawings, people, pages"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-black outline-none placeholder:text-black/40"
        />
      </div>
      <button type="submit" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-white" aria-label="Search">
        <Search className="size-4" />
      </button>
      {panel && typeof document !== "undefined" ? createPortal(panel, document.body) : null}
    </form>
  );
}
