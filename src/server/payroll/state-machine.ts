import type { PayrollPeriodStatus } from "@prisma/client";
import { AppError } from "@/server/errors";
import type { Permission } from "@/server/rbac/permissions";
import { PERMISSIONS } from "@/server/rbac/permissions";

/**
 * Payroll period lifecycle — the single authority on allowed transitions:
 *
 *   DRAFT → IN_PROGRESS → READY → SUBMITTED → APPROVED → PAID → LOCKED
 *                                 ↑________________|  (unlock, reason required)
 *
 * Services enforce the matrix on every mutation; UI only reflects it.
 */

export const PERIOD_TRANSITIONS: Readonly<
  Record<PayrollPeriodStatus, readonly PayrollPeriodStatus[]>
> = {
  DRAFT: ["IN_PROGRESS"],
  IN_PROGRESS: ["READY"],
  READY: ["SUBMITTED"],
  SUBMITTED: ["APPROVED"],
  APPROVED: ["READY", "PAID"], // READY here = the guarded unlock path
  PAID: ["LOCKED"],
  LOCKED: [],
};

/** Permission a transition demands (the unlock override is listed separately). */
export const TRANSITION_PERMISSION: Readonly<
  Partial<Record<`${PayrollPeriodStatus}->${PayrollPeriodStatus}`, Permission>>
> = {
  "DRAFT->IN_PROGRESS": PERMISSIONS.PAYROLL_PROCESS,
  "IN_PROGRESS->READY": PERMISSIONS.PAYROLL_PROCESS,
  "READY->SUBMITTED": PERMISSIONS.PAYROLL_SUBMIT,
  "SUBMITTED->APPROVED": PERMISSIONS.PAYROLL_APPROVE,
  "APPROVED->READY": PERMISSIONS.PAYROLL_UNLOCK,
  "APPROVED->PAID": PERMISSIONS.PAYMENTS_MANAGE,
  "PAID->LOCKED": PERMISSIONS.PAYROLL_APPROVE,
};

export function canTransition(
  from: PayrollPeriodStatus,
  to: PayrollPeriodStatus,
): boolean {
  return PERIOD_TRANSITIONS[from].includes(to);
}

export function transitionPermission(
  from: PayrollPeriodStatus,
  to: PayrollPeriodStatus,
): Permission | null {
  return TRANSITION_PERMISSION[`${from}->${to}`] ?? null;
}

/** Throws BAD_REQUEST with a human explanation when a transition is illegal. */
export function assertTransition(
  from: PayrollPeriodStatus,
  to: PayrollPeriodStatus,
): void {
  if (!canTransition(from, to)) {
    throw new AppError(
      "BAD_REQUEST",
      `A payroll period cannot move from ${from} to ${to}. Allowed next steps from ${from}: ${
        PERIOD_TRANSITIONS[from].join(", ") || "none (locked)"
      }.`,
    );
  }
}

/** Pre-submission states: a company can only juggle one prep period at a time. */
export const PREP_STATUSES: readonly PayrollPeriodStatus[] = ["DRAFT", "IN_PROGRESS", "READY"];

export function isPrepStatus(status: PayrollPeriodStatus): boolean {
  return PREP_STATUSES.includes(status);
}

/** Display metadata for the UI stepper. */
export const STATUS_DISPLAY: Readonly<
  Record<PayrollPeriodStatus, { label: string; hint: string }>
> = {
  DRAFT: { label: "Draft", hint: "Preparing employees and adjustments" },
  IN_PROGRESS: { label: "Processing", hint: "Engine computing payslips" },
  READY: { label: "Ready", hint: "Review totals, then submit for approval" },
  SUBMITTED: { label: "Submitted", hint: "Waiting for a Company Admin to approve" },
  APPROVED: { label: "Approved", hint: "Payments can be issued" },
  PAID: { label: "Paid", hint: "All successful payments recorded" },
  LOCKED: { label: "Locked", hint: "Closed for good — read-only forever" },
};

export const STATUS_ORDER: readonly PayrollPeriodStatus[] = [
  "DRAFT",
  "IN_PROGRESS",
  "READY",
  "SUBMITTED",
  "APPROVED",
  "PAID",
  "LOCKED",
];
