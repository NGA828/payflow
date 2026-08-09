import { Prisma, type AdjustmentType, type PayrollPeriodStatus } from "@prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/security/audit";
import { overtimePayForHours } from "@/server/payroll/money";
import { isPayrollEligible } from "@/server/services/employee.service";
import type { CompanyContext } from "@/server/tenant/context";
import { assertCompanyWritable } from "@/server/tenant/status";
import { categoryOf } from "@/validations/adjustment";
import type { AdjustmentFormInput } from "@/validations/adjustment";

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ── Editability (pure) ──────────────────────────────────────────────

/**
 * Adjustments are editable while a period is in DRAFT or READY (re-processing
 * in READY replaces draft payslips, so edits stay consistent), frozen while
 * the engine runs (IN_PROGRESS), and locked from SUBMITTED onwards.
 */
export function adjustmentsEditable(status: PayrollPeriodStatus): boolean {
  return status === "DRAFT" || status === "READY";
}

export function assertAdjustmentsEditable(status: PayrollPeriodStatus, periodName: string): void {
  if (!adjustmentsEditable(status)) {
    throw new AppError(
      "BAD_REQUEST",
      status === "IN_PROGRESS"
        ? `“${periodName}” is being processed right now — adjustments unlock when it is READY.`
        : `“${periodName}” is ${status} — adjustments are locked once a period is submitted.`,
    );
  }
}

// ── Read model ──────────────────────────────────────────────────────

export interface AdjustmentRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  type: AdjustmentType;
  category: "EARNING" | "DEDUCTION";
  amount: string;
  hours: string | null;
  note: string | null;
  createdByName: string;
  createdAt: Date;
}

export interface AdjustmentTotals {
  earningCount: number;
  deductionCount: number;
  /** Whole-XAF sums as strings. */
  earningsTotal: string;
  deductionsTotal: string;
  /** Sum of signed impact: earnings − deductions. */
  netImpact: string;
  /** Per-employee rollups (earnings, deductions), employeeId-keyed order. */
  perEmployee: Array<{
    employeeId: string;
    employeeName: string;
    earningsTotal: string;
    deductionsTotal: string;
  }>;
}

export interface AdjustmentBoard {
  rows: AdjustmentRow[];
  totals: AdjustmentTotals;
}

export async function listAdjustments(
  companyId: string,
  payrollPeriodId: string,
): Promise<AdjustmentBoard> {
  const db = getDb();
  const adjustments = await db.payrollAdjustment.findMany({
    where: { companyId, payrollPeriodId },
    orderBy: [
      { employee: { lastName: "asc" } },
      { employee: { firstName: "asc" } },
      { createdAt: "asc" },
    ],
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      createdBy: { select: { fullName: true } },
    },
  });

  let earningsTotal = new Prisma.Decimal(0);
  let deductionsTotal = new Prisma.Decimal(0);
  let earningCount = 0;
  let deductionCount = 0;
  const perEmployee = new Map<
    string,
    { employeeId: string; employeeName: string; earningsTotal: Prisma.Decimal; deductionsTotal: Prisma.Decimal }
  >();

  const rows: AdjustmentRow[] = adjustments.map((row) => {
    const category = categoryOf(row.type);
    if (category === "EARNING") {
      earningsTotal = earningsTotal.add(row.amount);
      earningCount += 1;
    } else {
      deductionsTotal = deductionsTotal.add(row.amount);
      deductionCount += 1;
    }
    const employeeName = `${row.employee.firstName} ${row.employee.lastName}`;
    const bucket = perEmployee.get(row.employeeId) ?? {
      employeeId: row.employeeId,
      employeeName,
      earningsTotal: new Prisma.Decimal(0),
      deductionsTotal: new Prisma.Decimal(0),
    };
    if (category === "EARNING") bucket.earningsTotal = bucket.earningsTotal.add(row.amount);
    else bucket.deductionsTotal = bucket.deductionsTotal.add(row.amount);
    perEmployee.set(row.employeeId, bucket);

    return {
      id: row.id,
      employeeId: row.employeeId,
      employeeName,
      employeeCode: row.employee.employeeCode,
      type: row.type,
      category,
      amount: row.amount.toString(),
      hours: row.hours?.toString() ?? null,
      note: row.note,
      createdByName: row.createdBy.fullName,
      createdAt: row.createdAt,
    };
  });

  return {
    rows,
    totals: {
      earningCount,
      deductionCount,
      earningsTotal: earningsTotal.toString(),
      deductionsTotal: deductionsTotal.toString(),
      netImpact: earningsTotal.sub(deductionsTotal).toString(),
      perEmployee: [...perEmployee.values()].map((bucket) => ({
        ...bucket,
        earningsTotal: bucket.earningsTotal.toString(),
        deductionsTotal: bucket.deductionsTotal.toString(),
      })),
    },
  };
}

// ── Guards ──────────────────────────────────────────────────────────

async function requirePeriodInCompany(ctx: CompanyContext, payrollPeriodId: string) {
  const period = await getDb().payrollPeriod.findFirst({
    where: { id: payrollPeriodId, companyId: ctx.company.id },
  });
  if (!period) throw new AppError("NOT_FOUND", "Payroll period not found.");
  return period;
}

