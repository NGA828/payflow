import Big from "big.js";
import type { PayrollPeriodStatus, AdjustmentType } from "@prisma/client";
import { getDb } from "@/lib/db";
import { roundWholeXaf } from "@/server/payroll/money";
import type { CompanyContext } from "@/server/tenant/context";

/**
 * Reports (P13): 7 reports over finalized payroll only (APPROVED/PAID/LOCKED).
 * All money is whole-XAF strings rounded half-up, matching payslip footing.
 * Filters are optional — date range on period start/end, department, employee.
 */

export const FINALIZED_STATUSES: readonly PayrollPeriodStatus[] = [
  "APPROVED",
  "PAID",
  "LOCKED",
];

export type ReportType =
  | "summary"
  | "by-dept"
  | "trend"
  | "overtime"
  | "bonuses"
  | "deductions"
  | "per-employee";

export const REPORT_TYPES: readonly ReportType[] = [
  "summary",
  "by-dept",
  "trend",
  "overtime",
  "bonuses",
  "deductions",
  "per-employee",
];

export interface ReportFilters {
  from?: Date | null;
  to?: Date | null;
  departmentId?: string | null;
  employeeId?: string | null;
  periodId?: string | null;
}

export interface ReportPeriodRow {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  payDate: Date;
  status: PayrollPeriodStatus;
  totalEmployees: number | null;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
}

interface PeriodRecord {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  payDate: Date;
  status: PayrollPeriodStatus;
  totalEmployees: number | null;
  totalGross: unknown | null;
  totalDeductions: unknown | null;
  totalNet: unknown | null;
}

function toStringAmount(v: unknown | null): string {
  if (v === null || v === undefined) return "0";
  return (v as { toString(): string }).toString();
}

async function fetchFinalizedPeriods(
  companyId: string,
  filters: ReportFilters,
): Promise<PeriodRecord[]> {
  const db = getDb();
  const where: Record<string, unknown> = {
    companyId,
    status: { in: [...FINALIZED_STATUSES] },
  };
  if (filters.from) {
    (where as { startDate?: { gte: Date } }).startDate = { gte: filters.from };
  }
  if (filters.to) {
    // to is inclusive on endDate
    (where as { endDate?: { lte: Date } }).endDate = { lte: filters.to };
  }
  if (filters.periodId) {
    (where as { id: string }).id = filters.periodId;
  }
  const rows = await db.payrollPeriod.findMany({
    where: where as never,
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      payDate: true,
      status: true,
      totalEmployees: true,
      totalGross: true,
      totalDeductions: true,
      totalNet: true,
    },
  });
  return rows as unknown as PeriodRecord[];
}

interface PayslipWithEmployee {
  id: string;
  payrollPeriodId: string;
  employeeId: string;
  basicSalary: unknown;
  overtimePay: unknown;
  bonuses: unknown;
  allowances: unknown;
  grossSalary: unknown;
  tax: unknown;
  deductions: unknown;
  netSalary: unknown;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    departmentId: string;
    department: { id: string; name: string };
    position: { title: string };
  };
}

async function fetchPayslipsForPeriods(
  companyId: string,
  periodIds: string[],
  filters: ReportFilters,
): Promise<PayslipWithEmployee[]> {
  if (periodIds.length === 0) return [];
  const db = getDb();
  const where: Record<string, unknown> = {
    companyId,
    payrollPeriodId: { in: periodIds },
  };
  const employeeWhere: Record<string, unknown> = {};
  if (filters.departmentId) employeeWhere.departmentId = filters.departmentId;
  if (filters.employeeId) employeeWhere.id = filters.employeeId;
  if (Object.keys(employeeWhere).length > 0) {
    (where as { employee: unknown }).employee = employeeWhere;
  }
  const rows = await db.payslip.findMany({
    where: where as never,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          departmentId: true,
          department: { select: { id: true, name: true } },
          position: { select: { title: true } },
        },
      },
    },
    orderBy: [{ payrollPeriodId: "asc" }, { employee: { lastName: "asc" } }],
  });
  return rows as unknown as PayslipWithEmployee[];
}

