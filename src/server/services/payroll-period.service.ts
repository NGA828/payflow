import type { PayrollPeriodStatus } from "@prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/security/audit";
import { PREP_STATUSES } from "@/server/payroll/state-machine";
import {
  isPayrollEligible,
  parseDateOnly,
  type PayrollEligibilityRecord,
} from "@/server/services/employee.service";
import type { CompanyContext } from "@/server/tenant/context";
import { assertCompanyWritable } from "@/server/tenant/status";
import { formatDate, formatPeriodLabel } from "@/lib/format";
import type { CreatePeriodInput } from "@/validations/payroll";

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ── Pure date predicates (unit-tested) ──────────────────────────────

/** Day-inclusive intersection: Aug 1–31 and Aug 31–Sep 30 DO overlap. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** "August 2026" for a whole-month period, otherwise an explicit range. */
export function periodLabel(start: Date, end: Date): string {
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  return sameMonth ? formatPeriodLabel(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

export type ExclusionReason =
  | "INACTIVE"
  | "HIRED_AFTER_PERIOD"
  | "TERMINATED_BEFORE_PERIOD"
  | "ZERO_SALARY";

export type EligibilitySubject = PayrollEligibilityRecord;

/** Why an employee is out of scope for a period; null when eligible. */
export function exclusionReason(
  employee: EligibilitySubject,
  periodStart: Date,
  periodEnd: Date,
): ExclusionReason | null {
  if (isPayrollEligible(employee, periodStart, periodEnd)) return null;
  if (employee.status === "INACTIVE") return "INACTIVE";
  if (employee.dateHired > periodEnd) return "HIRED_AFTER_PERIOD";
  if (employee.status === "TERMINATED" && (employee.terminationDate ?? periodEnd) < periodStart) {
    return "TERMINATED_BEFORE_PERIOD";
  }
  if (Number(employee.basicSalary) <= 0) return "ZERO_SALARY";
  return "ZERO_SALARY";
}

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  INACTIVE: "Inactive",
  HIRED_AFTER_PERIOD: "Hired after this period",
  TERMINATED_BEFORE_PERIOD: "Terminated before this period",
  ZERO_SALARY: "No basic salary set",
};

// ── List ────────────────────────────────────────────────────────────

export interface PayrollPeriodListItem {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  payDate: Date;
  status: PayrollPeriodStatus;
  totalEmployees: number | null;
  totalGross: string | null;
  totalNet: string | null;
  payslipCount: number;
  adjustmentCount: number;
}

export async function listPeriods(companyId: string): Promise<PayrollPeriodListItem[]> {
  const rows = await getDb().payrollPeriod.findMany({
    where: { companyId },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { payslips: true, adjustments: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    payDate: row.payDate,
    status: row.status,
    totalEmployees: row.totalEmployees,
    totalGross: row.totalGross?.toString() ?? null,
    totalNet: row.totalNet?.toString() ?? null,
    payslipCount: row._count.payslips,
    adjustmentCount: row._count.adjustments,
  }));
}

// ── Detail ──────────────────────────────────────────────────────────

export interface EligibilityRow {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string;
  /** null when the caller lacks employees.view_sensitive */
  basicSalary: string | null;
  exclusion: ExclusionReason | null;
}

export interface PayrollPeriodDetail {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  payDate: Date;
  status: PayrollPeriodStatus;
  notes: string | null;
  createdAt: Date;
  totalEmployees: number | null;
  totalGross: string | null;
  totalDeductions: string | null;
  totalNet: string | null;
  payslipCount: number;
  adjustmentCount: number;
  eligibleCount: number;
  excludedCount: number;
  eligibility: EligibilityRow[];
}

export async function getPeriodDetail(
  companyId: string,
  periodId: string,
  includeSensitive: boolean,
): Promise<PayrollPeriodDetail | null> {
  const db = getDb();
  const period = await db.payrollPeriod.findFirst({
    where: { id: periodId, companyId },
    include: { _count: { select: { payslips: true, adjustments: true } } },
  });
  if (!period) return null;

  const employees = await db.employee.findMany({
    where: { companyId },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      status: true,
      dateHired: true,
      terminationDate: true,
      basicSalary: true,
      department: { select: { name: true } },
    },
  });

  const eligibility: EligibilityRow[] = employees.map((employee) => ({
    employeeId: employee.id,
    fullName: `${employee.firstName} ${employee.lastName}`,
    employeeCode: employee.employeeCode,
    departmentName: employee.department.name,
    basicSalary: includeSensitive ? employee.basicSalary.toString() : null,
    exclusion: exclusionReason(employee, period.startDate, period.endDate),
  }));

  const eligibleCount = eligibility.filter((row) => row.exclusion === null).length;

  return {
    id: period.id,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    payDate: period.payDate,
    status: period.status,
    notes: period.notes,
    createdAt: period.createdAt,
    totalEmployees: period.totalEmployees,
    totalGross: period.totalGross?.toString() ?? null,
    totalDeductions: period.totalDeductions?.toString() ?? null,
    totalNet: period.totalNet?.toString() ?? null,
    payslipCount: period._count.payslips,
    adjustmentCount: period._count.adjustments,
    eligibleCount,
    excludedCount: eligibility.length - eligibleCount,
    eligibility,
  };
}

