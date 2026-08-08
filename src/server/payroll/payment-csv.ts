/**
 * Payment instruction file (pure — no I/O). The treasurer downloads this CSV
 * for the APPROVED period and feeds it to the bank / momo bulk channel; the
 * deterministic instruction reference doubles as the idempotency key banks
 * use to dedupe repeat uploads (decision #10).
 *
 * Format (RFC 4180, \r\n row endings, UTF-8):
 *
 *   reference,employee_code,employee_name,method,bank_or_provider,account_or_msisdn,amount,pay_date,period
 *
 * Only rows still needing money movement (PENDING + FAILED) are exported;
 * amounts are whole-XAF integers.
 */

import { slugifyFileStem } from "@/server/files/slug";

export interface PaymentCsvRow {
  employeeCode: string;
  fullName: string;
  method: "BANK" | "MOBILE_MONEY" | "CASH";
  /** Decrypted bank name, or momo provider ("MTN" / "Orange"), or "" for cash. */
  destination: string;
  /** Decrypted account number / MSISDN; empty for cash or missing details. */
  account: string;
  /** Whole-XAF integer string. */
  amount: string;
}

export const PAYMENT_CSV_HEADERS = [
  "reference",
  "employee_code",
  "employee_name",
  "method",
  "bank_or_provider",
  "account_or_msisdn",
  "amount",
  "pay_date",
  "period",
] as const;

export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function csvRow(values: readonly string[]): string {
  return values.map(csvEscape).join(",");
}

/** `PAY-2026-09-PB-0001` — deterministic per (period month, employee). */
export function paymentInstructionReference(periodStart: Date, employeeCode: string): string {
  const year = periodStart.getUTCFullYear();
  const month = String(periodStart.getUTCMonth() + 1).padStart(2, "0");
  return `PAY-${year}-${month}-${employeeCode}`;
}

export function paymentsCsvFilename(periodName: string): string {
  return `payflow-payments-${slugifyFileStem(periodName)}.csv`;
}

/** ISO date for the pay_date column (period.payDate → 2026-09-05). */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildPaymentsCsv(
  rows: PaymentCsvRow[],
  period: { name: string; startDate: Date; payDate: Date },
): string {
  const sorted = [...rows].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  const lines = [csvRow(PAYMENT_CSV_HEADERS)];
  for (const row of sorted) {
    lines.push(
      csvRow([
        paymentInstructionReference(period.startDate, row.employeeCode),
        row.employeeCode,
        row.fullName,
        row.method,
        row.destination,
        row.account,
        row.amount,
        isoDate(period.payDate),
        period.name,
      ]),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
