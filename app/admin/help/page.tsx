import { Suspense } from "react";
import type { Metadata } from "next";
import { HelpArticles } from "@/components/help/help-articles";
import { HelpView } from "@/components/help/help-view";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Help & support" };

export default function Page() {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <PageHeader title="Help & support" description="How to use this administrator preview, and a note that stays on this machine." />
        <HelpArticles />
      </div>
      <Suspense fallback={null}>
        <HelpView />
      </Suspense>
    </div>
  );
}