interface AdjustmentRaw {
  id: string;
  payrollPeriodId: string;
  employeeId: string;
  type: AdjustmentType;
  category: "EARNING" | "DEDUCTION";
  amount: unknown;
  hours: unknown | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    departmentId: string;
    department: { id: string; name: string };
  };
  payrollPeriod: { id: string; name: string; startDate: Date };
}

async function fetchAdjustmentsForPeriods(
  companyId: string,
  periodIds: string[],
  filters: ReportFilters,
  types?: AdjustmentType[],
): Promise<AdjustmentRaw[]> {
  if (periodIds.length === 0) return [];
  const db = getDb();
  const where: Record<string, unknown> = {
    companyId,
    payrollPeriodId: { in: periodIds },
  };
  if (types && types.length > 0) {
    (where as { type: { in: AdjustmentType[] } }).type = { in: types };
  }
  if (filters.departmentId || filters.employeeId) {
    const empWhere: Record<string, unknown> = {};
    if (filters.departmentId) empWhere.departmentId = filters.departmentId;
    if (filters.employeeId) empWhere.id = filters.employeeId;
    (where as { employee: unknown }).employee = empWhere;
  }
  const rows = await db.payrollAdjustment.findMany({
    where: where as never,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          departmentId: true,
          department: { select: { id: true, name: true } },
        },
      },
      payrollPeriod: { select: { id: true, name: true, startDate: true } },
    },
    orderBy: [{ payrollPeriod: { startDate: "asc" } }, { employee: { lastName: "asc" } }],
  });
  return rows as unknown as AdjustmentRaw[];
}

// ── Summary ──────────────────────────────────────────────────────────

export interface SummaryReport {
  periods: ReportPeriodRow[];
  kpis: {
    totalPeriods: number;
    totalGross: string;
    totalDeductions: string;
    totalNet: string;
    avgNet: string;
    totalEmployeesPaid: number;
  };
}

export async function getSummaryReport(
  companyId: string,
  filters: ReportFilters,
): Promise<SummaryReport> {
  const periodRecords = await fetchFinalizedPeriods(companyId, filters);
  const periods: ReportPeriodRow[] = periodRecords.map((p) => ({
    id: p.id,
    name: p.name,
    startDate: p.startDate,
    endDate: p.endDate,
    payDate: p.payDate,
    status: p.status,
    totalEmployees: p.totalEmployees,
    totalGross: roundWholeXaf(toStringAmount(p.totalGross)),
    totalDeductions: roundWholeXaf(toStringAmount(p.totalDeductions)),
    totalNet: roundWholeXaf(toStringAmount(p.totalNet)),
  }));

  let gross = new Big(0);
  let deductions = new Big(0);
  let net = new Big(0);
  let employeesSum = 0;
  for (const p of periods) {
    gross = gross.plus(p.totalGross);
    deductions = deductions.plus(p.totalDeductions);
    net = net.plus(p.totalNet);
    employeesSum += p.totalEmployees ?? 0;
  }
  const totalPeriods = periods.length;
  const avgNet = totalPeriods > 0 ? net.div(totalPeriods) : new Big(0);

  return {
    periods,
    kpis: {
      totalPeriods,
      totalGross: roundWholeXaf(gross),
      totalDeductions: roundWholeXaf(deductions),
      totalNet: roundWholeXaf(net),
      avgNet: roundWholeXaf(avgNet),
      totalEmployeesPaid: employeesSum,
    },
  };
}

// ── By Department ────────────────────────────────────────────────────

export interface DeptCostRow {
  departmentId: string;
  departmentName: string;
  employees: number;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  avgNet: string;
}

export interface ByDeptReport {
  periods: ReportPeriodRow[];
  departments: DeptCostRow[];
  periodDeptMatrix: Array<{
    periodId: string;
    periodName: string;
    departmentId: string;
    departmentName: string;
    employees: number;
    totalNet: string;
  }>;
}

