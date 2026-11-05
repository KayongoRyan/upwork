"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  href,
  icon: Icon,
  label,
  value,
  trend,
  index = 0,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: { text: string; tone: "up" | "down" | "flat" };
  index?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: reduce ? 0 : index * 0.03 }}
    >
      <Link href={href} className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-[#c5d2e0]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
          <span className="grid size-9 place-items-center rounded-lg bg-secondary text-primary">
            <Icon className="size-4" />
          </span>
        </div>
        {trend ? (
          <p
            className={cn(
              "mt-3 text-xs font-medium",
              trend.tone === "up" && "text-success",
              trend.tone === "down" && "text-destructive",
              trend.tone === "flat" && "text-muted-foreground",
            )}
          >
            {trend.text}
          </p>
        ) : null}
      </Link>
    </motion.div>
  );
}
