import { z } from "zod";
import { emailSchema } from "@/validations/auth";

/**
 * Employee record validation. Money enters as a *whole-XAF integer string* and
 * is stored as a Prisma Decimal — floats never touch compensation data.
 */

const optionalText = (max: number, label: string) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} is too long`)
    .optional()
    .transform((value) => (value ? value : undefined));

/** `YYYY-MM-DD` form dates, timezone-safe (stored as UTC midnight). */
const dateOnlySchema = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must use the YYYY-MM-DD format`)
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), `${label} is not a real date`);

const personNameSchema = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(2, `${label} is too short`)
    .max(80, `${label} is too long`);

/** Whole XAF only — XAF is a zero-decimal currency. 12 digits matches Decimal(12,2). */
export const salarySchema = z
  .string({ error: "Basic salary is required" })
  .trim()
  .regex(/^\d{1,12}$/, "Enter the monthly salary as a whole XAF amount (no decimals)")
  .refine((value) => Number.parseInt(value, 10) >= 0, "Salary cannot be negative");

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"] as const;
export const PAYMENT_METHODS = ["BANK", "MOBILE_MONEY", "CASH"] as const;
/** Cameroon launch market rails. */
export const MOBILE_MONEY_PROVIDERS = ["MTN", "ORANGE"] as const;

/** Personal + job + compensation fields shared by create and edit. */
export const employeeFormSchema = z.object({
  firstName: personNameSchema("First name"),
  lastName: personNameSchema("Last name"),
  dateOfBirth: dateOnlySchema("Date of birth").optional().or(z.literal("").transform(() => undefined)),
  nationalId: optionalText(40, "National ID"),
  phone: optionalText(24, "Phone number"),
  email: z
    .union([emailSchema, z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  positionId: z.string({ error: "Choose a position" }).min(1, "Choose a position"),
  dateHired: dateOnlySchema("Hire date"),
  employmentType: z.enum(EMPLOYMENT_TYPES, { error: "Choose an employment type" }),
  basicSalary: salarySchema,
});
/**
 * Service-boundary input (hand-written): zod's `.optional().transform()` emits
 * required-keys-with-undefined, which is ergonomically wrong for callers — the
 * parsed output of {@link employeeFormSchema} is structurally assignable here.
 */
export interface EmployeeFormInput {
  firstName: string;
  lastName: string;
  dateOfBirth?: string | undefined;
  nationalId?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  positionId: string;
  dateHired: string;
  employmentType: (typeof EMPLOYMENT_TYPES)[number];
  basicSalary: string;
}

/**
 * Payment details. Empty strings mean "keep the stored value" — the service
 * merges with what is already (encrypted) in the database, then validates the
 * completeness of the result per method.
 */
export const paymentDetailsSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Choose a payment method" }),
  bankName: optionalText(120, "Bank name"),
  bankAccountNumber: z
    .string()
    .trim()
    .max(40, "Account number is too long")
    .regex(/^[\dA-Za-z -]*$/, "Account number contains invalid characters")
    .optional()
    .transform((value) => (value ? value : undefined)),
  mobileMoneyProvider: z
    .enum(MOBILE_MONEY_PROVIDERS)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  mobileMoneyNumber: z
    .string()
    .trim()
    .regex(/^[\d+ ]*$/, "Mobile money number must be digits (optionally with + prefix)")
    .max(20, "Mobile money number is too long")
    .optional()
    .transform((value) => (value ? value : undefined)),
});
/** Same reasoning as {@link EmployeeFormInput}. */
export interface PaymentDetailsInput {
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  bankName?: string | undefined;
  bankAccountNumber?: string | undefined;
  mobileMoneyProvider?: (typeof MOBILE_MONEY_PROVIDERS)[number] | undefined;
  mobileMoneyNumber?: string | undefined;
}

export const terminateEmployeeSchema = z.object({
  terminationDate: dateOnlySchema("Termination date"),
});
export type TerminateEmployeeInput = z.infer<typeof terminateEmployeeSchema>;

// ── Directory query ─────────────────────────────────────────────────

export const EMPLOYEE_STATUS_FILTERS = ["ACTIVE", "INACTIVE", "TERMINATED", "ALL"] as const;
export type EmployeeStatusFilter = (typeof EMPLOYEE_STATUS_FILTERS)[number];

export const employeeDirectoryQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(EMPLOYEE_STATUS_FILTERS).catch("ACTIVE"),
  departmentId: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).catch(1),
});
export type EmployeeDirectoryQuery = z.infer<typeof employeeDirectoryQuerySchema>;

export const EMPLOYEE_PAGE_SIZE = 20;
