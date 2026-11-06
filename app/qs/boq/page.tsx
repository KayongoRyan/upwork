import type { Metadata } from "next";
import { QsBoq } from "@/components/qs/boq-view";

export const metadata: Metadata = { title: "Bill of quantities" };

export default function Page() {
  return <QsBoq />;
}
