import type { PaymentMethodType, PaymentStatus } from "@prisma/client";
import Big from "big.js";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/security/audit";
import { decryptString } from "@/server/security/crypto";
import { assertTransition } from "@/server/payroll/state-machine";
import { buildPaymentsCsv, paymentsCsvFilename, type PaymentCsvRow } from "@/server/payroll/payment-csv";
import { roundWholeXaf } from "@/server/payroll/money";
import type { CompanyContext } from "@/server/tenant/context";
import { assertCompanyWritable } from "@/server/tenant/status";

/**
 * Payments (P10). Lifecycle:
 *
 *   - approve materializes one PENDING payment per payslip (amount = net);
 *   - the treasurer exports the instruction CSV, then marks rows SUCCESSFUL
 *     (optional bank/momo reference) or FAILED (reason required); FAILED rows
 *     can be retried to SUCCESSFUL; SUCCESSFUL is final;
 *   - when every payment is SUCCESSFUL the period transitions APPROVED → PAID
 *     automatically (audit `payroll.marked_paid`);
 *   - a PAID period can be locked forever (PAID → LOCKED, audit
 *     `payroll.locked`); unlock (P9) refuses once any payment succeeded and
 *     otherwise DELETES the non-successful payment rows so re-approval
 *     rematerializes from fresh payslips (decision #36).
 */

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const PAYMENT_REFERENCE_MAX = 80;
export const FAILURE_REASON_MIN = 5;
export const FAILURE_REASON_MAX = 200;

// ── Materialization ────────────────────────────────────────────────

/**
 * One PENDING payment per payslip of the period, skipping rows that already
 * exist. Idempotent — safe to call from approve and from the payments backfill.
 */
export async function ensurePayments(companyId: string, payrollPeriodId: string): Promise<number> {
  const db = getDb();
  const [payslips, existing] = await Promise.all([
    db.payslip.findMany({
      where: { companyId, payrollPeriodId },
      select: {
        employeeId: true,
        netSalary: true,
        employee: { select: { paymentMethodPreference: true } },
      },
    }),
    db.payment.findMany({
      where: { companyId, payrollPeriodId },
      select: { employeeId: true },
    }),
  ]);
  const covered = new Set(existing.map((row) => row.employeeId));
  const missing = payslips.filter((row) => !covered.has(row.employeeId));
  if (missing.length === 0) return 0;
  await db.payment.createMany({
    data: missing.map((row) => ({
      companyId,
      payrollPeriodId,
      employeeId: row.employeeId,
      method: row.employee.paymentMethodPreference,
      amount: row.netSalary.toString(),
      status: "PENDING" as const,
    })),
  });
  return missing.length;
}

// ── Read model ─────────────────────────────────────────────────────

export interface PaymentListRow {
  id: string;
  employeeId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string;
  method: PaymentMethodType;
  amount: string;
  status: PaymentStatus;
  reference: string | null;
  failureReason: string | null;
  paidAt: string | null; // ISO
}

export interface PaymentStatusTotals {
  count: number;
  amount: string;
}

export interface PaymentsBoard {
  rows: PaymentListRow[];
  totals: {
    pending: PaymentStatusTotals;
    successful: PaymentStatusTotals;
    failed: PaymentStatusTotals;
  };
}

export async function listPayments(
  companyId: string,
  payrollPeriodId: string,
): Promise<PaymentsBoard> {
  const rows = await getDb().payment.findMany({
    where: { companyId, payrollPeriodId },
    orderBy: [{ employee: { employeeCode: "asc" } }],
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          department: { select: { name: true } },
        },
      },
    },
  });
  const sums: Record<PaymentStatus, { count: number; amount: Big }> = {
    PENDING: { count: 0, amount: new Big(0) },
    SUCCESSFUL: { count: 0, amount: new Big(0) },
    FAILED: { count: 0, amount: new Big(0) },
  };
  const list: PaymentListRow[] = rows.map((row) => {
    sums[row.status].count += 1;
    sums[row.status].amount = sums[row.status].amount.plus(row.amount.toString());
    return {
      id: row.id,
      employeeId: row.employee.id,
      fullName: `${row.employee.firstName} ${row.employee.lastName}`,
      employeeCode: row.employee.employeeCode,
      departmentName: row.employee.department.name,
      method: row.method,
      amount: roundWholeXaf(row.amount.toString()),
      status: row.status,
      reference: row.reference,
      failureReason: row.failureReason,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    };
  });
  return {
    rows: list,
    totals: {
      pending: { count: sums.PENDING.count, amount: roundWholeXaf(sums.PENDING.amount) },
      successful: {
        count: sums.SUCCESSFUL.count,
        amount: roundWholeXaf(sums.SUCCESSFUL.amount),
      },
      failed: { count: sums.FAILED.count, amount: roundWholeXaf(sums.FAILED.amount) },
    },
  };
}

