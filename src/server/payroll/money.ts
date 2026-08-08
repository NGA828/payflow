import Big from "big.js";

/**
 * Money math (decision #2): big.js arithmetic only — never floats — with all
 * final amounts rounded half-up to whole XAF (a zero-decimal currency).
 * Inputs accept Prisma Decimal (it is `.toString()`-safe like big.js).
 */

Big.DP = 40; // plenty of intermediate precision; finals are rounded to 0 dp
Big.RM = 1; // round half-up (away from zero), matching accounting expectations

export type MoneyInput = Big | string | number | { toString(): string };

/** Whole-XAF string rounded half-up, e.g. "64904". */
export function roundWholeXaf(value: MoneyInput): string {
  return new Big(value.toString()).round(0, 1).toFixed(0);
}

/**
 * Overtime pay for `hours` worked:
 *
 *   hourlyRate  = basicSalary / (standardHoursPerWeek × 52 / 12)
 *   overtimePay = hours × hourlyRate × overtimeMultiplier      → half-up XAF
 */
export function overtimePayForHours(
  basicSalary: MoneyInput,
  hours: MoneyInput,
  standardHoursPerWeek: MoneyInput,
  overtimeMultiplier: MoneyInput,
): string {
  const hoursValue = new Big(hours.toString());
  if (hoursValue.lte(0)) return "0";
  const weeklyHours = new Big(standardHoursPerWeek.toString());
  if (weeklyHours.lte(0)) {
    // Divide-by-zero guard: a 0-hours/week setting must never crash payroll.
    return "0";
  }
  const monthlyHours = weeklyHours.times(52).div(12);
  const hourlyRate = new Big(basicSalary.toString()).div(monthlyHours);
  return roundWholeXaf(hourlyRate.times(hoursValue).times(overtimeMultiplier.toString()));
}
