import type { Metadata } from "next";
import { QsExpenditure } from "@/components/qs/expenditure-view";

export const metadata: Metadata = { title: "Expenditure" };

export default function Page() {
  return <QsExpenditure />;
}
