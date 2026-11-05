import Link from "next/link";
import { ActivityBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/utils";
import type { ActivityLog } from "@/types";

export function RecentActivities({ logs }: { logs: ActivityLog[] }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <p className="text-xs text-muted-foreground">Latest records in the preview log</p>
        </div>
        <Link href="/admin/activity-logs" className="text-sm font-medium text-info hover:underline">
          View log
        </Link>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Activity</th>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Project / record</th>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 6).map((log) => (
              <tr key={log.id} className="border-t border-border">
                <td className="px-4 py-3">{log.action}</td>
                <td className="px-4 py-3 text-muted-foreground">{log.userName}</td>
                <td className="px-4 py-3">{log.record}</td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDateTime(log.timestamp)}</td>
                <td className="px-4 py-3">
                  <ActivityBadge status={log.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
