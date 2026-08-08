/**
 * Unit tests for the pure payroll engine (spec §17 formula). Golden values
 * below are hand-computed from the formula — never floats — so any drift in
 * the engine, the OT recomputation rule, or the rounding mode fails loudly.
 */
import { describe, expect, it } from "vitest";
import {
  computePayslipAmounts,
  selectEligibleEmployees,
  summarizeRun,
  type EngineAdjustment,
  type EngineEmployee,
  type EngineSettings,
  type PayslipAmounts,
} from "@/server/payroll/engine";
import { overtimePayForHours, roundWholeXaf } from "@/server/payroll/money";

const SETTINGS: EngineSettings = {
  standardHoursPerWeek: "40",
  overtimeMultiplier: "1.25",
  taxRate: "0.045", // 4.5% flat rule
};

function employee(partial: Partial<EngineEmployee> = {}): EngineEmployee {
  return {
    id: "emp-1",
    employeeCode: "PB-0001",
    firstName: "Amina",
    lastName: "Ngo Bell",
    employmentType: "FULL_TIME",
    status: "ACTIVE",
    dateHired: new Date("2026-01-05T00:00:00Z"),
    terminationDate: null,
    basicSalary: "850000",
    ...partial,
  };
}

function adjustment(partial: Partial<EngineAdjustment> = {}): EngineAdjustment {
  return {
    employeeId: "emp-1",
    type: "BONUS",
    amount: "0",
    hours: null,
    ...partial,
  };
}

describe("roundWholeXaf (half-up, whole XAF)", () => {
  it("rounds ties away from zero", () => {
    expect(roundWholeXaf("500.5")).toBe("501");
    expect(roundWholeXaf("500.499")).toBe("500");
    expect(roundWholeXaf("-12.5")).toBe("-13");
    expect(roundWholeXaf("0.4")).toBe("0");
  });
});

describe("overtimePayForHours", () => {
  it("applies the spec formula: hours × rate × multiplier", () => {
    // 850000 / (40×52/12) = 4903.846153… × 7.5 × 1.25 = 45973.5576923… → 45974
    expect(overtimePayForHours("850000", "7.5", "40", "1.25")).toBe("45974");
  });
  it("never crashes on zero weekly hours or zero worked hours", () => {
    expect(overtimePayForHours("100000", "5", "0", "1.25")).toBe("0");
    expect(overtimePayForHours("100000", "0", "40", "1.25")).toBe("0");
  });
});

describe("computePayslipAmounts — the golden worked example", () => {
  // basic 850000 · OT 7.5h @40h/wk ×1.25 · bonus 50000 · tax 4.5%
  it("computes every line exactly", () => {
    const result = computePayslipAmounts(
      employee(),
      [
        adjustment({ type: "OVERTIME", hours: "7.5", amount: "99999" }), // stale amount ignored
        adjustment({ type: "BONUS", amount: "50000" }),
      ],
      SETTINGS,
    );
    expect(result.basicSalary).toBe("850000");
    expect(result.overtimePay).toBe("45974"); // recomputed from hours
    expect(result.bonuses).toBe("50000");
    expect(result.allowances).toBe("0");
    expect(result.grossSalary).toBe("945974");
    expect(result.tax).toBe("42569"); // 945974 × 0.045 = 42568.83 → 42569
    expect(result.deductions).toBe("42569");
    expect(result.netSalary).toBe("903405"); // 945974 − 42568.83 = 903405.17 → 903405
  });

  it("keeps gross = basic + OT + bonuses + allowances and net = gross − deductions", () => {
    const result = computePayslipAmounts(
      employee({ basicSalary: "1200000" }),
      [
        adjustment({ type: "BONUS", amount: "25000" }),
        adjustment({ type: "TRANSPORT", amount: "30000" }),
        adjustment({ type: "MEAL", amount: "12000" }),
        adjustment({ type: "LOAN", amount: "60000" }),
        adjustment({ type: "ADVANCE", amount: "40000" }),
        adjustment({ type: "PENALTY", amount: "5000" }),
        adjustment({ type: "OTHER_DEDUCTION", amount: "3000" }),
        adjustment({ type: "TAX", amount: "2000" }),
        adjustment({ type: "PENALTY", amount: "700", employeeId: "someone-else" }), // ignored
      ],
      SETTINGS,
    );
    // gross = 1200000 + 25000 + 42000 = 1267000
    expect(result.grossSalary).toBe("1267000");
    expect(result.allowances).toBe("42000"); // 30000 + 12000
    // tax = 1267000 × 0.045 = 57015 exactly
    expect(result.tax).toBe("57015");
    // deductions = 60000+40000+5000+3000+2000 + 57015 = 167015
    expect(result.deductions).toBe("167015");
    expect(result.netSalary).toBe("1099985"); // 1267000 − 167015
    expect(result.loan).toBe("60000");
    expect(result.advance).toBe("40000");
    expect(result.penalty).toBe("5000");
    expect(result.otherDeductions).toBe("3000");
    expect(result.extraTax).toBe("2000");
  });

  it("rounds a 0.5 tax tie half-up", () => {
    const result = computePayslipAmounts(
      employee({ basicSalary: "5" }),
      [],
      { standardHoursPerWeek: "40", overtimeMultiplier: "1.25", taxRate: "0.1" },
    );
    expect(result.tax).toBe("1"); // 5 × 0.1 = 0.5 → 1
    expect(result.netSalary).toBe("4");
  });

  it("supports a zero-tax company", () => {
    const result = computePayslipAmounts(
      employee({ basicSalary: "1200000" }),
      [],
      { ...SETTINGS, taxRate: "0" },
    );
    expect(result.tax).toBe("0");
    expect(result.deductions).toBe("0");
    expect(result.netSalary).toBe("1200000");
  });
});

