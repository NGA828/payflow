import Big from "big.js";
import { DISPLAY_TIME_ZONE } from "@/lib/format";
import { roundWholeXaf } from "@/server/payroll/money";
import type { AdjustmentCategory, AdjustmentType, PayslipStatus } from "@prisma/client";

/**
 * Payslip PDF content model.
 *
 * The 8 stored payslip columns are the source of truth for the totals; the
 * itemized lines are recomputed from the period's adjustments (decision #30).
 * Displayed adjustment lines use the exact leaf rounding the engine applied
 * (`roundWholeXaf`), so the printed lines always foot to the stored columns —
 * verified here via the `stale` flag (true when someone edited adjustments
 * after the last payroll run).
 */

export interface PayslipViewInput {
  company: {
    name: string;
    address: string | null;
    taxId: string | null;
    countryName: string;
    currency: string;
  };
  period: { name: string; startDate: Date; endDate: Date; payDate: Date };
  payslip: {
    payslipNumber: string;
    status: PayslipStatus;
    basicSalary: string;
    overtimePay: string;
    grossSalary: string;
    tax: string;
    deductions: string;
    netSalary: string;
  };
  employee: {
    fullName: string;
    employeeCode: string;
    departmentName: string;
    positionName: string;
  };
  settings: { overtimeMultiplier: string };
  adjustments: Array<{
    type: AdjustmentType;
    category: AdjustmentCategory;
    amount: string;
    hours: string | null;
    note: string | null;
  }>;
  generatedAt: Date;
}

export interface PayslipLine {
  label: string;
  amount: string;
}

export interface PayslipViewModel {
  companyName: string;
  companySubline: string | null;
  payslipNumber: string;
  /** Watermark text for non-final payslips ("DRAFT"/"VOID"), null when final. */
  watermark: string | null;
  employeeLine: string;
  orgLine: string;
  periodLine: string;
  earnings: PayslipLine[];
  gross: string;
  deductions: PayslipLine[];
  totalDeductions: string;
  net: string;
  currency: string;
  generatedLine: string;
  /** True when current adjustments no longer foot to the stored columns. */
  stale: boolean;
}

/** Fallback labels when the adjustment carries no free-text note. */
export const ADJUSTMENT_FALLBACK_LABELS: Record<AdjustmentType, string> = {
  OVERTIME: "Overtime",
  BONUS: "Bonus",
  TRANSPORT: "Transport allowance",
  MEAL: "Meal allowance",
  LOAN: "Loan repayment",
  ADVANCE: "Salary advance repayment",
  PENALTY: "Penalty",
  OTHER_DEDUCTION: "Other deduction",
  TAX: "Additional tax",
};

const moneyFormat = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Whole-XAF grouping for PDFs: fr-FR uses U+202F (narrow no-break space),
 * which the PDF WinAnsi text encoding cannot render — normalize to U+00A0.
 */
export function formatMoneyPdf(value: string): string {
  return moneyFormat.format(Number(new Big(value))).replace(/[\u202F\u00A0]/g, "\u00A0");
}

/** Trim a decimal for annotations: "7.50" → "7.5", "1.0" → "1", "0" → "0". */
function trimDecimal(value: Big): string {
  const s = value.toString();
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

/** Effective tax rate actually applied on this payslip: tax / gross, e.g. "4.5%". */
export function effectiveTaxRateLabel(tax: string, gross: string): string {
  const g = new Big(gross);
  if (g.lte(0)) return "0%";
  const pct = new Big(tax).div(g).times(100).round(2, 1); // half-up, ≤ 2 dp
  return `${trimDecimal(pct)}%`;
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: DISPLAY_TIME_ZONE });
const dayMonthFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: DISPLAY_TIME_ZONE,
});
const fullFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: DISPLAY_TIME_ZONE,
});

