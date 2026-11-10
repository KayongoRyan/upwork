"use client";

import { useEffect, useState, type ReactNode } from "react";

export function ChartSlot({ className, children }: { className: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return <div className={className}>{ready ? children : null}</div>;
}