async function requireEligibleEmployee(
  ctx: CompanyContext,
  employeeId: string,
  period: { startDate: Date; endDate: Date; name: string },
) {
  const employee = await getDb().employee.findFirst({
    where: { id: employeeId, companyId: ctx.company.id },
  });
  if (!employee) {
    throw new AppError("VALIDATION", "We could not find that employee in your workspace.", {
      employeeId: ["Choose a valid employee"],
    });
  }
  if (!isPayrollEligible(employee, period.startDate, period.endDate)) {
    throw new AppError(
      "BAD_REQUEST",
      `${employee.firstName} ${employee.lastName} is not in scope for ${period.name} — adjustments only apply to eligible employees.`,
      { employeeId: ["This employee is excluded from this period"] },
    );
  }
  return employee;
}

/**
 * Resolves the stored amount: explicit for every type except OVERTIME, which
 * is computed from hours × (salary / (weeklyHours × 52/12)) × multiplier —
 * same pure helper the payroll engine uses, so numbers always agree.
 */
function resolveAmount(
  ctx: CompanyContext,
  employee: { basicSalary: Prisma.Decimal },
  input: AdjustmentFormInput,
): { amount: string; computed: boolean } {
  if (input.type !== "OVERTIME") {
    if (!input.amount) {
      throw new AppError("VALIDATION", "Enter the amount in XAF.", {
        amount: ["Enter the amount in XAF"],
      });
    }
    return { amount: input.amount, computed: false };
  }
  if (!input.hours) {
    throw new AppError("VALIDATION", "Overtime needs the hours worked.", {
      hours: ["Overtime needs the hours worked"],
    });
  }
  const amount = overtimePayForHours(
    employee.basicSalary,
    input.hours,
    ctx.company.standardHoursPerWeek,
    ctx.company.overtimeMultiplier,
  );
  return { amount, computed: true };
}

// ── Mutations ───────────────────────────────────────────────────────

export async function createAdjustment(
  ctx: CompanyContext,
  payrollPeriodId: string,
  input: AdjustmentFormInput,
  meta: RequestMeta = {},
): Promise<{ id: string }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const period = await requirePeriodInCompany(ctx, payrollPeriodId);
  assertAdjustmentsEditable(period.status, period.name);
  const employee = await requireEligibleEmployee(ctx, input.employeeId, period);
  const { amount, computed } = resolveAmount(ctx, employee, input);

  const adjustment = await db.payrollAdjustment.create({
    data: {
      companyId: ctx.company.id,
      payrollPeriodId: period.id,
      employeeId: employee.id,
      type: input.type,
      category: categoryOf(input.type),
      amount: new Prisma.Decimal(amount),
      hours: input.hours ? new Prisma.Decimal(input.hours) : null,
      note: input.note ?? null,
      createdById: ctx.user.id,
    },
    select: { id: true },
  });

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payroll.adjustment_added",
    entityType: "PayrollAdjustment",
    entityId: adjustment.id,
    metadata: {
      period: period.name,
      payrollPeriodId: period.id,
      employeeCode: employee.employeeCode,
      type: input.type,
      amount,
      ...(computed ? { computedOvertime: true } : {}),
      ...(input.hours ? { hours: input.hours } : {}),
    },
    ...meta,
  });
  return adjustment;
}

export async function updateAdjustment(
  ctx: CompanyContext,
  adjustmentId: string,
  input: AdjustmentFormInput,
  meta: RequestMeta = {},
): Promise<void> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const existing = await db.payrollAdjustment.findFirst({
    where: { id: adjustmentId, companyId: ctx.company.id },
    include: { payrollPeriod: true },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Adjustment not found.");
  assertAdjustmentsEditable(existing.payrollPeriod.status, existing.payrollPeriod.name);
  const employee = await requireEligibleEmployee(ctx, input.employeeId, existing.payrollPeriod);
  const { amount } = resolveAmount(ctx, employee, input);

  await db.payrollAdjustment.update({
    where: { id: existing.id },
    data: {
      employeeId: employee.id,
      type: input.type,
      category: categoryOf(input.type),
      amount: new Prisma.Decimal(amount),
      hours: input.hours ? new Prisma.Decimal(input.hours) : null,
      note: input.note ?? null,
    },
  });

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payroll.adjustment_updated",
    entityType: "PayrollAdjustment",
    entityId: existing.id,
    metadata: {
      period: existing.payrollPeriod.name,
      payrollPeriodId: existing.payrollPeriodId,
      employeeCode: employee.employeeCode,
      type: input.type,
      amount,
      previousAmount: existing.amount.toString(),
      previousType: existing.type,
    },
    ...meta,
  });
}

export async function deleteAdjustment(
  ctx: CompanyContext,
  adjustmentId: string,
  meta: RequestMeta = {},
): Promise<void> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const existing = await db.payrollAdjustment.findFirst({
    where: { id: adjustmentId, companyId: ctx.company.id },
    include: { payrollPeriod: true, employee: { select: { employeeCode: true } } },
  });
  if (!existing) throw new AppError("NOT_FOUND", "Adjustment not found.");
  assertAdjustmentsEditable(existing.payrollPeriod.status, existing.payrollPeriod.name);

  await db.payrollAdjustment.delete({ where: { id: existing.id } });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payroll.adjustment_deleted",
    entityType: "PayrollAdjustment",
    entityId: existing.id,
    metadata: {
      period: existing.payrollPeriod.name,
      payrollPeriodId: existing.payrollPeriodId,
      employeeCode: existing.employee.employeeCode,
      type: existing.type,
      amount: existing.amount.toString(),
    },
    ...meta,
  });
}