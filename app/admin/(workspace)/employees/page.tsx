import { Suspense } from "react";
import type { Metadata } from "next";
import { EmployeesView } from "@/components/employees/employees-view";

export const metadata: Metadata = { title: "Employees" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EmployeesView />
    </Suspense>
  );
}