export async function getByDeptReport(
  companyId: string,
  filters: ReportFilters,
): Promise<ByDeptReport> {
  const summary = await getSummaryReport(companyId, filters);
  const periodIds = summary.periods.map((p) => p.id);
  const payslips = await fetchPayslipsForPeriods(companyId, periodIds, filters);

  type Bucket = {
    departmentId: string;
    departmentName: string;
    employeeIds: Set<string>;
    gross: Big;
    deductions: Big;
    net: Big;
  };
  const buckets = new Map<string, Bucket>();
  type MatrixKey = string; // periodId|deptId
  const matrix = new Map<
    MatrixKey,
    { periodId: string; periodName: string; departmentId: string; departmentName: string; employeeIds: Set<string>; net: Big }
  >();

  for (const slip of payslips) {
    const deptId = slip.employee.department.id;
    const deptName = slip.employee.department.name;
    const b = buckets.get(deptId) ?? {
      departmentId: deptId,
      departmentName: deptName,
      employeeIds: new Set<string>(),
      gross: new Big(0),
      deductions: new Big(0),
      net: new Big(0),
    };
    b.employeeIds.add(slip.employeeId);
    b.gross = b.gross.plus(toStringAmount(slip.grossSalary));
    b.deductions = b.deductions.plus(toStringAmount(slip.deductions));
    b.net = b.net.plus(toStringAmount(slip.netSalary));
    buckets.set(deptId, b);

    const period = summary.periods.find((p) => p.id === slip.payrollPeriodId);
    if (!period) continue;
    const key = `${slip.payrollPeriodId}|${deptId}`;
    const m = matrix.get(key) ?? {
      periodId: period.id,
      periodName: period.name,
      departmentId: deptId,
      departmentName: deptName,
      employeeIds: new Set<string>(),
      net: new Big(0),
    };
    m.employeeIds.add(slip.employeeId);
    m.net = m.net.plus(toStringAmount(slip.netSalary));
    matrix.set(key, m);
  }

  const departments: DeptCostRow[] = [...buckets.values()]
    .map((b) => ({
      departmentId: b.departmentId,
      departmentName: b.departmentName,
      employees: b.employeeIds.size,
      totalGross: roundWholeXaf(b.gross),
      totalDeductions: roundWholeXaf(b.deductions),
      totalNet: roundWholeXaf(b.net),
      avgNet: b.employeeIds.size > 0 ? roundWholeXaf(b.net.div(b.employeeIds.size)) : "0",
    }))
    .sort((a, b) => new Big(b.totalNet).cmp(new Big(a.totalNet)));

  const periodDeptMatrix = [...matrix.values()]
    .map((m) => ({
      periodId: m.periodId,
      periodName: m.periodName,
      departmentId: m.departmentId,
      departmentName: m.departmentName,
      employees: m.employeeIds.size,
      totalNet: roundWholeXaf(m.net),
    }))
    .sort((a, b) => {
      if (a.periodId !== b.periodId) return a.periodName.localeCompare(b.periodName);
      return a.departmentName.localeCompare(b.departmentName);
    });

  return { periods: summary.periods, departments, periodDeptMatrix };
}

// ── Trend ────────────────────────────────────────────────────────────

export interface TrendPoint {
  periodId: string;
  periodName: string;
  startDate: Date;
  endDate: Date;
  totalEmployees: number | null;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
}

export interface TrendReport {
  points: TrendPoint[];
  kpis: {
    firstNet: string | null;
    lastNet: string | null;
    delta: string | null;
    deltaPct: string | null;
    totalNet: string;
    avgNet: string;
  };
}

