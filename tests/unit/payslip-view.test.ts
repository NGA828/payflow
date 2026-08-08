/**
 * Payslip PDF content model: labels, rounding, footing to the stored
 * columns, watermarks, date/percent formatting — plus a renderToBuffer
 * smoke test that proves the branded document compiles to a real PDF.
 */
import { describe, expect, it } from "vitest";
import {
  buildPayslipView,
  effectiveTaxRateLabel,
  formatMoneyPdf,
  formatPeriodRange,
  type PayslipViewInput,
} from "@/server/payslips/payslip-view";
import { renderPayslipPdf } from "@/server/payslips/payslip-document";

function baseInput(overrides: Partial<PayslipViewInput> = {}): PayslipViewInput {
  return {
    company: {
      name: "E2E Check SARL",
      address: "Mile 4 Nkwen, Bamenda",
      taxId: "M042612345678A",
      countryName: "Cameroon",
      currency: "XAF",
    },
    period: {
      name: "August 2026",
      startDate: new Date("2026-08-01T00:00:00Z"),
      endDate: new Date("2026-08-31T00:00:00Z"),
      payDate: new Date("2026-09-05T00:00:00Z"),
    },
    payslip: {
      payslipNumber: "PS-2026-00001",
      status: "APPROVED",
      basicSalary: "850000",
      overtimePay: "0",
      grossSalary: "900000",
      tax: "40500",
      deductions: "40500",
      netSalary: "859500",
    },
    employee: {
      fullName: "Amina Ngo Bell",
      employeeCode: "PB-0001",
      departmentName: "Operations",
      positionName: "Ops Manager",
    },
    settings: { overtimeMultiplier: "1.25" },
    adjustments: [
      {
        type: "BONUS",
        category: "EARNING",
        amount: "50000",
        hours: null,
        note: "Retention bonus",
      },
    ],
    generatedAt: new Date("2026-08-08T10:00:00Z"),
    ...overrides,
  };
}

