import { describe, expect, it } from "vitest";
import { REPORT_TYPES } from "@/server/services/report.service";
import { FINALIZED_STATUSES } from "@/server/services/report.service";

describe("reports (P13) constants", () => {
  it("has 7 report types", () => {
    expect(REPORT_TYPES).toHaveLength(7);
    expect(REPORT_TYPES).toEqual(
      expect.arrayContaining([
        "summary",
        "by-dept",
        "trend",
        "overtime",
        "bonuses",
        "deductions",
        "per-employee",
      ]),
    );
  });

  it("finalized statuses are APPROVED/PAID/LOCKED only", () => {
    expect(FINALIZED_STATUSES).toEqual(["APPROVED", "PAID", "LOCKED"]);
    // DRAFT, READY, SUBMITTED must not be included
    expect(FINALIZED_STATUSES).not.toContain("DRAFT");
    expect(FINALIZED_STATUSES).not.toContain("READY");
    expect(FINALIZED_STATUSES).not.toContain("SUBMITTED");
  });
});

describe("report filters", () => {
  it("reconciles totals via whole-XAF rounding", async () => {
    const { roundWholeXaf } = await import("@/server/payroll/money");
    // Simulate two payslips: gross 945974 + 1200000 = 2145974 (as in processing integration)
    const gross1 = "945974";
    const gross2 = "1200000";
    const Big = (await import("big.js")).default;
    let sum = new Big(0);
    sum = sum.plus(gross1).plus(gross2);
    expect(roundWholeXaf(sum)).toBe("2145974");
  });
});

describe("excel export", () => {
  it("builds an XLSX buffer for summary", async () => {
    const { buildExcelReport } = await import("@/server/reports/excel");

    // Use isolated test DB if RUN_DB_TESTS, otherwise just test builder with empty data
    const fakeSummary = {
      periods: [],
      kpis: {
        totalPeriods: 0,
        totalGross: "0",
        totalDeductions: "0",
        totalNet: "0",
        avgNet: "0",
        totalEmployeesPaid: 0,
      },
    } as any;

    const { buffer, filename } = await buildExcelReport("summary", fakeSummary, {
      companyName: "Test Co",
      filtersLabel: "All finalized",
    });
    expect(buffer.length).toBeGreaterThan(5000);
    expect(filename).toMatch(/payflow-summary-.*\.xlsx/);
  });
});