export async function getTrendReport(
  companyId: string,
  filters: ReportFilters,
): Promise<TrendReport> {
  const summary = await getSummaryReport(companyId, filters);
  const points: TrendPoint[] = summary.periods.map((p) => ({
    periodId: p.id,
    periodName: p.name,
    startDate: p.startDate,
    endDate: p.endDate,
    totalEmployees: p.totalEmployees,
    totalGross: p.totalGross,
    totalDeductions: p.totalDeductions,
    totalNet: p.totalNet,
  }));

  let totalNet = new Big(0);
  for (const pt of points) totalNet = totalNet.plus(pt.totalNet);

  const first = points[0];
  const last = points[points.length - 1];
  let delta: Big | null = null;
  let deltaPct: string | null = null;
  if (first && last && points.length > 1) {
    const firstNet = new Big(first.totalNet);
    const lastNet = new Big(last.totalNet);
    if (!firstNet.eq(0)) {
      delta = lastNet.minus(firstNet);
      const pct = lastNet.minus(firstNet).div(firstNet.abs()).times(100).round(1, 1);
      deltaPct = `${pct.gte(0) ? "+" : ""}${pct.toFixed(1)}%`;
    } else {
      delta = lastNet.minus(firstNet);
    }
  }

  return {
    points,
    kpis: {
      firstNet: first ? first.totalNet : null,
      lastNet: last ? last.totalNet : null,
      delta: delta ? roundWholeXaf(delta) : null,
      deltaPct,
      totalNet: roundWholeXaf(totalNet),
      avgNet: points.length > 0 ? roundWholeXaf(totalNet.div(points.length)) : "0",
    },
  };
}

// ── Overtime ─────────────────────────────────────────────────────────

export interface OvertimeRow {
  payrollPeriodId: string;
  periodName: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  totalHours: string;
  totalPay: string;
  payslipOvertimePay: string;
}

export interface OvertimeReport {
  periods: ReportPeriodRow[];
  rows: OvertimeRow[];
  byEmployee: Array<{
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    departmentName: string;
    totalHours: string;
    totalPay: string;
    periods: number;
  }>;
  kpis: { totalHours: string; totalPay: string; employeesWithOT: number };
}

export async function getOvertimeReport(
  companyId: string,
  filters: ReportFilters,
): Promise<OvertimeReport> {
  const summary = await getSummaryReport(companyId, filters);
  const periodIds = summary.periods.map((p) => p.id);
  const [payslips, adjustments] = await Promise.all([
    fetchPayslipsForPeriods(companyId, periodIds, filters),
    fetchAdjustmentsForPeriods(companyId, periodIds, filters, ["OVERTIME"]),
  ]);

  // Map adjustments by period+employee for hours & amount
  const adjMap = new Map<string, { hours: Big; pay: Big }>(); // key periodId|employeeId
  for (const adj of adjustments) {
    const key = `${adj.payrollPeriodId}|${adj.employeeId}`;
    const cur = adjMap.get(key) ?? { hours: new Big(0), pay: new Big(0) };
    if (adj.hours) cur.hours = cur.hours.plus(toStringAmount(adj.hours));
    cur.pay = cur.pay.plus(toStringAmount(adj.amount));
    adjMap.set(key, cur);
  }

  const rows: OvertimeRow[] = [];
  for (const slip of payslips) {
    const otPay = new Big(toStringAmount(slip.overtimePay));
    if (otPay.eq(0)) continue;
    const key = `${slip.payrollPeriodId}|${slip.employeeId}`;
    const adj = adjMap.get(key);
    const period = summary.periods.find((p) => p.id === slip.payrollPeriodId);
    if (!period) continue;
    rows.push({
      payrollPeriodId: slip.payrollPeriodId,
      periodName: period.name,
      employeeId: slip.employeeId,
      employeeCode: slip.employee.employeeCode,
      employeeName: `${slip.employee.firstName} ${slip.employee.lastName}`,
      departmentId: slip.employee.department.id,
      departmentName: slip.employee.department.name,
      totalHours: adj ? roundWholeXaf(adj.hours) : "0",
      totalPay: adj ? roundWholeXaf(adj.pay) : roundWholeXaf(otPay),
      payslipOvertimePay: roundWholeXaf(otPay),
    });
  }

  // By employee aggregation
  const byEmpMap = new Map<
    string,
    { employeeId: string; employeeCode: string; employeeName: string; departmentName: string; hours: Big; pay: Big; periods: Set<string> }
  >();
  for (const r of rows) {
    const cur = byEmpMap.get(r.employeeId) ?? {
      employeeId: r.employeeId,
      employeeCode: r.employeeCode,
      employeeName: r.employeeName,
      departmentName: r.departmentName,
      hours: new Big(0),
      pay: new Big(0),
      periods: new Set<string>(),
    };
    cur.hours = cur.hours.plus(r.totalHours);
    cur.pay = cur.pay.plus(r.totalPay);
    cur.periods.add(r.payrollPeriodId);
    byEmpMap.set(r.employeeId, cur);
  }

  const byEmployee = [...byEmpMap.values()]
    .map((v) => ({
      employeeId: v.employeeId,
      employeeCode: v.employeeCode,
      employeeName: v.employeeName,
      departmentName: v.departmentName,
      totalHours: v.hours.toFixed(2),
      totalPay: roundWholeXaf(v.pay),
      periods: v.periods.size,
    }))
    .sort((a, b) => new Big(b.totalPay).cmp(new Big(a.totalPay)));

  let totalHours = new Big(0);
  let totalPay = new Big(0);
  for (const r of rows) {
    totalHours = totalHours.plus(r.totalHours);
    totalPay = totalPay.plus(r.totalPay);
  }

  return {
    periods: summary.periods,
    rows: rows.sort((a, b) => a.periodName.localeCompare(b.periodName) || a.employeeCode.localeCompare(b.employeeCode)),
    byEmployee,
    kpis: {
      totalHours: totalHours.toFixed(2),
      totalPay: roundWholeXaf(totalPay),
      employeesWithOT: byEmpMap.size,
    },
  };
}

