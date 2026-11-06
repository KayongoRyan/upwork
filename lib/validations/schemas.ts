import { z } from "zod";

const requiredText = (label: string, min = 2) =>
  z.string().trim().min(min, `${label} is required`);

export const projectSchema = z
  .object({
    name: requiredText("Project name", 3),
    code: z
      .string()
      .trim()
      .min(3, "Project code is required")
      .max(16, "Use 16 characters or fewer")
      .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers, and hyphens"),
    description: requiredText("Description", 12),
    client: requiredText("Client name"),
    location: requiredText("Location"),
    managerId: z.string().min(1, "Choose a project manager"),
    startDate: z.string().min(1, "Choose a start date"),
    expectedEndDate: z.string().min(1, "Choose a completion date"),
    budget: z.coerce.number().positive("Budget must be greater than zero"),
    spent: z.coerce.number().min(0, "Spent cannot be negative"),
    progress: z.coerce.number().min(0, "Progress cannot be negative").max(100, "Progress cannot exceed 100"),
    status: z.enum(["planning", "active", "on_hold", "delayed", "completed"]),
  })
  .refine((value) => value.expectedEndDate >= value.startDate, {
    message: "Completion must be on or after the start date",
    path: ["expectedEndDate"],
  });

export const userSchema = z.object({
  firstName: requiredText("First name"),
  lastName: requiredText("Last name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().min(8, "Enter a phone number"),
  role: z.enum(["administrator", "project_manager", "site_engineer", "quantity_surveyor"]),
  projectId: z.string(),
  status: z.enum(["active", "inactive"]),
});

export const employeeSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(3, "Employee ID is required")
    .max(16, "Use 16 characters or fewer"),
  firstName: requiredText("First name"),
  lastName: requiredText("Last name"),
  position: requiredText("Position"),
  department: requiredText("Department"),
  phone: z.string().trim().min(8, "Enter a phone number"),
  email: z.string().trim().email("Enter a valid email"),
  projectId: z.string(),
  status: z.enum(["active", "on_leave", "contract", "inactive"]),
  hiredAt: z.string().min(1, "Choose a hire date"),
});

export const taskSchema = z.object({
  title: requiredText("Task title", 3),
  projectId: z.string().min(1, "Choose a project"),
  assignee: requiredText("Assignee"),
  dueDate: z.string().min(1, "Choose a due date"),
  priority: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["todo", "pending", "done"]),
});

export const organizationSchema = z.object({
  organizationName: requiredText("Organization name", 3),
  registrationNumber: requiredText("Registration number", 3),
  industry: requiredText("Industry"),
  address: requiredText("Address", 4),
  city: requiredText("City"),
  country: requiredText("Country"),
  phone: z.string().trim().min(8, "Enter a phone number"),
  email: z.string().trim().email("Enter a valid email"),
  website: z.string().trim(),
});

export const preferencesSchema = z.object({
  timezone: requiredText("Timezone"),
  dateFormat: requiredText("Date format"),
  currency: z.string().trim().min(3, "Use a 3-letter currency code").max(3),
  language: requiredText("Language"),
  compactTables: z.boolean(),
});

export const notificationPrefsSchema = z.object({
  emailAlerts: z.boolean(),
  delayAlerts: z.boolean(),
  userRegistrationAlerts: z.boolean(),
  weeklyDigest: z.boolean(),
});

export const profileSchema = z.object({
  profileName: requiredText("Name", 3),
  profileTitle: requiredText("Title"),
  profileEmail: z.string().trim().email("Enter a valid email"),
  profilePhone: z.string().trim().min(8, "Enter a phone number"),
});

export const supportSchema = z.object({
  topic: z.enum(["access", "project", "data", "other"]),
  message: requiredText("Message", 12),
});

export type ProjectFormValues = z.infer<typeof projectSchema>;
export type UserFormValues = z.infer<typeof userSchema>;
export type EmployeeFormValues = z.infer<typeof employeeSchema>;
export type TaskFormValues = z.infer<typeof taskSchema>;
