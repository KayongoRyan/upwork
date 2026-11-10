"use client";

import { createContext, useContext } from "react";

const SearchQueryContext = createContext("");

export function SearchQueryProvider({ query, children }: { query: string; children: React.ReactNode }) {
  return <SearchQueryContext.Provider value={query}>{children}</SearchQueryContext.Provider>;
}

export function useSearchQuery() {
  return useContext(SearchQueryContext);
}