describe("computePayslipAmounts — overtime semantics", () => {
  it("recomputes hours-rows from the CURRENT salary (stale amounts ignored)", () => {
    const result = computePayslipAmounts(
      employee(),
      [adjustment({ type: "OVERTIME", hours: "7.5", amount: "12000" })],
      SETTINGS,
    );
    expect(result.overtimePay).toBe("45974");
  });

  it("falls back to the stored amount when hours are missing", () => {
    const result = computePayslipAmounts(
      employee(),
      [adjustment({ type: "OVERTIME", hours: null, amount: "12000" })],
      SETTINGS,
    );
    expect(result.overtimePay).toBe("12000");
    // gross still flows: 850000 + 12000 → tax 4.5% of 862000 = 38790
    expect(result.grossSalary).toBe("862000");
    expect(result.tax).toBe("38790");
  });

  it("sums several overtime rows", () => {
    const result = computePayslipAmounts(
      employee(),
      [
        adjustment({ type: "OVERTIME", hours: "7.5" }),
        adjustment({ type: "OVERTIME", hours: null, amount: "10000" }),
      ],
      SETTINGS,
    );
    expect(result.overtimePay).toBe("55974"); // 45974 + 10000
  });

  it("treats an hours-row as zero when weekly hours are misconfigured", () => {
    const result = computePayslipAmounts(
      employee(),
      [adjustment({ type: "OVERTIME", hours: "7.5" })],
      { standardHoursPerWeek: "0", overtimeMultiplier: "1.25", taxRate: "0.045" },
    );
    expect(result.overtimePay).toBe("0");
    expect(result.grossSalary).toBe("850000");
  });
});

describe("computePayslipAmounts — guards", () => {
  it("rejects negative basic salary", () => {
    expect(() => computePayslipAmounts(employee({ basicSalary: "-1" }), [], SETTINGS)).toThrow(
      /Negative basic salary/,
    );
  });
  it("rejects negative adjustments", () => {
    expect(() =>
      computePayslipAmounts(employee(), [adjustment({ type: "BONUS", amount: "-50" })], SETTINGS),
    ).toThrow(/Negative adjustment/);
  });
});

describe("selectEligibleEmployees", () => {
  const start = new Date("2026-08-01T00:00:00Z");
  const end = new Date("2026-08-31T00:00:00Z");

  it("keeps active employees hired on/before the period end with salary > 0", () => {
    const pool = [
      employee({ id: "a" }),
      employee({ id: "b", status: "INACTIVE" }),
      employee({ id: "c", dateHired: new Date("2026-09-01T00:00:00Z") }),
      employee({
        id: "d",
        status: "TERMINATED",
        terminationDate: new Date("2026-08-15T00:00:00Z"),
      }),
      employee({
        id: "e",
        status: "TERMINATED",
        terminationDate: new Date("2026-07-15T00:00:00Z"),
      }),
      employee({ id: "f", basicSalary: "0" }),
    ];
    expect(selectEligibleEmployees(pool, start, end).map((row) => row.id)).toEqual(["a", "d"]);
  });
});

describe("summarizeRun", () => {
  const row = (gross: string, deductions: string, net: string): PayslipAmounts => ({
    basicSalary: "0",
    overtimePay: "0",
    bonuses: "0",
    allowances: "0",
    grossSalary: gross,
    tax: "0",
    deductions,
    netSalary: net,
  });

  it("rolls up payslip amounts", () => {
    const totals = summarizeRun([
      row("945974", "42569", "903405"),
      row("1200000", "54000", "1146000"),
    ]);
    expect(totals).toEqual({
      totalEmployees: 2,
      totalGross: "2145974",
      totalDeductions: "96569",
      totalNet: "2049405",
    });
  });

  it("returns zeros for an empty run", () => {
    expect(summarizeRun([])).toEqual({
      totalEmployees: 0,
      totalGross: "0",
      totalDeductions: "0",
      totalNet: "0",
    });
  });
});