// ── Bonuses ──────────────────────────────────────────────────────────

export interface BonusRow {
  payrollPeriodId: string;
  periodName: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string;
  amount: string;
  note: string | null;
}

export interface BonusesReport {
  periods: ReportPeriodRow[];
  rows: BonusRow[];
  byEmployee: Array<{
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    departmentName: string;
    totalAmount: string;
    count: number;
  }>;
  byDepartment: Array<{ departmentId: string; departmentName: string; totalAmount: string; count: number }>;
  kpis: { totalAmount: string; count: number; employees: number };
}

export async function getBonusesReport(
  companyId: string,
  filters: ReportFilters,
): Promise<BonusesReport> {
  const summary = await getSummaryReport(companyId, filters);
  const periodIds = summary.periods.map((p) => p.id);
  const db = getDb();
  const raw = await db.payrollAdjustment.findMany({
    where: {
      companyId,
      payrollPeriodId: { in: periodIds },
      type: "BONUS",
      ...(filters.departmentId || filters.employeeId
        ? {
            employee: {
              ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
              ...(filters.employeeId ? { id: filters.employeeId } : {}),
            },
          }
        : {}),
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { id: true, name: true } } } },
      payrollPeriod: { select: { id: true, name: true } },
    },
    orderBy: [{ payrollPeriod: { startDate: "asc" } }, { employee: { lastName: "asc" } }],
  });

  const rows: BonusRow[] = raw.map((adj) => ({
    payrollPeriodId: adj.payrollPeriodId,
    periodName: (adj.payrollPeriod as { name: string }).name,
    employeeId: adj.employeeId,
    employeeCode: adj.employee.employeeCode,
    employeeName: `${adj.employee.firstName} ${adj.employee.lastName}`,
    departmentName: adj.employee.department.name,
    amount: roundWholeXaf(toStringAmount(adj.amount)),
    note: (adj as { note: string | null }).note ?? null,
  }));

  const byEmp = new Map<string, { id: string; code: string; name: string; dept: string; total: Big; count: number }>();
  const byDept = new Map<string, { id: string; name: string; total: Big; count: number }>();
  let totalAmount = new Big(0);
  for (const r of rows) {
    totalAmount = totalAmount.plus(r.amount);
    const e = byEmp.get(r.employeeId) ?? { id: r.employeeId, code: r.employeeCode, name: r.employeeName, dept: r.departmentName, total: new Big(0), count: 0 };
    e.total = e.total.plus(r.amount);
    e.count += 1;
    byEmp.set(r.employeeId, e);

    // find dept id via first match — we have it in raw but not in rows; reconstruct from raw
    const rawMatch = raw.find((a) => a.id && a.employeeId === r.employeeId && a.payrollPeriodId === r.payrollPeriodId);
    const deptId = rawMatch?.employee.department.id ?? r.departmentName;
    const d = byDept.get(deptId) ?? { id: deptId, name: r.departmentName, total: new Big(0), count: 0 };
    d.total = d.total.plus(r.amount);
    d.count += 1;
    byDept.set(deptId, d);
  }

  return {
    periods: summary.periods,
    rows,
    byEmployee: [...byEmp.values()]
      .map((v) => ({ employeeId: v.id, employeeCode: v.code, employeeName: v.name, departmentName: v.dept, totalAmount: roundWholeXaf(v.total), count: v.count }))
      .sort((a, b) => new Big(b.totalAmount).cmp(new Big(a.totalAmount))),
    byDepartment: [...byDept.values()]
      .map((v) => ({ departmentId: v.id, departmentName: v.name, totalAmount: roundWholeXaf(v.total), count: v.count }))
      .sort((a, b) => new Big(b.totalAmount).cmp(new Big(a.totalAmount))),
    kpis: { totalAmount: roundWholeXaf(totalAmount), count: rows.length, employees: byEmp.size },
  };
}

