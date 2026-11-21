import { Suspense } from "react";
import type { Metadata } from "next";
import { SearchResults } from "@/components/search/search-results";

export const metadata: Metadata = { title: "Search" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SearchResults portal="pm" />
    </Suspense>
  );
}
