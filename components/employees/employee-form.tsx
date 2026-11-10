"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { departments, employmentStatusLabel, employmentStatuses } from "@/lib/labels";
import { employeeSchema, type EmployeeFormValues } from "@/lib/validations/schemas";
import type { Employee, Project } from "@/types";

export function EmployeeForm({
  employee,
  projects,
  serverError,
  onCancel,
  onSubmit,
}: {
  employee?: Employee | null;
  projects: Project[];
  serverError?: string | null;
  onCancel: () => void;
  onSubmit: (values: EmployeeFormValues) => void;
}) {
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: employee
      ? { ...employee, projectId: employee.projectId ?? "unassigned" }
      : {
          employeeCode: "",
          firstName: "",
          lastName: "",
          position: "",
          department: departments[0],
          phone: "",
          email: "",
          projectId: "unassigned",
          status: "active",
          hiredAt: "",
        },
  });
  const errors = form.formState.errors;

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      action={employee ? undefined : "/api/employees"}
      method={employee ? undefined : "post"}
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
    >
      <Field label="Employee ID" htmlFor="employeeCode" error={errors.employeeCode?.message}>
        <Input id="employeeCode" {...form.register("employeeCode")} placeholder="EMP-1102" />
      </Field>
      <Field label="Position" htmlFor="position" error={errors.position?.message}>
        <Input id="position" {...form.register("position")} />
      </Field>
      <Field label="First name" htmlFor="emp-first" error={errors.firstName?.message}>
        <Input id="emp-first" {...form.register("firstName")} />
      </Field>
      <Field label="Last name" htmlFor="emp-last" error={errors.lastName?.message}>
        <Input id="emp-last" {...form.register("lastName")} />
      </Field>
      <Field label="Department" error={errors.department?.message}>
        <select aria-label="Department" className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm" defaultValue={departments[0]} {...form.register("department")}>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </select>
      </Field>
      <Field label="Employment status" error={errors.status?.message}>
        <select aria-label="Employment status" className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm" defaultValue="active" {...form.register("status")}>
          {employmentStatuses.map((status) => <option key={status} value={status}>{employmentStatusLabel[status]}</option>)}
        </select>
      </Field>
      <Field label="Phone" htmlFor="emp-phone" error={errors.phone?.message}>
        <Input id="emp-phone" {...form.register("phone")} />
      </Field>
      <Field label="Email" htmlFor="emp-email" error={errors.email?.message}>
        <Input id="emp-email" type="email" {...form.register("email")} />
      </Field>
      <Field label="Assigned project" error={errors.projectId?.message}>
        <select aria-label="Assigned project" className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm" defaultValue="unassigned" {...form.register("projectId")}>
          <option value="unassigned">Unassigned</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}
        </select>
      </Field>
      <Field label="Hire date" htmlFor="hiredAt" error={errors.hiredAt?.message}>
        <Input id="hiredAt" type="date" {...form.register("hiredAt")} />
      </Field>
      {serverError ? <p className="text-sm text-destructive sm:col-span-2">{serverError}</p> : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        {employee ? <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button> : <Button asChild variant="outline"><a href="/admin/employees">Cancel</a></Button>}
        <Button type="submit">{employee ? "Save employee" : "Register employee"}</Button>
      </div>
    </form>
  );
}