// ── Status updates ─────────────────────────────────────────────────

export type PaymentStatusOutcome = "SUCCESSFUL" | "FAILED";

export interface PaymentStatusInput {
  outcome: PaymentStatusOutcome;
  reference?: string | undefined;
  failureReason?: string | undefined;
}

async function requirePeriodInCompany(ctx: CompanyContext, payrollPeriodId: string) {
  const period = await getDb().payrollPeriod.findFirst({
    where: { id: payrollPeriodId, companyId: ctx.company.id },
  });
  if (!period) throw new AppError("NOT_FOUND", "Payroll period not found.");
  return period;
}

export async function updatePaymentStatus(
  ctx: CompanyContext,
  paymentId: string,
  input: PaymentStatusInput,
  meta: RequestMeta = {},
): Promise<{ employeeCode: string; outcome: PaymentStatusOutcome; periodNowPaid: boolean }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const payment = await db.payment.findFirst({
    where: { id: paymentId, companyId: ctx.company.id },
    include: { employee: { select: { employeeCode: true } } },
  });
  if (!payment) throw new AppError("NOT_FOUND", "Payment not found.");

  const period = await requirePeriodInCompany(ctx, payment.payrollPeriodId);
  if (period.status !== "APPROVED") {
    throw new AppError(
      "BAD_REQUEST",
      `Payments can only be updated while the period is APPROVED (it is ${period.status}).`,
    );
  }
  if (payment.status === "SUCCESSFUL") {
    throw new AppError(
      "CONFLICT",
      "A successful payment is final — it cannot be changed.",
    );
  }

  const reference = input.reference?.trim() ?? "";
  const failureReason = input.failureReason?.trim() ?? "";
  if (input.outcome === "FAILED" && failureReason.length < FAILURE_REASON_MIN) {
    throw new AppError("VALIDATION", "Tell us why the payment failed (min 5 characters).", {
      failureReason: [`Tell us why the payment failed (min ${FAILURE_REASON_MIN} characters).`],
    });
  }
  if (failureReason.length > FAILURE_REASON_MAX) {
    throw new AppError("VALIDATION", `Keep the failure reason under ${FAILURE_REASON_MAX} characters.`, {
      failureReason: [`Keep the failure reason under ${FAILURE_REASON_MAX} characters.`],
    });
  }
  if (reference.length > PAYMENT_REFERENCE_MAX) {
    throw new AppError("VALIDATION", `Keep the reference under ${PAYMENT_REFERENCE_MAX} characters.`, {
      reference: [`Keep the reference under ${PAYMENT_REFERENCE_MAX} characters.`],
    });
  }

  const now = new Date();
  await db.payment.update({
    where: { id: payment.id },
    data:
      input.outcome === "SUCCESSFUL"
        ? {
            status: "SUCCESSFUL",
            paidAt: now,
            recordedById: ctx.user.id,
            reference: reference || null,
            failureReason: null,
          }
        : {
            status: "FAILED",
            paidAt: null,
            recordedById: ctx.user.id,
            reference: reference || null,
            failureReason,
          },
  });

  // Auto-transition APPROVED → PAID once every payment has succeeded.
  const remaining = await db.payment.count({
    where: {
      companyId: ctx.company.id,
      payrollPeriodId: period.id,
      status: { in: ["PENDING", "FAILED"] },
    },
  });
  const total = await db.payment.count({
    where: { companyId: ctx.company.id, payrollPeriodId: period.id },
  });
  let periodNowPaid = false;
  if (remaining === 0 && total > 0) {
    assertTransition(period.status, "PAID");
    await db.payrollPeriod.update({ where: { id: period.id }, data: { status: "PAID" } });
    periodNowPaid = true;
    await audit({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      action: "payroll.marked_paid",
      entityType: "PayrollPeriod",
      entityId: period.id,
      metadata: { period: period.name, payments: total },
      ...meta,
    });
  }

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payment.status_changed",
    entityType: "Payment",
    entityId: payment.id,
    metadata: {
      period: period.name,
      employeeCode: payment.employee.employeeCode,
      outcome: input.outcome,
      reference: reference || null,
      failureReason: input.outcome === "FAILED" ? failureReason : null,
      amount: payment.amount.toString(),
    },
    ...meta,
  });

  return { employeeCode: payment.employee.employeeCode, outcome: input.outcome, periodNowPaid };
}