describe("payslip pdf formatting helpers", () => {
  it("groups whole XAF with no-break spaces (never U+202F in PDFs)", () => {
    expect(formatMoneyPdf("900000")).toBe("900 000");
    expect(formatMoneyPdf("1264904")).toBe("1 264 904");
    expect(formatMoneyPdf("0")).toBe("0");
    expect(formatMoneyPdf("859500")).not.toContain(" ");
  });

  it("derives the effective tax rate from the stored payslip", () => {
    expect(effectiveTaxRateLabel("40500", "900000")).toBe("4.5%");
    expect(effectiveTaxRateLabel("6750", "150000")).toBe("4.5%");
    expect(effectiveTaxRateLabel("0", "900000")).toBe("0%");
    expect(effectiveTaxRateLabel("40500", "0")).toBe("0%");
    expect(effectiveTaxRateLabel("12333.34", "999999")).toBe("1.23%");
  });

  it("formats period ranges compactly within one month and across months", () => {
    expect(
      formatPeriodRange(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-31T00:00:00Z")),
    ).toBe("1 – 31 Aug 2026");
    expect(
      formatPeriodRange(new Date("2026-07-26T00:00:00Z"), new Date("2026-08-01T00:00:00Z")),
    ).toBe("26 Jul – 01 Aug 2026");
  });
});

describe("buildPayslipView", () => {
  it("builds the full branded model for an approved payslip (Amina, August)", () => {
    const view = buildPayslipView(baseInput());
    expect(view.companyName).toBe("E2E Check SARL");
    expect(view.companySubline).toBe("Mile 4 Nkwen, Bamenda · Cameroon · Tax ID M042612345678A");
    expect(view.payslipNumber).toBe("PS-2026-00001");
    expect(view.watermark).toBeNull();
    expect(view.employeeLine).toBe("Amina Ngo Bell · PB-0001");
    expect(view.orgLine).toBe("Operations · Ops Manager");
    expect(view.periodLine).toBe("1 – 31 Aug 2026 · 05 Sept 2026"); // ICU: en-GB → "Sept"
    expect(view.earnings).toEqual([
      { label: "Basic salary", amount: "850 000" },
      { label: "Retention bonus", amount: "50 000" },
    ]);
    expect(view.gross).toBe("900 000");
    expect(view.deductions).toEqual([{ label: "Income tax (4.5%)", amount: "40 500" }]);
    expect(view.totalDeductions).toBe("40 500");
    expect(view.net).toBe("859 500");
    expect(view.currency).toBe("XAF");
    expect(view.generatedLine).toBe("Generated 08 Aug 2026");
    expect(view.stale).toBe(false);
  });

  it("collapses overtime rows into one annotated line (Boris)", () => {
    const view = buildPayslipView(
      baseInput({
        payslip: {
          payslipNumber: "PS-2026-00002",
          status: "APPROVED",
          basicSalary: "1200000",
          overtimePay: "64904",
          grossSalary: "1264904",
          tax: "56921",
          deductions: "56921",
          netSalary: "1207983",
        },
        adjustments: [
          {
            type: "OVERTIME",
            category: "EARNING",
            amount: "64904",
            hours: "7.5",
            note: "Release weekend",
          },
        ],
      }),
    );
    expect(view.earnings).toEqual([
      { label: "Basic salary", amount: "1 200 000" },
      { label: "Overtime · 7.5 h × 1.25", amount: "64 904" },
    ]);
    expect(view.stale).toBe(false);
  });

  it("sums hours across multiple overtime rows for the annotation", () => {
    const view = buildPayslipView(
      baseInput({
        adjustments: [
          { type: "OVERTIME", category: "EARNING", amount: "30000", hours: "3", note: null },
          { type: "OVERTIME", category: "EARNING", amount: "20000", hours: "2", note: null },
        ],
        payslip: {
          ...baseInput().payslip,
          overtimePay: "50000",
        },
      }),
    );
    expect(view.earnings[1]?.label).toBe("Overtime · 5 h × 1.25");
  });

  it("uses fallback labels when the note is empty, notes otherwise (Dylan)", () => {
    const view = buildPayslipView(
      baseInput({
        payslip: {
          payslipNumber: "PS-2026-00003",
          status: "APPROVED",
          basicSalary: "150000",
          overtimePay: "0",
          grossSalary: "150000",
          tax: "6750",
          deductions: "26750",
          netSalary: "123250",
        },
        adjustments: [
          { type: "ADVANCE", category: "DEDUCTION", amount: "20000", hours: null, note: null },
          { type: "PENALTY", category: "DEDUCTION", amount: "0", hours: null, note: null },
        ],
      }),
    );
    expect(view.deductions.map((l) => l.label)).toEqual([
      "Income tax (4.5%)",
      "Salary advance repayment",
      "Penalty",
    ]);
    expect(view.totalDeductions).toBe("26 750");
    expect(view.stale).toBe(false);
  });

  it("flags stale documents when adjustments no longer foot to stored columns", () => {
    const stale = buildPayslipView(baseInput({ adjustments: [] }));
    expect(stale.stale).toBe(true); // bonus removed after processing → earnings ≠ gross
  });

  it("rounds fractional adjustment amounts exactly like the engine did", () => {
    const view = buildPayslipView(
      baseInput({
        payslip: {
          ...baseInput().payslip,
          grossSalary: "900001",
          deductions: "40500",
          netSalary: "859501",
        },
        adjustments: [
          { type: "BONUS", category: "EARNING", amount: "50000.5", hours: null, note: "One-off" },
        ],
      }),
    );
    expect(view.earnings[1]?.amount).toBe("50 001"); // half-up, engine leaf rounding
    expect(view.stale).toBe(false);
  });

  it("watermarks non-final payslips", () => {
    expect(buildPayslipView(baseInput({ payslip: { ...baseInput().payslip, status: "DRAFT" } })).watermark).toBe(
      "DRAFT",
    );
    expect(buildPayslipView(baseInput({ payslip: { ...baseInput().payslip, status: "VOID" } })).watermark).toBe(
      "VOID",
    );
  });

  it("omits missing company subline parts", () => {
    const view = buildPayslipView(
      baseInput({
        company: {
          name: "Solo SARL",
          address: null,
          taxId: null,
          countryName: "Cameroon",
          currency: "XAF",
        },
      }),
    );
    expect(view.companySubline).toBe("Cameroon");
  });
});

describe("renderPayslipPdf", () => {
  it("renders a real, non-trivial PDF document", async () => {
    const pdf = await renderPayslipPdf(buildPayslipView(baseInput()));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
    expect(pdf.subarray(pdf.length - 32).toString("latin1")).toContain("%%EOF");
  }, 20000);

  it("renders the watermarked DRAFT variant without failing", async () => {
    const pdf = await renderPayslipPdf(
      buildPayslipView(baseInput({ payslip: { ...baseInput().payslip, status: "DRAFT" } })),
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 20000);
});
