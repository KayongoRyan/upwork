"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SortButton } from "@/components/shared/sort-button";
import { AccountBadge } from "@/components/shared/status-badge";
import { UserForm } from "@/components/users/user-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAdmin } from "@/lib/data/admin-store";
import { accountStatusLabel, accountStatuses, roleLabel, userRoles } from "@/lib/labels";
import { countRoles } from "@/lib/metrics";
import { usePagedRows } from "@/lib/use-paged-rows";
import { formatDate, fullName } from "@/lib/utils";
import type { UserFormValues } from "@/lib/validations/schemas";
import type { UserAccount } from "@/types";

export function UsersView() {
  const data = useAdmin();
  const params = useSearchParams();
  const focus = params.get("focus");
  const add = params.get("add") === "1";
  const [seenFocus, setSeenFocus] = useState(focus);
  const [viewId, setViewId] = useState<string | null>(focus);
  const [editor, setEditor] = useState<UserAccount | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserAccount | null>(null);
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (focus !== seenFocus) {
    setSeenFocus(focus);
    setViewId(focus);
  }

  const counts = countRoles(data.users);
  const table = usePagedRows({
    rows: data.users,
    filterKey: `${role}|${status}`,
    filter: (user) => (role === "all" || user.role === role) && (status === "all" || user.status === status),
    search: (user, query) => `${fullName(user)} ${user.email} ${user.phone}`.toLowerCase().includes(query),
    accessors: {
      name: (user) => fullName(user),
      email: (user) => user.email,
      phone: (user) => user.phone,
      role: (user) => user.role,
      project: (user) => data.projectById(user.projectId)?.code ?? "",
      status: (user) => user.status,
      registered: (user) => user.registeredAt,
    },
    initialSort: { key: "name", dir: "asc" },
  });
  const viewing = data.users.find((user) => user.id === viewId) ?? null;

  function save(values: UserFormValues) {
    const result = editor === "new" ? data.createUser(values) : editor ? data.updateUser(editor.id, values) : { ok: false as const, error: "Nothing to save." };
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    toast.success(editor === "new" ? "User added in this preview." : "User updated in this preview.");
    setEditor(null);
    setFormError(null);
  }

  function toggleStatus(user: UserAccount) {
    const next = user.status === "active" ? "inactive" : "active";
    const result = data.setUserStatus(user.id, next);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(next === "active" ? "Account activated." : "Account deactivated.");
  }

  return (
    <div>
      <PageHeader
        title="User management"
        description="Application accounts only. Workforce records that do not sign in live under Employees."
        actions={<Button asChild><a href="/admin/users?add=1"><Plus />Add user</a></Button>}
      />
      {add && !saved ? (
        <section className="mb-4 rounded-[22px] border border-black/5 bg-card p-4">
          <h2 className="text-base font-semibold">Add user</h2>
          <p className="mt-1 mb-4 text-sm text-black/55">Preview account only. This does not send an invitation or set a password.</p>
          <UserForm
            projects={data.projects}
            serverError={formError ?? params.get("error")}
            onCancel={() => { window.location.assign("/admin/users"); }}
            onSubmit={(values) => {
              const result = data.createUser(values);
              if (!result.ok) {
                setFormError(result.error);
                return;
              }
              toast.success("User added in this preview.");
              setFormError(null);
              setSaved(true);
              window.history.replaceState(null, "", "/admin/users");
            }}
          />
        </section>
      ) : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Mini label="Total users" value={counts.total} />
        <Mini label="Active" value={counts.active} />
        <Mini label="Inactive" value={counts.inactive} />
        <Mini label="By role" value={`${counts.project_manager} PM · ${counts.site_engineer} SE · ${counts.quantity_surveyor} QS`} />
      </div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <Input value={table.query} onChange={(event) => table.setQuery(event.target.value)} placeholder="Search name, email, or phone" className="lg:max-w-sm" />
        <Filter label="Role" value={role} onChange={setRole} options={[["all", "All roles"], ...userRoles.map((item) => [item, roleLabel[item]] as const)]} />
        <Filter label="Account status" value={status} onChange={setStatus} options={[["all", "All statuses"], ...accountStatuses.map((item) => [item, accountStatusLabel[item]] as const)]} />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-black/[0.03] text-left text-[11px] text-muted-foreground">
              <tr>
                {[
                  ["name", "Full name"],
                  ["email", "Email"],
                  ["phone", "Phone"],
                  ["role", "Role"],
                  ["project", "Assigned project"],
                  ["status", "Status"],
                  ["registered", "Registered"],
                ].map(([key, label]) => (
                  <th key={key} className="px-3 py-3">
                    <SortButton label={label} active={table.sort?.key === key} dir={table.sort?.dir} onClick={() => table.toggleSort(key)} />
                  </th>
                ))}
                <th className="px-3 py-3 font-medium tracking-wide uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {table.pageRows.map((user) => (
                <tr key={user.id} className="border-t border-border">
                  <td className="px-3 py-3 font-medium">{fullName(user)}</td>
                  <td className="px-3 py-3">{user.email}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{user.phone}</td>
                  <td className="px-3 py-3">{roleLabel[user.role]}</td>
                  <td className="px-3 py-3">{data.projectById(user.projectId)?.code ?? "—"}</td>
                  <td className="px-3 py-3"><AccountBadge status={user.status} /></td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDate(user.registeredAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <IconButton label={`View ${fullName(user)}`} onClick={() => setViewId(user.id)}><Eye /></IconButton>
                      <IconButton label={`Edit ${fullName(user)}`} onClick={() => { setFormError(null); setEditor(user); }}><Pencil /></IconButton>
                      <IconButton label={user.status === "active" ? "Deactivate" : "Activate"} onClick={() => toggleStatus(user)}><Power /></IconButton>
                      <IconButton label={`Delete ${fullName(user)}`} onClick={() => setPendingDelete(user)}><Trash2 /></IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {table.total === 0 ? <EmptyState title="No users match" body="Adjust the search or filters." /> : <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={6} onPage={table.setPage} />}
      </div>

      <Dialog open={editor !== null && editor !== "new"} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        {editor !== null && editor !== "new" ? (
          <DialogContent className="sm:max-w-2xl" title="Edit user" description="This updates the preview account. It does not send an invitation or set a password.">
            <UserForm user={editor} projects={data.projects} serverError={formError} onCancel={() => setEditor(null)} onSubmit={save} />
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewId(null); }}>
        {viewing ? (
          <DialogContent title={fullName(viewing)} description="Application account. This is not an employment record.">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Item label="Email" value={viewing.email} />
              <Item label="Phone" value={viewing.phone} />
              <Item label="Role" value={roleLabel[viewing.role]} />
              <Item label="Status" value={<AccountBadge status={viewing.status} />} />
              <Item label="Project" value={data.projectById(viewing.projectId)?.name ?? "Unassigned"} />
              <Item label="Registered" value={formatDate(viewing.registeredAt)} />
            </dl>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => setViewId(null)}>Close</Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete user?"
        body={pendingDelete ? `${fullName(pendingDelete)} will be removed from this preview. Project managers still assigned to a project cannot be deleted.` : ""}
        confirmLabel="Delete user"
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        onConfirm={() => {
          if (!pendingDelete) return;
          const result = data.deleteUser(pendingDelete.id);
          if (!result.ok) toast.error(result.error);
          else toast.success("User deleted from this preview.");
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-lg border border-input bg-white px-3 text-sm">
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>{optionLabel}</option>
      ))}
    </select>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="icon" variant="ghost" aria-label={label} onClick={onClick}>{children}</Button>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
