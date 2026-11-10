import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  href,
  icon: Icon,
  label,
  value,
  trend,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: { text: string; tone: "up" | "down" | "flat" };
  index?: number;
}) {
  return (
    <div>
      <Link href={href} prefetch={false} className="block rounded-[22px] border border-black/5 bg-card p-4 transition-colors hover:border-black/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-black/50">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
          <span className="grid size-9 place-items-center rounded-2xl bg-[#fff1eb] text-accent">
            <Icon className="size-4" />
          </span>
        </div>
        {trend ? (
          <p className="mt-3">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                trend.tone === "up" && "bg-[#fff1eb] text-accent",
                trend.tone === "down" && "bg-black text-white",
                trend.tone === "flat" && "bg-black/[0.06] text-black/60",
              )}
            >
              {trend.text}
            </span>
          </p>
        ) : null}
      </Link>
    </div>
  );
}
