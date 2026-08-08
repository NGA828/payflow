import { z } from "zod";

/** Payroll period creation. Dates arrive as `YYYY-MM-DD` and are stored UTC. */

const dateOnly = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must use the YYYY-MM-DD format`)
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), `${label} is not a real date`);

const DAY_MS = 24 * 60 * 60 * 1000;
/** Guard against typos like entering the wrong year — legit periods are never near a year long. */
const MAX_PERIOD_DAYS = 366;

export const createPeriodSchema = z
  .object({
    startDate: dateOnly("Start date"),
    endDate: dateOnly("End date"),
    payDate: dateOnly("Pay date"),
    notes: z
      .string()
      .trim()
      .max(500, "Keep notes under 500 characters")
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .superRefine((value, ctx) => {
    const start = Date.parse(`${value.startDate}T00:00:00Z`);
    const end = Date.parse(`${value.endDate}T00:00:00Z`);
    const pay = Date.parse(`${value.payDate}T00:00:00Z`);
    if (end < start) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date" });
    } else if ((end - start) / DAY_MS + 1 > MAX_PERIOD_DAYS) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Payroll periods cannot span more than a year" });
    }
    if (pay < end) {
      ctx.addIssue({ code: "custom", path: ["payDate"], message: "Pay date must be on or after the period end" });
    }
  });

/** Same hand-written-input rationale as the employee schemas. */
export interface CreatePeriodInput {
  startDate: string;
  endDate: string;
  payDate: string;
  notes?: string | undefined;
}