// ── Deductions ───────────────────────────────────────────────────────

export type DeductionType = "LOAN" | "ADVANCE" | "PENALTY" | "OTHER_DEDUCTION" | "TAX";

export const DEDUCTION_TYPES: readonly DeductionType[] = [
  "LOAN",
  "ADVANCE",
  "PENALTY",
  "OTHER_DEDUCTION",
  "TAX",
];

export interface DeductionRow {
  payrollPeriodId: string;
  periodName: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string;
  type: DeductionType;
  amount: string;
  note: string | null;
}

export interface DeductionsReport {
  periods: ReportPeriodRow[];
  rows: DeductionRow[];
  byType: Array<{ type: DeductionType; totalAmount: string; count: number }>;
  byEmployee: Array<{
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    departmentName: string;
    totalAmount: string;
    byType: Record<string, string>;
  }>;
  kpis: { totalAmount: string; count: number };
}

export async function getDeductionsReport(
  companyId: string,
  filters: ReportFilters,
): Promise<DeductionsReport> {
  const summary = await getSummaryReport(companyId, filters);
  const periodIds = summary.periods.map((p) => p.id);
  if (periodIds.length === 0) {
    return { periods: [], rows: [], byType: [], byEmployee: [], kpis: { totalAmount: "0", count: 0 } };
  }
  const db = getDb();
  const raw = await db.payrollAdjustment.findMany({
    where: {
      companyId,
      payrollPeriodId: { in: periodIds },
      type: { in: [...DEDUCTION_TYPES] },
      ...(filters.departmentId || filters.employeeId
        ? {
            employee: {
              ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
              ...(filters.employeeId ? { id: filters.employeeId } : {}),
            },
          }
        : {}),
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { id: true, name: true } } } },
      payrollPeriod: { select: { id: true, name: true } },
    },
    orderBy: [{ payrollPeriod: { startDate: "asc" } }, { type: "asc" }],
  });

  const rows: DeductionRow[] = raw.map((adj) => ({
    payrollPeriodId: adj.payrollPeriodId,
    periodName: (adj.payrollPeriod as { name: string }).name,
    employeeId: adj.employeeId,
    employeeCode: adj.employee.employeeCode,
    employeeName: `${adj.employee.firstName} ${adj.employee.lastName}`,
    departmentName: adj.employee.department.name,
    type: adj.type as DeductionType,
    amount: roundWholeXaf(toStringAmount(adj.amount)),
    note: (adj as { note: string | null }).note ?? null,
  }));

  const byTypeMap = new Map<DeductionType, { total: Big; count: number }>();
  for (const t of DEDUCTION_TYPES) byTypeMap.set(t, { total: new Big(0), count: 0 });
  let total = new Big(0);
  for (const r of rows) {
    total = total.plus(r.amount);
    const b = byTypeMap.get(r.type);
    if (b) {
      b.total = b.total.plus(r.amount);
      b.count += 1;
      byTypeMap.set(r.type, b);
    }
  }

  const byType = [...byTypeMap.entries()]
    .map(([type, v]) => ({ type, totalAmount: roundWholeXaf(v.total), count: v.count }))
    .filter((x) => x.count > 0)
    .sort((a, b) => new Big(b.totalAmount).cmp(new Big(a.totalAmount)));

  const byEmpMap = new Map<
    string,
    {
      id: string;
      code: string;
      name: string;
      dept: string;
      total: Big;
      byType: Map<string, Big>;
    }
  >();
  for (const r of rows) {
    const cur = byEmpMap.get(r.employeeId) ?? {
      id: r.employeeId,
      code: r.employeeCode,
      name: r.employeeName,
      dept: r.departmentName,
      total: new Big(0),
      byType: new Map<string, Big>(),
    };
    cur.total = cur.total.plus(r.amount);
    const prev = cur.byType.get(r.type) ?? new Big(0);
    cur.byType.set(r.type, prev.plus(r.amount));
    byEmpMap.set(r.employeeId, cur);
  }

  const byEmployee = [...byEmpMap.values()]
    .map((v) => ({
      employeeId: v.id,
      employeeCode: v.code,
      employeeName: v.name,
      departmentName: v.dept,
      totalAmount: roundWholeXaf(v.total),
      byType: Object.fromEntries([...v.byType.entries()].map(([k, bv]) => [k, roundWholeXaf(bv)])),
    }))
    .sort((a, b) => new Big(b.totalAmount).cmp(new Big(a.totalAmount)));

  return {
    periods: summary.periods,
    rows,
    byType,
    byEmployee,
    kpis: { totalAmount: roundWholeXaf(total), count: rows.length },
  };
}

