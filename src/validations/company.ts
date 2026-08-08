import { z } from "zod";

/** Launch market. The schema accepts only codes listed here. */
export const SUPPORTED_COUNTRIES = [
  { code: "CM", name: "Cameroon", currency: "XAF", currencyName: "Central African CFA franc" },
] as const;

export const companyInfoSchema = z.object({
  name: z
    .string({ error: "Company name is required" })
    .trim()
    .min(2, "Enter the legal company name")
    .max(120),
  country: z.enum(SUPPORTED_COUNTRIES.map((c) => c.code) as ["CM"], {
    error: "Select a supported country",
  }),
  address: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(200, "Keep the address under 200 characters").optional(),
  ),
  taxId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(64, "Keep the tax ID under 64 characters").optional(),
  ),
});
export type CompanyInfoInput = z.infer<typeof companyInfoSchema>;

/** Money-style decimals arrive as strings from forms; coerce + bound them. */
const boundedDecimal = (opts: { min: number; max: number; decimals: number; label: string }) =>
  z.coerce
    .number({ error: `${opts.label} is required` })
    .min(opts.min, `${opts.label} must be at least ${opts.min}`)
    .max(opts.max, `${opts.label} must be at most ${opts.max}`)
    .refine(
      (v) => Number.isFinite(v) && Math.abs(v * 10 ** opts.decimals - Math.round(v * 10 ** opts.decimals)) < 1e-6,
      `${opts.label} supports at most ${opts.decimals} decimal place${opts.decimals === 1 ? "" : "s"}`,
    );

export const payrollSettingsSchema = z.object({
  payrollFrequency: z.literal("MONTHLY", { error: "Monthly payroll is the supported cadence" }),
  standardHoursPerWeek: boundedDecimal({
    min: 1,
    max: 60,
    decimals: 2,
    label: "Standard hours per week",
  }),
  overtimeMultiplier: boundedDecimal({
    min: 1,
    max: 5,
    decimals: 2,
    label: "Overtime multiplier",
  }),
  /** Entered as a percent (0–100); stored as a fraction (0–1). */
  taxRatePercent: boundedDecimal({ min: 0, max: 100, decimals: 2, label: "Tax rate" }),
});
export type PayrollSettingsInput = z.infer<typeof payrollSettingsSchema>;

const departmentNameSchema = z
  .string()
  .trim()
  .min(2, "Department names need at least 2 characters")
  .max(80, "Keep department names under 80 characters");

export const orgBasicsSchema = z.object({
  departments: z
    .array(departmentNameSchema, { error: "Invalid department list" })
    .max(12, "Add at most 12 departments during setup"),
});
export type OrgBasicsInput = z.infer<typeof orgBasicsSchema>;

/**
 * Dedupes department names case-insensitively, keeping the first spelling.
 * Pure — used by both the service and tests.
 */
export function dedupeCaseInsensitive(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