/** "1 – 31 Aug 2026" (same month) or "26 Jul – 1 Aug 2026" (cross-month). */
export function formatPeriodRange(startDate: Date, endDate: Date): string {
  const sameMonth =
    dayMonthFmt.format(startDate).split(" ")[1] === dayMonthFmt.format(endDate).split(" ")[1] &&
    startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const start = sameMonth ? dayFmt.format(startDate) : dayMonthFmt.format(startDate);
  return `${start} – ${fullFmt.format(endDate)}`;
}

function adjustmentLabel(type: AdjustmentType, note: string | null): string {
  const trimmed = note?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : ADJUSTMENT_FALLBACK_LABELS[type];
}

export function buildPayslipView(input: PayslipViewInput): PayslipViewModel {
  const { payslip } = input;

  const overtimeAdjustments = input.adjustments.filter((a) => a.type === "OVERTIME");
  const earningExtras = input.adjustments.filter(
    (a) => a.category === "EARNING" && a.type !== "OVERTIME",
  );
  const deductionExtras = input.adjustments.filter((a) => a.category === "DEDUCTION");

  const earnings: PayslipLine[] = [
    { label: "Basic salary", amount: formatMoneyPdf(payslip.basicSalary) },
  ];

  const earningsFoot = { total: new Big(payslip.basicSalary) };
  if (new Big(payslip.overtimePay).gt(0)) {
    let hours = new Big(0);
    for (const row of overtimeAdjustments) if (row.hours) hours = hours.plus(row.hours);
    const label = hours.gt(0)
      ? `Overtime · ${trimDecimal(hours)} h × ${trimDecimal(new Big(input.settings.overtimeMultiplier))}`
      : "Overtime";
    earnings.push({ label, amount: formatMoneyPdf(payslip.overtimePay) });
    earningsFoot.total = earningsFoot.total.plus(payslip.overtimePay);
  }
  for (const row of earningExtras) {
    const amount = roundWholeXaf(row.amount);
    earnings.push({ label: adjustmentLabel(row.type, row.note), amount: formatMoneyPdf(amount) });
    earningsFoot.total = earningsFoot.total.plus(amount);
  }

  const deductions: PayslipLine[] = [
    {
      label: `Income tax (${effectiveTaxRateLabel(payslip.tax, payslip.grossSalary)})`,
      amount: formatMoneyPdf(payslip.tax),
    },
  ];
  const deductionsFoot = { total: new Big(payslip.tax) };
  for (const row of deductionExtras) {
    const amount = roundWholeXaf(row.amount);
    deductions.push({ label: adjustmentLabel(row.type, row.note), amount: formatMoneyPdf(amount) });
    deductionsFoot.total = deductionsFoot.total.plus(amount);
  }

  const sublineParts = [input.company.address, input.company.countryName];
  if (input.company.taxId) sublineParts.push(`Tax ID ${input.company.taxId}`);

  return {
    companyName: input.company.name,
    companySubline: sublineParts.filter((p) => p && p.trim().length > 0).join(" · ") || null,
    payslipNumber: payslip.payslipNumber,
    watermark: payslip.status === "APPROVED" ? null : payslip.status,
    employeeLine: `${input.employee.fullName} · ${input.employee.employeeCode}`,
    orgLine: `${input.employee.departmentName} · ${input.employee.positionName}`,
    periodLine: `${formatPeriodRange(input.period.startDate, input.period.endDate)} · ${fullFmt.format(input.period.payDate)}`,
    earnings,
    gross: formatMoneyPdf(payslip.grossSalary),
    deductions,
    totalDeductions: formatMoneyPdf(payslip.deductions),
    net: formatMoneyPdf(payslip.netSalary),
    currency: input.company.currency,
    generatedLine: `Generated ${fullFmt.format(input.generatedAt)}`,
    stale:
      !earningsFoot.total.eq(new Big(payslip.grossSalary)) ||
      !deductionsFoot.total.eq(new Big(payslip.deductions)),
  };
}
