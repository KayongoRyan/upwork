"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { crumbsFor } from "@/lib/navigation";

export function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm sm:flex">
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <span key={crumb.href + crumb.label} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <ChevronRight className="size-3.5 text-muted-foreground" /> : null}
            {last ? (
              <span className="truncate font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="truncate text-muted-foreground hover:text-foreground">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
