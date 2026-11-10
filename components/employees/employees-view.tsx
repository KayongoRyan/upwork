"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { EmployeeForm } from "@/components/employees/employee-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { SortButton } from "@/components/shared/sort-button";
import { EmploymentBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdmin } from "@/lib/data/admin-store";
import { departments, employmentStatusLabel, employmentStatuses } from "@/lib/labels";
import { usePagedRows } from "@/lib/use-paged-rows";
import { fullName } from "@/lib/utils";
import type { EmployeeFormValues } from "@/lib/validations/schemas";
import type { Employee } from "@/types";

export function EmployeesView() {
  const data = useAdmin();
  const params = useSearchParams();
  const focus = params.get("focus");
  const register = params.get("register") === "1";
  const [seenFocus, setSeenFocus] = useState(focus);
  const [viewId, setViewId] = useState<string | null>(focus);
  const [editor, setEditor] = useState<Employee | "new" | null>(null);
  const [assigning, setAssigning] = useState<Employee | null>(null);
  const [assignProject, setAssignProject] = useState("unassigned");
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null);
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (focus !== seenFocus) {
    setSeenFocus(focus);
    setViewId(focus);
  }

  const table = usePagedRows({
    rows: data.employees,
    filterKey: `${department}|${status}`,
    filter: (employee) => (department === "all" || employee.department === department) && (status === "all" || employee.status === status),
    search: (employee, query) => `${fullName(employee)} ${employee.employeeCode} ${employee.position} ${employee.phone}`.toLowerCase().includes(query),
    accessors: {
      code: (employee) => employee.employeeCode,
      name: (employee) => fullName(employee),
      position: (employee) => employee.position,
      department: (employee) => employee.department,
      phone: (employee) => employee.phone,
      project: (employee) => data.projectById(employee.projectId)?.code ?? "",
      status: (employee) => employee.status,
    },
    initialSort: { key: "code", dir: "asc" },
  });
  const viewing = data.employees.find((employee) => employee.id === viewId) ?? null;

  function save(values: EmployeeFormValues) {
    const result = editor === "new" ? data.createEmployee(values) : editor ? data.updateEmployee(editor.id, values) : { ok: false as const, error: "Nothing to save." };
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    toast.success(editor === "new" ? "Employee registered in this preview." : "Employee updated in this preview.");
    setEditor(null);
    setFormError(null);
  }

  function saveAssignment() {
    if (!assigning) return;
    const result = data.updateEmployee(assigning.id, { ...assigning, projectId: assignProject });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Project assignment updated.");
    setAssigning(null);
  }

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Company workforce. These records are separate from application user accounts."
        actions={<Button asChild><a href="/admin/employees?register=1"><Plus />Register employee</a></Button>}
      />
      {register && !saved ? (
        <section className="mb-4 rounded-[22px] border border-black/5 bg-card p-4">
          <h2 className="text-base font-semibold">Register employee</h2>
          <p className="mt-1 mb-4 text-sm text-black/55">Workforce record only. This does not create a login.</p>
          <EmployeeForm
            projects={data.projects}
            serverError={formError ?? params.get("error")}
            onCancel={() => { window.location.assign("/admin/employees"); }}
            onSubmit={(values) => {
              const result = data.createEmployee(values);
              if (!result.ok) {
                setFormError(result.error);
                return;
              }
              toast.success("Employee registered in this preview.");
              setFormError(null);
              setSaved(true);
              window.history.replaceState(null, "", "/admin/employees");
            }}
          />
        </section>
      ) : null}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <Input value={table.query} onChange={(event) => table.setQuery(event.target.value)} placeholder="Search name, ID, position, or phone" className="lg:max-w-sm" />
        <select aria-label="Department" value={department} onChange={(event) => setDepartment(event.target.value)} className="h-10 rounded-lg border border-input bg-white px-3 text-sm">
          <option value="all">All departments</option>
          {departments.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label="Employment status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-input bg-white px-3 text-sm">
          <option value="all">All statuses</option>
          {employmentStatuses.map((item) => <option key={item} value={item}>{employmentStatusLabel[item]}</option>)}
        </select>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-black/[0.03] text-left text-[11px] text-muted-foreground">
              <tr>
                {[
                  ["code", "Employee ID"],
                  ["name", "Full name"],
                  ["position", "Position"],
                  ["department", "Department"],
                  ["phone", "Phone"],
                  ["project", "Assigned project"],
                  ["status", "Status"],
                ].map(([key, label]) => (
                  <th key={key} className="px-3 py-3">
                    <SortButton label={label} active={table.sort?.key === key} dir={table.sort?.dir} onClick={() => table.toggleSort(key)} />
                  </th>
                ))}
                <th className="px-3 py-3 font-medium tracking-wide uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {table.pageRows.map((employee) => (
                <tr key={employee.id} className="border-t border-border">
                  <td className="px-3 py-3 font-mono text-xs">{employee.employeeCode}</td>
                  <td className="px-3 py-3 font-medium">{fullName(employee)}</td>
                  <td className="px-3 py-3">{employee.position}</td>
                  <td className="px-3 py-3">{employee.department}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{employee.phone}</td>
                  <td className="px-3 py-3">{data.projectById(employee.projectId)?.code ?? "—"}</td>
                  <td className="px-3 py-3"><EmploymentBadge status={employee.status} /></td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <Button type="button" size="icon" variant="ghost" aria-label={`View ${fullName(employee)}`} onClick={() => setViewId(employee.id)}><Eye /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${fullName(employee)}`} onClick={() => { setFormError(null); setEditor(employee); }}><Pencil /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Assign ${fullName(employee)}`} onClick={() => { setAssigning(employee); setAssignProject(employee.projectId ?? "unassigned"); }}><UserPlus /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${fullName(employee)}`} onClick={() => setPendingDelete(employee)}><Trash2 /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {table.total === 0 ? <EmptyState title="No employees match" body="Adjust the search or filters." /> : <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={6} onPage={table.setPage} />}
      </div>

      <Dialog open={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        {editor !== null ? (
          <DialogContent className="sm:max-w-2xl" title={editor === "new" ? "Register employee" : "Edit employee"} description="Workforce record only. This does not create a login.">
            <EmployeeForm employee={editor === "new" ? null : editor} projects={data.projects} serverError={formError} onCancel={() => setEditor(null)} onSubmit={save} />
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewId(null); }}>
        {viewing ? (
          <DialogContent title={fullName(viewing)} description={viewing.employeeCode}>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Item label="Position" value={viewing.position} />
              <Item label="Department" value={viewing.department} />
              <Item label="Phone" value={viewing.phone} />
              <Item label="Email" value={viewing.email} />
              <Item label="Project" value={data.projectById(viewing.projectId)?.name ?? "Unassigned"} />
              <Item label="Status" value={<EmploymentBadge status={viewing.status} />} />
            </dl>
            <div className="flex justify-end"><Button type="button" variant="outline" onClick={() => setViewId(null)}>Close</Button></div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={Boolean(assigning)} onOpenChange={(open) => { if (!open) setAssigning(null); }}>
        {assigning ? (
          <DialogContent title={`Assign ${fullName(assigning)}`} description="Choose the project this employee is working on.">
            <Select value={assignProject} onValueChange={setAssignProject}>
              <SelectTrigger aria-label="Project"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {data.projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAssigning(null)}>Cancel</Button>
              <Button type="button" onClick={saveAssignment}>Save assignment</Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove employee?"
        body={pendingDelete ? `${fullName(pendingDelete)} will be removed from the workforce list in this preview.` : ""}
        confirmLabel="Remove employee"
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        onConfirm={() => {
          if (!pendingDelete) return;
          data.deleteEmployee(pendingDelete.id);
          toast.success("Employee removed from this preview.");
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium break-all">{value}</dd>
    </div>
  );
}
