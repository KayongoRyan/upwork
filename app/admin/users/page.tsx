import { Suspense } from "react";
import type { Metadata } from "next";
import { UsersView } from "@/components/users/users-view";

export const metadata: Metadata = { title: "User management" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <UsersView />
    </Suspense>
  );
}
