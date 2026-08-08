/**
 * Unit tests for the payroll period domain: state machine matrix, date-range
 * predicates, exclusion reasons, and the creation schema. No database.
 */
import { describe, expect, it } from "vitest";
import type { PayrollPeriodStatus } from "@prisma/client";
import {
  PERIOD_TRANSITIONS,
  PREP_STATUSES,
  SYSTEM_TRANSITIONS,
  assertTransition,
  canTransition,
  isPrepStatus,
  transitionPermission,
} from "@/server/payroll/state-machine";
import {
  exclusionReason,
  periodLabel,
  rangesOverlap,
} from "@/server/services/payroll-period.service";
import { createPeriodSchema } from "@/validations/payroll";

describe("period state machine", () => {
  const statuses: PayrollPeriodStatus[] = [
    "DRAFT",
    "IN_PROGRESS",
    "READY",
    "SUBMITTED",
    "APPROVED",
    "PAID",
    "LOCKED",
  ];

  it("allows exactly the documented transitions", () => {
    const allowed: Array<[PayrollPeriodStatus, PayrollPeriodStatus]> = [
      ["DRAFT", "IN_PROGRESS"],
      ["IN_PROGRESS", "READY"],
      ["IN_PROGRESS", "DRAFT"], // system rollback after a failed run
      ["READY", "SUBMITTED"],
      ["READY", "IN_PROGRESS"], // idempotent re-process
      ["SUBMITTED", "APPROVED"],
      ["APPROVED", "READY"], // unlock
      ["APPROVED", "PAID"],
      ["PAID", "LOCKED"],
    ];
    for (const from of statuses) {
      for (const to of statuses) {
        const should = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(should);
      }
    }
    // the matrix is complete for the enum
    expect(Object.keys(PERIOD_TRANSITIONS).sort()).toEqual(statuses.sort());
  });

  it("maps each transition to its permission", () => {
    expect(transitionPermission("DRAFT", "IN_PROGRESS")).toBe("payroll.process");
    expect(transitionPermission("IN_PROGRESS", "READY")).toBe("payroll.process");
    expect(transitionPermission("READY", "IN_PROGRESS")).toBe("payroll.process");
    expect(transitionPermission("READY", "SUBMITTED")).toBe("payroll.submit");
    expect(transitionPermission("SUBMITTED", "APPROVED")).toBe("payroll.approve");
    expect(transitionPermission("APPROVED", "READY")).toBe("payroll.unlock");
    expect(transitionPermission("APPROVED", "PAID")).toBe("payments.manage");
    expect(transitionPermission("PAID", "LOCKED")).toBe("payroll.approve");
  });

  it("flags only the failure rollback as a system edge", () => {
    expect(SYSTEM_TRANSITIONS.has("IN_PROGRESS->DRAFT")).toBe(true);
    expect(SYSTEM_TRANSITIONS.has("READY->IN_PROGRESS")).toBe(false); // user-driven reprocess
    expect(SYSTEM_TRANSITIONS.has("APPROVED->READY")).toBe(false); // user-driven unlock
  });

  it("assertTransition rejects with a readable reason", () => {
    expect(() => assertTransition("DRAFT", "READY")).toThrowError(/cannot move from DRAFT to READY/);
    expect(() => assertTransition("LOCKED", "DRAFT")).toThrowError(/none \(locked\)/);
    expect(() => assertTransition("PAID", "READY")).toThrowError();
    assertTransition("READY", "SUBMITTED"); // does not throw
    assertTransition("READY", "IN_PROGRESS"); // reprocess does not throw
  });

  it("tracks the single-active-prep window", () => {
    expect(PREP_STATUSES).toEqual(["DRAFT", "IN_PROGRESS", "READY"]);
    expect(isPrepStatus("DRAFT")).toBe(true);
    expect(isPrepStatus("READY")).toBe(true);
    expect(isPrepStatus("SUBMITTED")).toBe(false);
    expect(isPrepStatus("LOCKED")).toBe(false);
  });
});

