"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inquiryStatusLabel, inquiryStatuses } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import type { InquiryStatus, VertexaInquiry } from "@/types";

const statusTone: Record<InquiryStatus, "amber" | "navy" | "green"> = {
  received: "amber",
  assigned: "navy",
  closed: "green",
};

export function InquiriesView() {
  const [items, setItems] = useState<VertexaInquiry[]>([]);
  const [status, setStatus] = useState<"all" | InquiryStatus>("all");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState({ status: "all", search: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (applied.status !== "all") params.set("status", applied.status);
        if (applied.search) params.set("search", applied.search);
        const response = await fetch(`/api/vertexa/inquiries?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error("unavailable");
        const data = (await response.json()) as { items?: VertexaInquiry[] };
        if (!cancelled) setItems(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) {
          setItems([]);
          setError("Could not load inquiries from the Vertexa API. Start the backend and refresh.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [applied]);

  const counts = useMemo(() => {
    const byStatus = { received: 0, assigned: 0, closed: 0 } as Record<InquiryStatus, number>;
    for (const item of items) byStatus[item.status] += 1;
    return byStatus;
  }, [items]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({ status, search: query.trim() });
  }

  return (
    <div>
      <PageHeader
        title="Inquiries"
        description="Project inquiries submitted on the public Vertexa site. Records are stored in MongoDB by the Express API."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {inquiryStatuses.map((value) => (
          <div key={value} className="rounded-[22px] border border-black/5 bg-card p-4">
            <p className="text-xs text-muted-foreground">{inquiryStatusLabel[value]}</p>
            <p className="mt-1 text-2xl font-semibold">{counts[value]}</p>
          </div>
        ))}
      </div>
      <form onSubmit={applyFilters} className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, service, or message"
            aria-label="Search inquiries"
          />
          <Button type="submit" className="shrink-0" aria-label="Search">
            <Search className="size-4" />
          </Button>
        </div>
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | InquiryStatus)}
          className="h-10 rounded-lg border border-input bg-white px-3 text-sm"
        >
          <option value="all">All statuses</option>
          {inquiryStatuses.map((value) => (
            <option key={value} value={value}>{inquiryStatusLabel[value]}</option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setQuery("");
            setStatus("all");
            setApplied({ status: "all", search: "" });
          }}
        >
          Reset
        </Button>
      </form>

      {error ? <div className="mb-4 rounded-[22px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-black/[0.03] text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Inquiry</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Assigned</th>
                <th className="px-4 py-3 font-medium">Received</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.id}</p>
                    {item.projectId ? <p className="mt-1 text-xs text-muted-foreground">Project: {item.projectId}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <p>{item.serviceName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.location || "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{item.email}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.phone || "No phone"}</p>
                  </td>
                  <td className="px-4 py-3"><Badge tone={statusTone[item.status]}>{inquiryStatusLabel[item.status]}</Badge></td>
                  <td className="px-4 py-3">{item.recipientId || "Unassigned"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(item.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Button asChild size="sm" variant="outline"><Link href={`/admin/inquiries/${item.id}`}>Open</Link></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? <div className="border-t border-border p-6 text-sm text-muted-foreground">Loading inquiries…</div> : null}
        {!loading && items.length === 0 && !error ? (
          <EmptyState title="No inquiries yet" body="Submissions from the Vertexa site will appear here once the API stores them." />
        ) : null}
      </div>
    </div>
  );
}
