import type { ReactNode } from "react";

export function ChartSlot({ className, children }: { className: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}