// ── Lock ───────────────────────────────────────────────────────────

export async function lockPeriod(
  ctx: CompanyContext,
  payrollPeriodId: string,
  meta: RequestMeta = {},
): Promise<{ name: string }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const period = await requirePeriodInCompany(ctx, payrollPeriodId);
  assertTransition(period.status, "LOCKED");
  await db.payrollPeriod.update({
    where: { id: period.id },
    data: { status: "LOCKED", lockedAt: new Date() },
  });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payroll.locked",
    entityType: "PayrollPeriod",
    entityId: period.id,
    metadata: { period: period.name },
    ...meta,
  });
  return { name: period.name };
}

// ── CSV export ─────────────────────────────────────────────────────

export interface PaymentsExport {
  filename: string;
  csv: string;
  rowCount: number;
}

/**
 * Instruction file for the rows still needing money (PENDING + FAILED),
 * with payment destinations DECRYPTED server-side. Only callable by roles
 * with payments.export (enforced in the route) — exports are audit-logged.
 */
export async function buildPaymentsExport(
  ctx: CompanyContext,
  payrollPeriodId: string,
  meta: RequestMeta = {},
): Promise<PaymentsExport> {
  const db = getDb();
  const period = await requirePeriodInCompany(ctx, payrollPeriodId);
  if (!["APPROVED", "PAID", "LOCKED"].includes(period.status)) {
    throw new AppError(
      "BAD_REQUEST",
      "Payments exist once the period is approved — export is not available yet.",
    );
  }
  const rows = await db.payment.findMany({
    where: { companyId: ctx.company.id, payrollPeriodId, status: { in: ["PENDING", "FAILED"] } },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeCode: true,
          bankNameEnc: true,
          bankAccountNumberEnc: true,
          mobileMoneyProvider: true,
          mobileMoneyNumberEnc: true,
        },
      },
    },
  });

  const csvRows: PaymentCsvRow[] = rows.map((row) => {
    const destination =
      row.method === "BANK"
        ? row.employee.bankNameEnc
          ? decryptString(row.employee.bankNameEnc)
          : ""
        : row.method === "MOBILE_MONEY"
          ? (row.employee.mobileMoneyProvider ?? "")
          : "";
    const account =
      row.method === "BANK"
        ? row.employee.bankAccountNumberEnc
          ? decryptString(row.employee.bankAccountNumberEnc)
          : ""
        : row.method === "MOBILE_MONEY"
          ? row.employee.mobileMoneyNumberEnc
            ? decryptString(row.employee.mobileMoneyNumberEnc)
            : ""
          : "";
    return {
      employeeCode: row.employee.employeeCode,
      fullName: `${row.employee.firstName} ${row.employee.lastName}`,
      method: row.method,
      destination,
      account,
      amount: roundWholeXaf(row.amount.toString()),
    };
  });

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payment.exported",
    entityType: "PayrollPeriod",
    entityId: period.id,
    metadata: { period: period.name, rows: rows.length },
    ...meta,
  });

  return {
    filename: paymentsCsvFilename(period.name),
    csv: buildPaymentsCsv(csvRows, {
      name: period.name,
      startDate: period.startDate,
      payDate: period.payDate,
    }),
    rowCount: rows.length,
    };
}