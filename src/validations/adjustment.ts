import { z } from "zod";
import type { AdjustmentCategory, AdjustmentType } from "@prisma/client";

/**
 * Payroll adjustments (P7). The category is DERIVED from the type — a debt
 * type can never be saved as an earning. Amounts are whole-XAF integers;
 * OVERTIME additionally requires positive hours (engine: hours × rate ×
 * multiplier).
 */

export const EARNING_TYPES = ["OVERTIME", "BONUS", "TRANSPORT", "MEAL"] as const;
export const DEDUCTION_TYPES = ["LOAN", "ADVANCE", "PENALTY", "OTHER_DEDUCTION", "TAX"] as const;
export const ADJUSTMENT_TYPES = [...EARNING_TYPES, ...DEDUCTION_TYPES] as const;

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  OVERTIME: "Overtime",
  BONUS: "Bonus",
  TRANSPORT: "Transport allowance",
  MEAL: "Meal allowance",
  LOAN: "Loan repayment",
  ADVANCE: "Salary advance",
  PENALTY: "Penalty",
  OTHER_DEDUCTION: "Other deduction",
  TAX: "Extra tax",
};

const CATEGORY_OF: Record<AdjustmentType, AdjustmentCategory> = {
  OVERTIME: "EARNING",
  BONUS: "EARNING",
  TRANSPORT: "EARNING",
  MEAL: "EARNING",
  LOAN: "DEDUCTION",
  ADVANCE: "DEDUCTION",
  PENALTY: "DEDUCTION",
  OTHER_DEDUCTION: "DEDUCTION",
  TAX: "DEDUCTION",
};

export function categoryOf(type: AdjustmentType): AdjustmentCategory {
  return CATEGORY_OF[type];
}

const amountSchema = z
  .string({ error: "Amount is required" })
  .trim()
  .regex(/^\d{1,12}$/, "Enter a whole XAF amount (no decimals)")
  .refine((value) => Number.parseInt(value, 10) > 0, "Amount must be greater than zero");

const hoursSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Hours must be a positive number like 6 or 6.5")
  .refine((value) => Number.parseFloat(value) > 0, "Hours must be greater than zero");

export const adjustmentFormSchema = z
  .object({
    employeeId: z.string({ error: "Choose an employee" }).min(1, "Choose an employee"),
    type: z.enum(ADJUSTMENT_TYPES, { error: "Choose an adjustment type" }),
    // Overtime amounts are computed (hours × rate × multiplier); the client
    // submits nothing. All other types require an explicit amount.
    amount: z
      .union([amountSchema, z.literal("")])
      .optional()
      .transform((value) => (value ? value : undefined)),
    hours: z
      .union([hoursSchema, z.literal("")])
      .optional()
      .transform((value) => (value ? value : undefined)),
    note: z
      .string()
      .trim()
      .max(200, "Keep the note under 200 characters")
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .superRefine((value, ctx) => {
    if (value.type === "OVERTIME") {
      if (!value.hours) {
        ctx.addIssue({ code: "custom", path: ["hours"], message: "Overtime needs the hours worked" });
      }
      return;
    }
    if (!value.amount) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter the amount in XAF" });
    }
    if (value.hours) {
      ctx.addIssue({ code: "custom", path: ["hours"], message: "Only overtime carries hours" });
    }
  });

/** Hand-written service input (see employee schemas for the rationale). */
export interface AdjustmentFormInput {
  employeeId: string;
  type: AdjustmentType;
  /** Present for every type except OVERTIME (which the service computes). */
  amount?: string | undefined;
  hours?: string | undefined;
  note?: string | undefined;
}