describe("date range overlap (day-inclusive)", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  it("treats shared boundary days as overlapping", () => {
    expect(rangesOverlap(d("2026-08-31"), d("2026-09-30"), d("2026-08-01"), d("2026-08-31"))).toBe(true);
    expect(rangesOverlap(d("2026-08-01"), d("2026-08-31"), d("2026-08-31"), d("2026-09-30"))).toBe(true);
  });
  it("treats fully disjoint ranges as free", () => {
    expect(rangesOverlap(d("2026-09-01"), d("2026-09-30"), d("2026-08-01"), d("2026-08-31"))).toBe(false);
    expect(rangesOverlap(d("2026-06-01"), d("2026-06-30"), d("2026-08-01"), d("2026-08-31"))).toBe(false);
  });
  it("treats containment both ways as overlapping", () => {
    expect(rangesOverlap(d("2026-08-10"), d("2026-08-15"), d("2026-08-01"), d("2026-08-31"))).toBe(true);
    expect(rangesOverlap(d("2026-08-01"), d("2026-08-31"), d("2026-08-10"), d("2026-08-15"))).toBe(true);
  });
});

describe("period label", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  it("uses the month name for whole-month periods", () => {
    expect(periodLabel(d("2026-08-01"), d("2026-08-31"))).toBe("August 2026");
    expect(periodLabel(d("2026-12-15"), d("2026-12-31"))).toBe("December 2026"); // same month = same label
  });
  it("uses an explicit range across months", () => {
    // en-GB Intl renders September as "Sept"
    expect(periodLabel(d("2026-06-15"), d("2026-09-15"))).toBe("15 Jun 2026 – 15 Sept 2026");
  });
});

describe("exclusion reasons", () => {
  const start = new Date("2026-08-01T00:00:00Z");
  const end = new Date("2026-08-31T00:00:00Z");
  const base = {
    status: "ACTIVE" as const,
    dateHired: new Date("2026-01-01T00:00:00Z"),
    terminationDate: null,
    basicSalary: "100000",
  };

  it("returns null for eligible employees", () => {
    expect(exclusionReason(base, start, end)).toBeNull();
  });
  it("labels each exclusion class", () => {
    expect(exclusionReason({ ...base, status: "INACTIVE" }, start, end)).toBe("INACTIVE");
    expect(
      exclusionReason({ ...base, dateHired: new Date("2026-09-05T00:00:00Z") }, start, end),
    ).toBe("HIRED_AFTER_PERIOD");
    expect(
      exclusionReason(
        {
          ...base,
          status: "TERMINATED" as const,
          terminationDate: new Date("2026-07-20T00:00:00Z"),
        },
        start,
        end,
      ),
    ).toBe("TERMINATED_BEFORE_PERIOD");
    expect(exclusionReason({ ...base, basicSalary: "0" }, start, end)).toBe("ZERO_SALARY");
  });
});

describe("create period schema", () => {
  const valid = { startDate: "2026-08-01", endDate: "2026-08-31", payDate: "2026-09-05" };

  it("accepts a sane period", () => {
    const parsed = createPeriodSchema.parse(valid);
    expect(parsed.startDate).toBe("2026-08-01");
  });
  it("requires endDate on/after startDate", () => {
    const result = createPeriodSchema.safeParse({ ...valid, endDate: "2026-07-30" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["endDate"]);
    }
  });
  it("requires payDate on/after endDate", () => {
    const result = createPeriodSchema.safeParse({ ...valid, payDate: "2026-08-30" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["payDate"]);
    }
  });
  it("allows payDate equal to endDate", () => {
    expect(createPeriodSchema.safeParse({ ...valid, payDate: "2026-08-31" }).success).toBe(true);
  });
  it("rejects absurd spans and malformed dates", () => {
    expect(
      createPeriodSchema.safeParse({
        startDate: "2026-01-01",
        endDate: "2027-06-01",
        payDate: "2027-06-05",
      }).success,
    ).toBe(false);
    expect(createPeriodSchema.safeParse({ ...valid, startDate: "1 Aug 2026" }).success).toBe(false);
  });
});
