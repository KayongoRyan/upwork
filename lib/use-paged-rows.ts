"use client";

import { useMemo, useState } from "react";

export function usePagedRows<T>({
  rows,
  pageSize = 6,
  search,
  filter,
  filterKey,
  accessors,
  initialSort,
}: {
  rows: T[];
  pageSize?: number;
  search: (row: T, query: string) => boolean;
  filter?: (row: T) => boolean;
  filterKey: string;
  accessors: Record<string, (row: T) => string | number>;
  initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(initialSort ?? null);
  const [signature, setSignature] = useState(`${query}|${filterKey}`);
  const nextSignature = `${query}|${filterKey}`;
  if (nextSignature !== signature) {
    setSignature(nextSignature);
    setPage(1);
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter && !filter(row)) return false;
      if (!needle) return true;
      return search(row, needle);
    });
  }, [rows, query, filter, search]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const read = accessors[sort.key];
    if (!read) return filtered;
    return [...filtered].sort((a, b) => {
      const left = read(a);
      const right = read(b);
      const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
      return sort.dir === "asc" ? result : -result;
    });
  }, [filtered, sort, accessors]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  if (safePage !== page) setPage(safePage);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: string) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: "asc" };
      return { key, dir: current.dir === "asc" ? "desc" : "asc" };
    });
  }

  return {
    query,
    setQuery,
    page: safePage,
    setPage,
    pageCount,
    pageRows,
    total: sorted.length,
    sort,
    toggleSort,
  };
}
