import Big from "big.js";
import type { PayslipStatus } from "@prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/security/audit";
import {
  computePayslipAmounts,
  selectEligibleEmployees,
  summarizeRun,
  type EngineAdjustment,
  type PayslipAmounts,
  type PayslipBreakdown,
} from "@/server/payroll/engine";
import { roundWholeXaf } from "@/server/payroll/money";
import { assertTransition } from "@/server/payroll/state-machine";
import { isPaymentComplete } from "@/server/services/employee.service";
import type { CompanyContext } from "@/server/tenant/context";
import { assertCompanyWritable } from "@/server/tenant/status";

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Payroll processing (decision #8 queue story): runs INLINE for now — same
 * honest execution, same PayrollRun progress rows a BullMQ worker would
 * write; swapping in a queue later touches only this module's boundary.
 *
 * Guarantees:
 * - transitions flow through the state machine (DRAFT→IN_PROGRESS, and
 *   READY→IN_PROGRESS for the idempotent re-process; IN_PROGRESS→DRAFT is the
 *   system rollback on failure);
 * - payslips are upserted one-per-employee per period; APPROVED payslips are
 *   NEVER recomputed or replaced (decision #11);
 * - period totals + run rows are always consistent at the end of a run.
 */

/** The 8 columns the Payslip model persists (breakdown parts stay derivable). */
function persistableAmounts(breakdown: PayslipBreakdown): PayslipAmounts {
  return {
    basicSalary: breakdown.basicSalary,
    overtimePay: breakdown.overtimePay,
    bonuses: breakdown.bonuses,
    allowances: breakdown.allowances,
    grossSalary: breakdown.grossSalary,
    tax: breakdown.tax,
    deductions: breakdown.deductions,
    netSalary: breakdown.netSalary,
  };
}

export interface ProcessResult {
  runId: string;
  periodStatus: "READY";
  totalEmployees: number;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  skippedApprovedPayslips: number;
  /** Eligible employees whose payment details are incomplete (warning only). */
  missingPaymentCount: number;
}

/** `PS-2026-00042` — per-company, per-year sequence, allocated once per run. */
async function allocatePayslipSequence(
  companyId: string,
  year: number,
): Promise<() => string> {
  const prefix = `PS-${year}-`;
  const existing = await getDb().payslip.findMany({
    where: { companyId, payslipNumber: { startsWith: prefix } },
    select: { payslipNumber: true },
  });
  let max = 0;
  for (const row of existing) {
    const suffix = Number.parseInt(row.payslipNumber.slice(prefix.length), 10);
    if (Number.isFinite(suffix) && suffix > max) max = suffix;
  }
  return () => {
    max += 1;
    return `${prefix}${String(max).padStart(5, "0")}`;
  };
}

export async function processPayroll(
  ctx: CompanyContext,
  payrollPeriodId: string,
  meta: RequestMeta = {},
): Promise<ProcessResult> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const period = await db.payrollPeriod.findFirst({
    where: { id: payrollPeriodId, companyId: ctx.company.id },
  });
  if (!period) throw new AppError("NOT_FOUND", "Payroll period not found.");

  // State machine is the authority: DRAFT -> run, READY -> idempotent re-run.
  assertTransition(period.status, "IN_PROGRESS");

  const running = await db.payrollRun.count({
    where: { payrollPeriodId: period.id, status: "RUNNING" },
  });
  if (running > 0) {
    throw new AppError("CONFLICT", "A processing run is already in progress for this period.");
  }

  const run = await db.payrollRun.create({
    data: {
      companyId: ctx.company.id,
      payrollPeriodId: period.id,
      status: "RUNNING",
      startedAt: new Date(),
      startedById: ctx.user.id,
    },
    select: { id: true },
  });
  await db.payrollPeriod.update({
    where: { id: period.id },
    data: { status: "IN_PROGRESS" },
  });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payroll.process_started",
    entityType: "PayrollRun",
    entityId: run.id,
    metadata: { period: period.name, payrollPeriodId: period.id, reprocess: period.status === "READY" },
    ...meta,
  });

  try {
    const [employees, adjustmentRows] = await Promise.all([
      db.employee.findMany({
        where: { companyId: ctx.company.id },
        include: { department: { select: { name: true } } },
      }),
      db.payrollAdjustment.findMany({
        where: { companyId: ctx.company.id, payrollPeriodId: period.id },
      }),
    ]);

    const eligible = selectEligibleEmployees(employees, period.startDate, period.endDate);
    const adjustments: EngineAdjustment[] = adjustmentRows.map((row) => ({
      employeeId: row.employeeId,
      type: row.type,
      amount: row.amount,
      hours: row.hours,
    }));
    const settings = {
      standardHoursPerWeek: ctx.company.standardHoursPerWeek,
      overtimeMultiplier: ctx.company.overtimeMultiplier,
      taxRate: ctx.company.taxRate,
    };

    await db.payrollRun.update({
      where: { id: run.id },
      data: { totalEmployees: eligible.length },
    });

    const nextPayslipNumber = await allocatePayslipSequence(
      ctx.company.id,
      period.startDate.getUTCFullYear(),
    );

    const existingPayslips = await db.payslip.findMany({
      where: { companyId: ctx.company.id, payrollPeriodId: period.id },
      select: { id: true, employeeId: true, status: true },
    });
    const byEmployee = new Map(existingPayslips.map((row) => [row.employeeId, row]));

    const computed: Array<{ employeeId: string; amounts: PayslipAmounts }> = [];
    let skippedApprovedPayslips = 0;
    let missingPaymentCount = 0;

    for (const [index, employee] of eligible.entries()) {
      // The payslip table stores the 8 printed lines; the deduction-part
      // breakdown is derivable from the adjustments (and recomputed for the
      // detail view) — only PayslipAmounts columns are persisted.
      const amounts = persistableAmounts(
        computePayslipAmounts(employee, adjustments, settings),
      );
      computed.push({ employeeId: employee.id, amounts });

      if (
        !isPaymentComplete({
          paymentMethod: employee.paymentMethodPreference,
          mobileMoneyProvider: employee.mobileMoneyProvider,
          bankNameEnc: employee.bankNameEnc,
          bankAccountNumberEnc: employee.bankAccountNumberEnc,
          mobileMoneyNumberEnc: employee.mobileMoneyNumberEnc,
        })
      ) {
        missingPaymentCount += 1;
      }

      const existingRow = byEmployee.get(employee.id);
      if (existingRow && existingRow.status !== "DRAFT") {
        // APPROVED payslips are sacred — reprocess never touches them.
        skippedApprovedPayslips += 1;
      } else if (existingRow) {
        await db.payslip.update({
          where: { id: existingRow.id },
          data: amounts,
        });
      } else {
        await db.payslip.create({
          data: {
            companyId: ctx.company.id,
            payrollPeriodId: period.id,
            employeeId: employee.id,
            payslipNumber: nextPayslipNumber(),
            status: "DRAFT",
            ...amounts,
          },
        });
      }

      // Honour the progress contract a queue worker would satisfy too.
      if ((index + 1) % 5 === 0 || index + 1 === eligible.length) {
        await db.payrollRun.update({
          where: { id: run.id },
          data: { processedEmployees: index + 1 },
        });
      }
    }

    // Totals reflect the stored payslip set (recomputed drafts + skipped
    // approved rows), never an in-memory fantasy.
    const storedPayslips = await db.payslip.findMany({
      where: { companyId: ctx.company.id, payrollPeriodId: period.id },
      select: { grossSalary: true, deductions: true, netSalary: true },
    });
    let totalGross = new Big(0);
    let totalDeductions = new Big(0);
    let totalNet = new Big(0);
    for (const row of storedPayslips) {
      totalGross = totalGross.plus(row.grossSalary.toString());
      totalDeductions = totalDeductions.plus(row.deductions.toString());
      totalNet = totalNet.plus(row.netSalary.toString());
    }
    const fallback = summarizeRun(computed.map((row) => row.amounts));
    const totals = {
      totalEmployees: storedPayslips.length,
      totalGross: storedPayslips.length > 0 ? roundWholeXaf(totalGross) : fallback.totalGross,
      totalDeductions:
        storedPayslips.length > 0 ? roundWholeXaf(totalDeductions) : fallback.totalDeductions,
      totalNet: storedPayslips.length > 0 ? roundWholeXaf(totalNet) : fallback.totalNet,
    };

    await db.payrollPeriod.update({
      where: { id: period.id },
      data: {
        status: "READY",
        totalEmployees: totals.totalEmployees,
        totalGross: totals.totalGross,
        totalDeductions: totals.totalDeductions,
        totalNet: totals.totalNet,
      },
    });
    await db.payrollRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", completedAt: new Date(), processedEmployees: eligible.length },
    });
    await audit({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      action: "payroll.process_completed",
      entityType: "PayrollRun",
      entityId: run.id,
      metadata: { period: period.name, payrollPeriodId: period.id, ...totals, skippedApprovedPayslips },
      ...meta,
    });

    return {
      runId: run.id,
      periodStatus: "READY",
      ...totals,
      skippedApprovedPayslips,
      missingPaymentCount,
    };
  } catch (error) {
    // System rollback edge IN_PROGRESS -> DRAFT (state machine, SYSTEM_TRANSITIONS).
    console.error("[payroll] processing run failed; rolling period back to DRAFT", error);
    await db.payrollRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
      },
    });
    await db.payrollPeriod.update({ where: { id: period.id }, data: { status: "DRAFT" } });
    await audit({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      action: "payroll.process_failed",
      entityType: "PayrollRun",
      entityId: run.id,
      metadata: {
        period: period.name,
        payrollPeriodId: period.id,
        rollbackTo: "DRAFT",
        error: error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
      },
      ...meta,
    });
    if (error instanceof AppError) throw error;
    throw new AppError(
      "INTERNAL",
      "Processing failed and the period was rolled back to DRAFT. Nothing was charged; please try again.",
    );
  }
}

// ── Payslip listing for the period tab ──────────────────────────────

export interface PayslipListRow {
  id: string;
  employeeId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string;
  payslipNumber: string;
  status: PayslipStatus;
  basicSalary: string;
  overtimePay: string;
  grossSalary: string;
  deductions: string;
  netSalary: string;
}

export async function listPayslipsForPeriod(
  companyId: string,
  payrollPeriodId: string,
): Promise<PayslipListRow[]> {
  const rows = await getDb().payslip.findMany({
    where: { companyId, payrollPeriodId },
    orderBy: [{ employee: { lastName: "asc" } }, { employee: { firstName: "asc" } }],
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
  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employee.id,
    fullName: `${row.employee.firstName} ${row.employee.lastName}`,
    employeeCode: row.employee.employeeCode,
    departmentName: row.employee.department.name,
    payslipNumber: row.payslipNumber,
    status: row.status,
    basicSalary: row.basicSalary.toString(),
    overtimePay: row.overtimePay.toString(),
    grossSalary: row.grossSalary.toString(),
    deductions: row.deductions.toString(),
    netSalary: row.netSalary.toString(),
  }));
}