// ── Create ──────────────────────────────────────────────────────────

async function assertNoOverlap(
  companyId: string,
  start: Date,
  end: Date,
  excludeId?: string,
): Promise<void> {
  const clash = await getDb().payrollPeriod.findFirst({
    where: {
      companyId,
      endDate: { gte: start },
      startDate: { lte: end },
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { name: true, startDate: true, endDate: true },
  });
  if (clash) {
    throw new AppError(
      "CONFLICT",
      `This date range overlaps “${clash.name}” (${formatDate(clash.startDate)} – ${formatDate(clash.endDate)}). Payroll periods can never overlap.`,
      { startDate: ["Overlap with an existing period"], endDate: ["Overlap with an existing period"] },
    );
  }
}

async function assertSinglePrepPeriod(companyId: string): Promise<void> {
  const active = await getDb().payrollPeriod.findFirst({
    where: { companyId, status: { in: [...PREP_STATUSES] } },
    select: { name: true, status: true },
  });
  if (active) {
    throw new AppError(
      "CONFLICT",
      `“${active.name}” is still ${active.status === "DRAFT" ? "being prepared" : "in progress"}. Submit it for approval before opening a new period.`,
    );
  }
}

/**
 * Creates a DRAFT payroll period. Validations (schema handles date sanity):
 * no overlap with any existing period, only one pre-submission period at a
 * time, and a unique display name inside the company.
 */
export async function createPeriod(
  ctx: CompanyContext,
  input: CreatePeriodInput,
  meta: RequestMeta = {},
): Promise<{ id: string; name: string }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  const payDate = parseDateOnly(input.payDate);

  await assertNoOverlap(ctx.company.id, start, end);
  await assertSinglePrepPeriod(ctx.company.id);

  const name = periodLabel(start, end);
  const nameClash = await db.payrollPeriod.findFirst({
    where: { companyId: ctx.company.id, name },
    select: { id: true },
  });
  if (nameClash) {
    throw new AppError("CONFLICT", `A period named “${name}” already exists in this workspace.`, {
      startDate: ["This period already exists"],
    });
  }

  const period = await db.payrollPeriod.create({
    data: {
      companyId: ctx.company.id,
      name,
      startDate: start,
      endDate: end,
      payDate,
      notes: input.notes ?? null,
    },
    select: { id: true, name: true },
  });

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payroll.period_created",
    entityType: "PayrollPeriod",
    entityId: period.id,
    metadata: {
      name: period.name,
      startDate: input.startDate,
      endDate: input.endDate,
      payDate: input.payDate,
    },
    ...meta,
  });
  return period;
}

/** Only DRAFT periods with nothing computed yet can be deleted. */
export async function deletePeriod(
  ctx: CompanyContext,
  periodId: string,
  meta: RequestMeta = {},
): Promise<{ name: string }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const period = await db.payrollPeriod.findFirst({
    where: { id: periodId, companyId: ctx.company.id },
    include: { _count: { select: { payslips: true, adjustments: true } } },
  });
  if (!period) throw new AppError("NOT_FOUND", "Payroll period not found.");

  if (period.status !== "DRAFT") {
    throw new AppError(
      "BAD_REQUEST",
      `Only DRAFT periods can be deleted — “${period.name}” is already ${period.status}.`,
    );
  }
  if (period._count.payslips > 0) {
    throw new AppError("BAD_REQUEST", "This period already has payslips and can no longer be deleted.");
  }

  await db.$transaction([
    db.payrollAdjustment.deleteMany({ where: { payrollPeriodId: period.id } }),
    db.payrollPeriod.delete({ where: { id: period.id } }),
  ]);

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "payroll.period_deleted",
    entityType: "PayrollPeriod",
    entityId: period.id,
    metadata: { name: period.name },
    ...meta,
  });
  return { name: period.name };
}