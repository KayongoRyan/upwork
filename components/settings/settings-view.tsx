"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAdmin } from "@/lib/data/admin-store";
import {
  notificationPrefsSchema,
  organizationSchema,
  preferencesSchema,
  profileSchema,
} from "@/lib/validations/schemas";
import type { OrgSettings } from "@/types";

const tabs = [
  ["organization", "Organization"],
  ["contact", "Contact"],
  ["preferences", "Preferences"],
  ["notifications", "Notifications"],
  ["profile", "Profile"],
] as const;

type Tab = (typeof tabs)[number][0];

const contactSchema = organizationSchema.pick({
  address: true,
  city: true,
  country: true,
  phone: true,
  email: true,
  website: true,
});

const organizationOnlySchema = organizationSchema.pick({
  organizationName: true,
  registrationNumber: true,
  industry: true,
});

export function SettingsView() {
  const data = useAdmin();
  const [tab, setTab] = useState<Tab>("organization");

  function save(patch: Partial<OrgSettings>, message: string) {
    data.updateSettings(patch);
    toast.success(message);
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Organization profile and preview preferences. Nothing here changes a real security policy or sends email."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <Button key={id} type="button" size="sm" variant={tab === id ? "navy" : "outline"} onClick={() => setTab(id)}>
            {label}
          </Button>
        ))}
      </div>
      <div className="max-w-3xl rounded-xl border border-border bg-card p-5">
        {tab === "organization" ? (
          <SettingsForm
            key={data.settings.organizationName + data.settings.registrationNumber}
            schema={organizationOnlySchema}
            defaults={{
              organizationName: data.settings.organizationName,
              registrationNumber: data.settings.registrationNumber,
              industry: data.settings.industry,
            }}
            fields={[
              ["organizationName", "Organization name", "text"],
              ["registrationNumber", "Registration number", "text"],
              ["industry", "Industry", "text"],
            ]}
            onSubmit={(values) => save(values, "Organization profile saved in this preview.")}
          />
        ) : null}
        {tab === "contact" ? (
          <SettingsForm
            key={data.settings.email + data.settings.phone + data.settings.address}
            schema={contactSchema}
            defaults={{
              address: data.settings.address,
              city: data.settings.city,
              country: data.settings.country,
              phone: data.settings.phone,
              email: data.settings.email,
              website: data.settings.website,
            }}
            fields={[
              ["address", "Address", "text"],
              ["city", "City", "text"],
              ["country", "Country", "text"],
              ["phone", "Phone", "text"],
              ["email", "Email", "email"],
              ["website", "Website", "text"],
            ]}
            onSubmit={(values) => save(values, "Contact details saved in this preview.")}
          />
        ) : null}
        {tab === "preferences" ? (
          <SettingsForm
            key={`${data.settings.currency}-${data.settings.compactTables}`}
            schema={preferencesSchema}
            defaults={{
              timezone: data.settings.timezone,
              dateFormat: data.settings.dateFormat,
              currency: data.settings.currency,
              language: data.settings.language,
              compactTables: data.settings.compactTables,
            }}
            fields={[
              ["timezone", "Timezone", "text"],
              ["dateFormat", "Date format", "text"],
              ["currency", "Currency code", "text"],
              ["language", "Language", "text"],
            ]}
            checks={[["compactTables", "Use compact table spacing"]]}
            onSubmit={(values) => save(values, "Preferences saved in this preview.")}
          />
        ) : null}
        {tab === "notifications" ? (
          <SettingsForm
            key={`${data.settings.delayAlerts}-${data.settings.userRegistrationAlerts}-${data.settings.emailAlerts}-${data.settings.weeklyDigest}`}
            schema={notificationPrefsSchema}
            defaults={{
              emailAlerts: data.settings.emailAlerts,
              delayAlerts: data.settings.delayAlerts,
              userRegistrationAlerts: data.settings.userRegistrationAlerts,
              weeklyDigest: data.settings.weeklyDigest,
            }}
            fields={[]}
            checks={[
              ["emailAlerts", "Keep an in-app reminder that email alerts are enabled (no email is sent)"],
              ["delayAlerts", "Create an alert when a project is marked delayed"],
              ["userRegistrationAlerts", "Create an alert when a user is registered"],
              ["weeklyDigest", "Weekly digest preference (not generated in this preview)"],
            ]}
            onSubmit={(values) => save(values, "Notification preferences saved in this preview.")}
          />
        ) : null}
        {tab === "profile" ? (
          <SettingsForm
            key={data.settings.profileName + data.settings.profileEmail}
            schema={profileSchema}
            defaults={{
              profileName: data.settings.profileName,
              profileTitle: data.settings.profileTitle,
              profileEmail: data.settings.profileEmail,
              profilePhone: data.settings.profilePhone,
            }}
            fields={[
              ["profileName", "Name", "text"],
              ["profileTitle", "Title", "text"],
              ["profileEmail", "Email", "email"],
              ["profilePhone", "Phone", "text"],
            ]}
            onSubmit={(values) => save(values, "Profile saved in this preview. This is not an authenticated account.")}
          />
        ) : null}
      </div>
      <div className="mt-4 max-w-3xl rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Reset demonstration data</h2>
        <p className="mt-1 text-sm text-muted-foreground">Clears session edits and restores the original sample portfolio, people, and logs.</p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => {
            data.resetDemo();
            toast.success("Demonstration data restored.");
          }}
        >
          Restore sample data
        </Button>
      </div>
    </div>
  );
}

function SettingsForm<T extends z.ZodType>({
  schema,
  defaults,
  fields,
  checks = [],
  onSubmit,
}: {
  schema: T;
  defaults: z.infer<T>;
  fields: [string, string, string][];
  checks?: [string, string][];
  onSubmit: (values: z.infer<T>) => void;
}) {
  const form = useForm<z.infer<T>>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      {fields.map(([name, label, type]) => (
        <Field key={name} label={label} htmlFor={name} error={errors[name]?.message}>
          <Input id={name} type={type} {...form.register(name as never)} />
        </Field>
      ))}
      {checks.map(([name, label]) => (
        <label key={name} className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-1" {...form.register(name as never)} />
          <span>{label}</span>
        </label>
      ))}
      <div className="sm:col-span-2">
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
