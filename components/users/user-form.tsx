"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { accountStatusLabel, accountStatuses, roleLabel, userRoles } from "@/lib/labels";
import { userSchema, type UserFormValues } from "@/lib/validations/schemas";
import type { Project, UserAccount } from "@/types";

export function UserForm({
  user,
  projects,
  serverError,
  onCancel,
  onSubmit,
}: {
  user?: UserAccount | null;
  projects: Project[];
  serverError?: string | null;
  onCancel: () => void;
  onSubmit: (values: UserFormValues) => void;
}) {
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: user
      ? {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          projectId: user.projectId ?? "unassigned",
          status: user.status,
        }
      : {
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          role: "site_engineer",
          projectId: "unassigned",
          status: "active",
        },
  });
  const errors = form.formState.errors;

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      action={user ? undefined : "/api/users"}
      method={user ? undefined : "post"}
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
    >
      <Field label="First name" htmlFor="firstName" error={errors.firstName?.message}>
        <Input id="firstName" {...form.register("firstName")} />
      </Field>
      <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
        <Input id="lastName" {...form.register("lastName")} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" {...form.register("email")} />
      </Field>
      <Field label="Phone number" htmlFor="phone" error={errors.phone?.message}>
        <Input id="phone" {...form.register("phone")} />
      </Field>
      <Field label="Role" error={errors.role?.message}>
        <select aria-label="Role" className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm" defaultValue={user?.role ?? "site_engineer"} {...form.register("role")}>
          {userRoles.map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}
        </select>
      </Field>
      <Field label="Assigned project" error={errors.projectId?.message}>
        <select aria-label="Assigned project" className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm" defaultValue={user?.projectId ?? "unassigned"} {...form.register("projectId")}>
          <option value="unassigned">Unassigned</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}
        </select>
      </Field>
      <Field label="Account status" error={errors.status?.message}>
        <select aria-label="Account status" className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm" defaultValue={user?.status ?? "active"} {...form.register("status")}>
          {accountStatuses.map((status) => <option key={status} value={status}>{accountStatusLabel[status]}</option>)}
        </select>
      </Field>
      {serverError ? <p className="text-sm text-destructive sm:col-span-2">{serverError}</p> : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        {user ? <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button> : <Button asChild variant="outline"><a href="/admin/users">Cancel</a></Button>}
        <Button type="submit">{user ? "Save user" : "Add user"}</Button>
      </div>
    </form>
  );
}
