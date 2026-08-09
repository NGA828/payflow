import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/security/audit";
import { assertTransition } from "@/server/payroll/state-machine";
import { ensurePayments } from "@/server/services/payment.service";
import { notifyPayslipsAvailable } from "@/server/services/payslip.service";
import type { CompanyContext } from "@/server/tenant/context";
import { assertCompanyWritable } from "@/server/tenant/status";

/**
 * Review & approval lifecycle (P9): READY → SUBMITTED → APPROVED, with the
 * two guarded returns — reject (SUBMITTED → READY, note required) and unlock
 * (APPROVED → READY, reason required, pre-payment only, decision #9).
 *
 * Permission checks live in the server actions (payroll.submit /
 * payroll.approve / payroll.unlock); these functions own the state machine,
 * stamps, payslip-status flips and the audit trail.
 *
 * Payslip status semantics (decision #33):
 *   - approve flips every DRAFT payslip to APPROVED (from then on the engine
 *     treats them as immutable — reprocess skips them);
 *   - unlock flips them back to DRAFT so a reprocess can truly recompute;
 *   - reject touches nothing (payslips stay DRAFT, editable as usual).
 */

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export const REVIEW_NOTE_MIN = 5;
export const REVIEW_NOTE_MAX = 500;

/** Shared validation for reject notes and unlock reasons. */
export function normalizeReviewNote(raw: string, fieldLabel: string): string {
  const note = raw.trim();
  if (note.length < REVIEW_NOTE_MIN) {
    throw new AppError("VALIDATION", `${fieldLabel} needs at least ${REVIEW_NOTE_MIN} characters.`, {
      reason: [`${fieldLabel} needs at least ${REVIEW_NOTE_MIN} characters.`],
    });
  }
  if (note.length > REVIEW_NOTE_MAX) {
    throw new AppError("VALIDATION", `Keep the ${fieldLabel.toLowerCase()} under ${REVIEW_NOTE_MAX} characters.`, {
      reason: [`Keep the ${fieldLabel.toLowerCase()} under ${REVIEW_NOTE_MAX} characters.`],
    });
  }
  return note;
}

async function requirePeriodInCompany(ctx: CompanyContext, payrollPeriodId: string) {
  const period = await getDb().payrollPeriod.findFirst({
    where: { id: payrollPeriodId, companyId: ctx.company.id },
  });
  if (!period) throw new AppError("NOT_FOUND", "Payroll period not found.");
  return period;
}

export async function submitPeriod(
  ctx: CompanyContext,
  payrollPeriodId: string,
  meta: RequestMeta = {},
): Promise<{ name: string }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const period = await requirePeriodInCompany(ctx, payrollPeriodId);
  assertTransition(period.status, "SUBMITTED");

  const payslipCount = await db.payslip.count({
    where: { companyId: ctx.company.id, payrollPeriodId: period.id },
  });
  if (payslipCount === 0) {
    throw new AppError(
      "BAD_REQUEST",
      "Process this period before submitting it — there are no payslips to approve.",
    );
  }

  await db.payrollPeriod.update({
    where: { id: period.id },
    data: { status: "SUBMITTED", submittedAt: new Date(), submittedById: ctx.user.id },
  });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payroll.submitted",
    entityType: "PayrollPeriod",
    entityId: period.id,
    metadata: {
      period: period.name,
      payslips: payslipCount,
      totalNet: period.totalNet?.toString() ?? null,
    },
    ...meta,
  });
  return { name: period.name };
}

export async function approvePeriod(
  ctx: CompanyContext,
  payrollPeriodId: string,
  meta: RequestMeta = {},
): Promise<{ name: string; employees: number }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const period = await requirePeriodInCompany(ctx, payrollPeriodId);
  assertTransition(period.status, "APPROVED");

  const flipped = await db.payslip.updateMany({
    where: { companyId: ctx.company.id, payrollPeriodId: period.id, status: "DRAFT" },
    data: { status: "APPROVED" },
  });
  await db.payrollPeriod.update({
    where: { id: period.id },
    data: { status: "APPROVED", approvedAt: new Date(), approvedById: ctx.user.id },
  });
  const paymentsCreated = await ensurePayments(ctx.company.id, period.id);
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payroll.approved",
    entityType: "PayrollPeriod",
    entityId: period.id,
    metadata: {
      period: period.name,
      payslipsApproved: flipped.count,
      paymentsCreated,
      totalNet: period.totalNet?.toString() ?? null,
    },
    ...meta,
  });
  // Payslip-availability fan-out (in-app + email). Never blocks approval.
  await notifyPayslipsAvailable(ctx.company.id, period.id);
  return { name: period.name, employees: flipped.count };
}

export async function rejectPeriod(
  ctx: CompanyContext,
  payrollPeriodId: string,
  rawNote: string,
  meta: RequestMeta = {},
): Promise<{ name: string }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const note = normalizeReviewNote(rawNote, "Rejection note");
  const period = await requirePeriodInCompany(ctx, payrollPeriodId);
  assertTransition(period.status, "READY");

  await db.payrollPeriod.update({
    where: { id: period.id },
    data: { status: "READY" }, // submittedAt/By stay — they record that a submission happened
  });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payroll.rejected",
    entityType: "PayrollPeriod",
    entityId: period.id,
    metadata: { period: period.name, note },
    ...meta,
  });
  return { name: period.name };
}

export async function unlockPeriod(
  ctx: CompanyContext,
  payrollPeriodId: string,
  rawReason: string,
  meta: RequestMeta = {},
): Promise<{ name: string }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const reason = normalizeReviewNote(rawReason, "Unlock reason");
  const period = await requirePeriodInCompany(ctx, payrollPeriodId);
  assertTransition(period.status, "READY");

  // Decision #9: never unlock once money has moved.
  const successfulPayments = await db.payment.count({
    where: { payrollPeriodId: period.id, status: "SUCCESSFUL" },
  });
  if (successfulPayments > 0) {
    throw new AppError(
      "CONFLICT",
      "This period has successful payments and can never be unlocked.",
    );
  }

  await db.payslip.updateMany({
    where: { companyId: ctx.company.id, payrollPeriodId: period.id, status: "APPROVED" },
    data: { status: "DRAFT" },
  });
  // Re-approval rematerializes payments from fresh payslips (decision #36);
  // the successful-payments guard above guarantees no SUCCESSFUL row is lost.
  await db.payment.deleteMany({
    where: { companyId: ctx.company.id, payrollPeriodId: period.id },
  });
  await db.payrollPeriod.update({
    where: { id: period.id },
    data: {
      status: "READY",
      unlockedAt: new Date(),
      unlockedById: ctx.user.id,
      unlockReason: reason,
    },
  });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payroll.unlocked",
    entityType: "PayrollPeriod",
    entityId: period.id,
    metadata: { period: period.name, reason },
    ...meta,
  });
  return { name: period.name };
}