/**
 * Unit tests for payroll adjustments: type→category derivation, editability
 * window, and the form schema (amount rules, overtime-requires-hours).
 */
import { describe, expect, it } from "vitest";
import type { PayrollPeriodStatus } from "@prisma/client";
import {
  adjustmentsEditable,
  assertAdjustmentsEditable,
} from "@/server/services/adjustment.service";
import {
  ADJUSTMENT_TYPES,
  DEDUCTION_TYPES,
  EARNING_TYPES,
  adjustmentFormSchema,
  categoryOf,
} from "@/validations/adjustment";

describe("type → category derivation", () => {
  it("maps every type to exactly one category", () => {
    for (const type of EARNING_TYPES) expect(categoryOf(type)).toBe("EARNING");
    for (const type of DEDUCTION_TYPES) expect(categoryOf(type)).toBe("DEDUCTION");
    expect(ADJUSTMENT_TYPES).toHaveLength(9);
  });
});

describe("editability window", () => {
  it("is editable in DRAFT and READY only", () => {
    const expected: Record<PayrollPeriodStatus, boolean> = {
      DRAFT: true,
      IN_PROGRESS: false,
      READY: true,
      SUBMITTED: false,
      APPROVED: false,
      PAID: false,
      LOCKED: false,
    };
    for (const status of Object.keys(expected) as PayrollPeriodStatus[]) {
      expect(adjustmentsEditable(status), status).toBe(expected[status]);
    }
  });
  it("explains temporary vs permanent locks", () => {
    expect(() => assertAdjustmentsEditable("IN_PROGRESS", "August 2026")).toThrowError(
      /being processed right now/,
    );
    expect(() => assertAdjustmentsEditable("SUBMITTED", "August 2026")).toThrowError(
      /adjustments are locked once a period is submitted/,
    );
    assertAdjustmentsEditable("READY", "August 2026"); // does not throw
  });
});

describe("adjustment form schema", () => {
  const base = { employeeId: "emp_1", type: "BONUS", amount: "25000" };

  it("accepts a basic earning with note normalization", () => {
    const parsed = adjustmentFormSchema.parse({ ...base, hours: "", note: "" });
    expect(parsed.amount).toBe("25000");
    expect(parsed.hours).toBeUndefined();
    expect(parsed.note).toBeUndefined();
  });

  it("requires strictly positive whole-XAF amounts", () => {
    expect(adjustmentFormSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(adjustmentFormSchema.safeParse({ ...base, amount: "-500" }).success).toBe(false);
    expect(adjustmentFormSchema.safeParse({ ...base, amount: "100.5" }).success).toBe(false);
    expect(adjustmentFormSchema.safeParse({ ...base, amount: "1" }).success).toBe(true);
  });

  it("overtime needs hours but no amount (computed); everything else needs an amount", () => {
    const overtimeWithoutHours = adjustmentFormSchema.safeParse({ ...base, type: "OVERTIME" });
    expect(overtimeWithoutHours.success).toBe(false);
    if (!overtimeWithoutHours.success) {
      expect(overtimeWithoutHours.error.issues[0]?.path).toEqual(["hours"]);
    }
    // hours-only overtime: the amount is computed server-side
    const overtime = adjustmentFormSchema.safeParse({ type: "OVERTIME", employeeId: "emp_1", hours: "6.5" });
    expect(overtime.success).toBe(true);

    const bonusWithoutAmount = adjustmentFormSchema.safeParse({ employeeId: "emp_1", type: "BONUS" });
    expect(bonusWithoutAmount.success).toBe(false);
    if (!bonusWithoutAmount.success) {
      expect(bonusWithoutAmount.error.issues[0]?.path).toEqual(["amount"]);
    }
    expect(
      adjustmentFormSchema.safeParse({ ...base, type: "BONUS", hours: "3" }).success,
    ).toBe(false);
  });

  it("validates hour formats", () => {
    expect(adjustmentFormSchema.safeParse({ ...base, type: "OVERTIME", hours: "0" }).success).toBe(false);
    expect(adjustmentFormSchema.safeParse({ ...base, type: "OVERTIME", hours: "abc" }).success).toBe(false);
    expect(adjustmentFormSchema.safeParse({ ...base, type: "OVERTIME", hours: "12.75" }).success).toBe(true);
  });
});

describe("overtime money math (shared with the engine)", () => {
  it("computes hours × rate × multiplier with whole-XAF half-up rounding", async () => {
    const { overtimePayForHours, roundWholeXaf } = await import("@/server/payroll/money");
    // 300 000 / (40×52/12) = 1 730.7692…; ×6.5 = 11 250; ×1.2 = 13 500 exactly
    expect(overtimePayForHours("300000", "6.5", "40", "1.2")).toBe("13500");
    // 1 200 000 × 12 / 2080 × 7.5 × 1.25 = 64 903.846… → 64 904 (half-up)
    expect(overtimePayForHours("1200000", "7.5", "40", "1.25")).toBe("64904");
    expect(roundWholeXaf("64903.846")).toBe("64904");
    expect(roundWholeXaf("100.4")).toBe("100");
  });

  it("guards zero hours and divide-by-zero weekly hours", async () => {
    const { overtimePayForHours } = await import("@/server/payroll/money");
    expect(overtimePayForHours("300000", "0", "40", "1.2")).toBe("0");
    expect(overtimePayForHours("300000", "5", "0", "1.2")).toBe("0");
  });
});
