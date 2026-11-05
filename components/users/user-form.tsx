"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)} noValidate>
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
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {userRoles.map((role) => (
                  <SelectItem key={role} value={role}>{roleLabel[role]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label="Assigned project" error={errors.projectId?.message}>
        <Controller
          control={form.control}
          name="projectId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger aria-label="Assigned project"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>{project.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label="Account status" error={errors.status?.message}>
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger aria-label="Account status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {accountStatuses.map((status) => (
                  <SelectItem key={status} value={status}>{accountStatusLabel[status]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      {serverError ? <p className="text-sm text-destructive sm:col-span-2">{serverError}</p> : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{user ? "Save user" : "Add user"}</Button>
      </div>
    </form>
  );
}
