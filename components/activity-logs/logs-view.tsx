"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { ActivityBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { useAdmin } from "@/lib/data/admin-store";
import { formatDateTime } from "@/lib/utils";

export function LogsView() {
  const params = useSearchParams();
  const urlQuery = params.get("find") ?? "";
  const urlUser = params.get("user") ?? "all";
  const urlModule = params.get("module") ?? "all";
  const urlFrom = params.get("from") ?? "";
  const urlTo = params.get("to") ?? "";
  const { activityLogs } = useAdmin();
  const [query, setQuery] = useState(urlQuery);
  const [user, setUser] = useState(urlUser);
  const [moduleName, setModuleName] = useState(urlModule);
  const [from, setFrom] = useState(urlFrom);
  const [to, setTo] = useState(urlTo);
  const [page, setPage] = useState(1);
  const users = [...new Set(activityLogs.map((log) => log.userName))].sort();
  const modules = [...new Set(activityLogs.map((log) => log.module))].sort();
  const signature = `${query}|${user}|${moduleName}|${from}|${to}`;
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setPage(1);
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return activityLogs.filter((log) => {
      if (user !== "all" && log.userName !== user) return false;
      if (moduleName !== "all" && log.module !== moduleName) return false;
      const day = log.timestamp.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!needle) return true;
      return `${log.action} ${log.record} ${log.userName} ${log.module}`.toLowerCase().includes(needle);
    });
  }, [activityLogs, query, user, moduleName, from, to]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div>
      <PageHeader title="System activity logs" description="A preview trail of who changed which record. New edits in this session appear at the top." />
      <form action="/admin/activity-logs" method="get" className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="flex gap-2">
          <Input
            key={urlQuery}
            name="find"
            defaultValue={urlQuery}
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search action or record"
            aria-label="Search action or record"
          />
          <button type="submit" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-white" aria-label="Search logs">
            <Search className="size-4" />
          </button>
        </div>
        <select name="user" aria-label="User" defaultValue={urlUser} onChange={(event) => setUser(event.target.value)} className="h-10 rounded-lg border border-input bg-white px-3 text-sm">
          <option value="all">All users</option>
          {users.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select name="module" aria-label="Module" defaultValue={urlModule} onChange={(event) => setModuleName(event.target.value)} className="h-10 rounded-lg border border-input bg-white px-3 text-sm">
          <option value="all">All modules</option>
          {modules.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <Input name="from" aria-label="From date" type="date" defaultValue={urlFrom} onInput={(event) => setFrom(event.currentTarget.value)} />
        <Input name="to" aria-label="To date" type="date" defaultValue={urlTo} onInput={(event) => setTo(event.currentTarget.value)} />
      </form>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-black/[0.03] text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Module</th>
                <th className="px-4 py-3 font-medium">Record</th>
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => (
                <tr key={log.id} className="border-t border-border">
                  <td className="px-4 py-3">{log.userName}</td>
                  <td className="px-4 py-3">{log.action}</td>
                  <td className="px-4 py-3">{log.module}</td>
                  <td className="px-4 py-3">{log.record}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(log.timestamp)}</td>
                  <td className="px-4 py-3"><ActivityBadge status={log.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? <EmptyState title="No log entries" body="Nothing matches the current search and filters." /> : <Pagination page={safePage} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onPage={setPage} />}
      </div>
    </div>
  );
}