// ── Per Employee ─────────────────────────────────────────────────────

export interface PerEmployeePeriodRow {
  payrollPeriodId: string;
  periodName: string;
  startDate: Date;
  endDate: Date;
  basicSalary: string;
  overtimePay: string;
  grossSalary: string;
  deductions: string;
  netSalary: string;
}

export interface PerEmployeeReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  periodsPaid: number;
  avgNet: string;
  history: PerEmployeePeriodRow[];
}

export interface PerEmployeeReport {
  periods: ReportPeriodRow[];
  employees: PerEmployeeReportRow[];
  kpis: {
    totalEmployees: number;
    totalGross: string;
    totalNet: string;
    avgNet: string;
  };
}

export async function getPerEmployeeReport(
  companyId: string,
  filters: ReportFilters,
): Promise<PerEmployeeReport> {
  const summary = await getSummaryReport(companyId, filters);
  const periodIds = summary.periods.map((p) => p.id);
  const payslips = await fetchPayslipsForPeriods(companyId, periodIds, filters);

  const empMap = new Map<
    string,
    {
      id: string;
      code: string;
      name: string;
      deptId: string;
      deptName: string;
      gross: Big;
      deductions: Big;
      net: Big;
      history: PerEmployeePeriodRow[];
    }
  >();

  // For chronological history per employee
  const periodOrder = new Map<string, number>();
  summary.periods.forEach((p, idx) => periodOrder.set(p.id, idx));

  for (const slip of payslips) {
    const cur = empMap.get(slip.employeeId) ?? {
      id: slip.employeeId,
      code: slip.employee.employeeCode,
      name: `${slip.employee.firstName} ${slip.employee.lastName}`,
      deptId: slip.employee.department.id,
      deptName: slip.employee.department.name,
      gross: new Big(0),
      deductions: new Big(0),
      net: new Big(0),
      history: [] as PerEmployeePeriodRow[],
    };
    cur.gross = cur.gross.plus(toStringAmount(slip.grossSalary));
    cur.deductions = cur.deductions.plus(toStringAmount(slip.deductions));
    cur.net = cur.net.plus(toStringAmount(slip.netSalary));
    const period = summary.periods.find((p) => p.id === slip.payrollPeriodId);
    if (period) {
      cur.history.push({
        payrollPeriodId: slip.payrollPeriodId,
        periodName: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        basicSalary: roundWholeXaf(toStringAmount(slip.basicSalary)),
        overtimePay: roundWholeXaf(toStringAmount(slip.overtimePay)),
        grossSalary: roundWholeXaf(toStringAmount(slip.grossSalary)),
        deductions: roundWholeXaf(toStringAmount(slip.deductions)),
        netSalary: roundWholeXaf(toStringAmount(slip.netSalary)),
      });
    }
    empMap.set(slip.employeeId, cur);
  }

  // Sort history by start date per employee
  for (const v of empMap.values()) {
    v.history.sort((a, b) => periodOrder.get(a.payrollPeriodId)! - periodOrder.get(b.payrollPeriodId)!);
  }

  const employees: PerEmployeeReportRow[] = [...empMap.values()]
    .map((v) => ({
      employeeId: v.id,
      employeeCode: v.code,
      employeeName: v.name,
      departmentId: v.deptId,
      departmentName: v.deptName,
      totalGross: roundWholeXaf(v.gross),
      totalDeductions: roundWholeXaf(v.deductions),
      totalNet: roundWholeXaf(v.net),
      periodsPaid: v.history.length,
      avgNet: v.history.length > 0 ? roundWholeXaf(v.net.div(v.history.length)) : "0",
      history: v.history,
    }))
    .sort((a, b) => new Big(b.totalNet).cmp(new Big(a.totalNet)));

  let totalGross = new Big(0);
  let totalNet = new Big(0);
  for (const e of employees) {
    totalGross = totalGross.plus(e.totalGross);
    totalNet = totalNet.plus(e.totalNet);
  }

  return {
    periods: summary.periods,
    employees,
    kpis: {
      totalEmployees: employees.length,
      totalGross: roundWholeXaf(totalGross),
      totalNet: roundWholeXaf(totalNet),
      avgNet: employees.length > 0 ? roundWholeXaf(totalNet.div(employees.length)) : "0",
    },
  };
}

