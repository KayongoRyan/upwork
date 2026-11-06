"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir?: "asc" | "desc";
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-medium tracking-wide uppercase hover:text-foreground">
      {label}
      <Icon className={active ? "size-3.5" : "size-3.5 opacity-40"} />
    </button>
  );
}
