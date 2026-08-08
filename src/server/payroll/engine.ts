import Big from "big.js";
import { Prisma, type AdjustmentType, type EmployeeStatus, type EmploymentType } from "@prisma/client";
import { overtimePayForHours, roundWholeXaf, type MoneyInput } from "@/server/payroll/money";
import { isPayrollEligible } from "@/server/services/employee.service";
import { categoryOf } from "@/validations/adjustment";

/**
 * The PayFlow payroll engine (pure — no I/O, no DB). Formula (spec §17):
 *
 *   hourlyRate = basicSalary / (standardHoursPerWeek × 52 / 12)
 *   overtime   = hours × hourlyRate × overtimeMultiplier        (per OT row)
 *   gross      = basic + overtime + bonuses + allowances
 *   tax        = gross × taxRate                                (single flat rule)
 *   deductions = loan + advance + penalty + other + extraTax + tax
 *   net        = gross − deductions
 *
 * All final amounts are whole-XAF strings rounded half-up (decision #2).
 * Footing invariant: every leaf line is rounded first, then gross /
 * deductions / net are composed by exact integer addition — so a stored
 * payslip ALWAYS reconciles (basic+OT+bonuses+allowances = gross,
 * deductions parts + tax = deductions, gross − deductions = net).
 * Overtime is RECOMPUTED from hours at processing time so mid-period salary
 * changes are always honored; rows without hours fall back to their stored
 * amount.
 */

export interface EngineEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  dateHired: Date;
  terminationDate: Date | null;
  basicSalary: Prisma.Decimal | string | number;
}

export interface EngineAdjustment {
  employeeId: string;
  type: AdjustmentType;
  amount: MoneyInput;
  hours: MoneyInput | null;
}

export interface EngineSettings {
  standardHoursPerWeek: MoneyInput;
  overtimeMultiplier: MoneyInput;
  /** Fraction (0.045 = 4.5%). */
  taxRate: MoneyInput;
}

export interface PayslipAmounts {
  basicSalary: string;
  overtimePay: string;
  bonuses: string;
  allowances: string;
  grossSalary: string;
  tax: string;
  deductions: string;
  netSalary: string;
}

export interface PayslipBreakdown extends PayslipAmounts {
  /** Deduction components (informational; not persisted individually). */
  loan: string;
  advance: string;
  penalty: string;
  otherDeductions: string;
  extraTax: string;
}

function sum(rows: MoneyInput[]): Big {
  let total = new Big(0);
  for (const row of rows) total = total.plus(row.toString());
  return total;
}

export function computePayslipAmounts(
  employee: EngineEmployee,
  adjustments: EngineAdjustment[],
  settings: EngineSettings,
): PayslipBreakdown {
  const basic = new Big(employee.basicSalary.toString());
  if (basic.lt(0)) throw new Error(`Negative basic salary for ${employee.employeeCode}`);

  const overtimeAmounts: Big[] = [];
  const bonuses: Big[] = [];
  const allowances: Big[] = [];
  const loans: Big[] = [];
  const advances: Big[] = [];
  const penalties: Big[] = [];
  const others: Big[] = [];
  const extraTaxes: Big[] = [];

  for (const adjustment of adjustments) {
    if (adjustment.employeeId !== employee.id) continue;
    const amount = new Big(adjustment.amount.toString());
    if (amount.lt(0)) {
      throw new Error(`Negative adjustment (${adjustment.type}) for ${employee.employeeCode}`);
    }
    if (adjustment.type === "OVERTIME") {
      if (adjustment.hours !== null) {
        overtimeAmounts.push(
          new Big(
            overtimePayForHours(
              employee.basicSalary,
              adjustment.hours,
              settings.standardHoursPerWeek,
              settings.overtimeMultiplier,
            ),
          ),
        );
      } else {
        overtimeAmounts.push(amount);
      }
      continue;
    }
    switch (categoryOf(adjustment.type)) {
      case "EARNING":
        if (adjustment.type === "BONUS") bonuses.push(amount);
        else allowances.push(amount); // TRANSPORT, MEAL
        break;
      case "DEDUCTION":
        if (adjustment.type === "LOAN") loans.push(amount);
        else if (adjustment.type === "ADVANCE") advances.push(amount);
        else if (adjustment.type === "PENALTY") penalties.push(amount);
        else if (adjustment.type === "TAX") extraTaxes.push(amount);
        else others.push(amount); // OTHER_DEDUCTION
        break;
    }
  }

  // Round each leaf line first, then compose — the stored payslip must foot
  // exactly (see the module docstring). All post-rounding math is exact.
  const basicR = new Big(roundWholeXaf(basic));
  const overtimeR = new Big(roundWholeXaf(sum(overtimeAmounts)));
  const bonusesR = new Big(roundWholeXaf(sum(bonuses)));
  const allowancesR = new Big(roundWholeXaf(sum(allowances)));
  const grossR = basicR.plus(overtimeR).plus(bonusesR).plus(allowancesR);

  const taxR = new Big(roundWholeXaf(grossR.times(settings.taxRate.toString())));
  const loanR = new Big(roundWholeXaf(sum(loans)));
  const advanceR = new Big(roundWholeXaf(sum(advances)));
  const penaltyR = new Big(roundWholeXaf(sum(penalties)));
  const otherR = new Big(roundWholeXaf(sum(others)));
  const extraTaxR = new Big(roundWholeXaf(sum(extraTaxes)));
  const deductionsR = loanR
    .plus(advanceR)
    .plus(penaltyR)
    .plus(otherR)
    .plus(extraTaxR)
    .plus(taxR);
  const netR = grossR.minus(deductionsR);

  return {
    basicSalary: basicR.toFixed(0),
    overtimePay: overtimeR.toFixed(0),
    bonuses: bonusesR.toFixed(0),
    allowances: allowancesR.toFixed(0),
    grossSalary: grossR.toFixed(0),
    tax: taxR.toFixed(0),
    deductions: deductionsR.toFixed(0),
    netSalary: netR.toFixed(0),
    loan: loanR.toFixed(0),
    advance: advanceR.toFixed(0),
    penalty: penaltyR.toFixed(0),
    otherDeductions: otherR.toFixed(0),
    extraTax: extraTaxR.toFixed(0),
  };
}

/** Exactly the employees the run will pay — same rule as the preview (decision #4). */
export function selectEligibleEmployees<T extends EngineEmployee>(
  employees: T[],
  periodStart: Date,
  periodEnd: Date,
): T[] {
  return employees.filter((employee) => isPayrollEligible(employee, periodStart, periodEnd));
}

/** Period-level rollup used for PayrollPeriod totals + list views. */
export function summarizeRun(amounts: PayslipAmounts[]): {
  totalEmployees: number;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
} {
  const gross = sum(amounts.map((a) => a.grossSalary));
  const deductions = sum(amounts.map((a) => a.deductions));
  const net = sum(amounts.map((a) => a.netSalary));
  return {
    totalEmployees: amounts.length,
    totalGross: roundWholeXaf(gross),
    totalDeductions: roundWholeXaf(deductions),
    totalNet: roundWholeXaf(net),
  };
}