// ── Dispatcher ───────────────────────────────────────────────────────

export async function getReport(
  companyId: string,
  type: ReportType,
  filters: ReportFilters,
): Promise<SummaryReport | ByDeptReport | TrendReport | OvertimeReport | BonusesReport | DeductionsReport | PerEmployeeReport> {
  switch (type) {
    case "summary":
      return getSummaryReport(companyId, filters);
    case "by-dept":
      return getByDeptReport(companyId, filters);
    case "trend":
      return getTrendReport(companyId, filters);
    case "overtime":
      return getOvertimeReport(companyId, filters);
    case "bonuses":
      return getBonusesReport(companyId, filters);
    case "deductions":
      return getDeductionsReport(companyId, filters);
    case "per-employee":
      return getPerEmployeeReport(companyId, filters);
    default:
      return getSummaryReport(companyId, filters);
  }
}

// ── Helpers for filtering UI ─────────────────────────────────────────

export async function getReportFilterOptions(companyId: string) {
  const db = getDb();
  const [departments, employees, periods] = await Promise.all([
    db.department.findMany({
      where: { companyId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.employee.findMany({
      where: { companyId },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 200,
    }),
    db.payrollPeriod.findMany({
      where: { companyId, status: { in: [...FINALIZED_STATUSES] } },
      select: { id: true, name: true, startDate: true },
      orderBy: { startDate: "desc" },
      take: 50,
    }),
  ]);
  return { departments, employees, periods };
}

export async function getAllReports(
  ctx: CompanyContext,
  filters: ReportFilters,
): Promise<{
  summary: SummaryReport;
  byDept: ByDeptReport;
  trend: TrendReport;
}> {
  const [summary, byDept, trend] = await Promise.all([
    getSummaryReport(ctx.company.id, filters),
    getByDeptReport(ctx.company.id, filters),
    getTrendReport(ctx.company.id, filters),
  ]);
  return { summary, byDept, trend };
}
