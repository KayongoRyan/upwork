"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { projectStatusLabel, projectStatuses } from "@/lib/labels";
import { projectSchema, type ProjectFormValues } from "@/lib/validations/schemas";
import type { Project, UserAccount } from "@/types";

export function ProjectForm({
  project,
  managers,
  serverError,
  onCancel,
  onSubmit,
}: {
  project?: Project | null;
  managers: UserAccount[];
  serverError?: string | null;
  onCancel: () => void;
  onSubmit: (values: ProjectFormValues) => void;
}) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: project
      ? {
          name: project.name,
          code: project.code,
          description: project.description,
          client: project.client,
          location: project.location,
          managerId: project.managerId,
          startDate: project.startDate,
          expectedEndDate: project.expectedEndDate,
          budget: project.budget,
          spent: project.spent,
          progress: project.progress,
          status: project.status,
        }
      : {
          name: "",
          code: "",
          description: "",
          client: "",
          location: "",
          managerId: managers[0]?.id ?? "",
          startDate: "",
          expectedEndDate: "",
          budget: 0,
          spent: 0,
          progress: 0,
          status: "planning",
        },
  });
  const errors = form.formState.errors;

  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" {...form.register("name")} />
        </Field>
        <Field label="Project code" htmlFor="code" error={errors.code?.message}>
          <Input id="code" {...form.register("code")} placeholder="KLA-NBX-27" />
        </Field>
      </div>
      <Field label="Description" htmlFor="description" error={errors.description?.message}>
        <Textarea id="description" {...form.register("description")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client name" htmlFor="client" error={errors.client?.message}>
          <Input id="client" {...form.register("client")} />
        </Field>
        <Field label="Location" htmlFor="location" error={errors.location?.message}>
          <Input id="location" {...form.register("location")} />
        </Field>
        <Field label="Project manager" error={errors.managerId?.message}>
          <Controller
            control={form.control}
            name="managerId"
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger aria-label="Project manager">
                  <SelectValue placeholder="Choose a manager" />
                </SelectTrigger>
                <SelectContent>
                  {managers.map((manager) => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.firstName} {manager.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Status" error={errors.status?.message}>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger aria-label="Project status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {projectStatusLabel[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Start date" htmlFor="startDate" error={errors.startDate?.message}>
          <Input id="startDate" type="date" {...form.register("startDate")} />
        </Field>
        <Field label="Expected completion" htmlFor="expectedEndDate" error={errors.expectedEndDate?.message}>
          <Input id="expectedEndDate" type="date" {...form.register("expectedEndDate")} />
        </Field>
        <Field label="Estimated budget (USD)" htmlFor="budget" error={errors.budget?.message} hint="Demonstration figure">
          <Input id="budget" type="number" min={0} step={1000} {...form.register("budget")} />
        </Field>
        {project ? (
          <>
            <Field label="Amount spent (USD)" htmlFor="spent" error={errors.spent?.message} hint="Demonstration figure">
              <Input id="spent" type="number" min={0} step={1000} {...form.register("spent")} />
            </Field>
            <Field label="Completion %" htmlFor="progress" error={errors.progress?.message}>
              <Input id="progress" type="number" min={0} max={100} {...form.register("progress")} />
            </Field>
          </>
        ) : null}
      </div>
      {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      {managers.length === 0 ? <p className="text-sm text-destructive">Add a project manager before creating a project.</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={managers.length === 0}>
          {project ? "Save changes" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
