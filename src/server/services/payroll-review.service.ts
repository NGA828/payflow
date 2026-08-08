import Big from "big.js";
import type { PayrollPeriodStatus } from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  detectAnomalies,
  type Anomaly,
  type AnomalyAdjustmentRef,
  type AnomalyEmployeeInput,
} from "@/server/payroll/anomalies";
import { isPaymentComplete } from "@/server/services/employee.service";
import { roundWholeXaf } from "@/server/payroll/money";

/**
 * Read model for the review cockpit (P9). Everything is computed on read from
 * stored payslips/adjustments — one source of truth, zero snapshot drift —
 * and identical figures back the period cards, the charts and the anomalies.
 */

export interface ReviewKpis {
  employees: number;
  gross: string;
  deductions: string;
  net: string;
  previous: { id: string; name: string; net: string } | null;
  /** e.g. "+4.2%" vs the previous finalized period; null without one. */
  netDeltaPct: string | null;
}

export interface DeptCostRow {
  departmentId: string;
  name: string;
  employees: number;
  gross: string;
  net: string;
}

export interface TrendPoint {
  periodId: string;
  name: string;
  /** Short axis label, e.g. "Aug 26". */
  label: string;
  status: PayrollPeriodStatus;
  net: string;
  current: boolean;
}

export interface ReviewData {
  kpis: ReviewKpis;
  deptCosts: DeptCostRow[];
  trend: TrendPoint[];
  anomalies: Anomaly[];
}

const PROCESSED_STATUSES: readonly PayrollPeriodStatus[] = [
  "READY",
  "SUBMITTED",
  "APPROVED",
  "PAID",
  "LOCKED",
];

const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });

function signedPercent(current: Big, previous: Big): string | null {
  if (previous.eq(0)) return null;
  const ratio = current.minus(previous).div(previous.abs());
  const pct = ratio.times(100).round(1, 1).toFixed(1);
  return ratio.gte(0) ? `+${pct}%` : `${pct}%`;
}

export async function getReviewData(
  companyId: string,
  payrollPeriodId: string,
): Promise<ReviewData | null> {
  const db = getDb();
  const period = await db.payrollPeriod.findFirst({
    where: { id: payrollPeriodId, companyId },
  });
  if (!period) return null;

  const payslips = await db.payslip.findMany({
    where: { companyId, payrollPeriodId: period.id },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          paymentMethodPreference: true,
          mobileMoneyProvider: true,
          bankNameEnc: true,
          bankAccountNumberEnc: true,
          mobileMoneyNumberEnc: true,
          department: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Previous finalized period (strictly earlier, fully approved onwards).
  const previous = await db.payrollPeriod.findFirst({
    where: {
      companyId,
      status: { in: ["APPROVED", "PAID", "LOCKED"] },
      endDate: { lt: period.startDate },
      totalNet: { not: null },
    },
    orderBy: { endDate: "desc" },
    select: { id: true, name: true, totalNet: true },
  });
  const previousPayslips = previous
    ? await db.payslip.findMany({
        where: { companyId, payrollPeriodId: previous.id },
        select: { employeeId: true, netSalary: true },
      })
    : [];
  const previousNetByEmployee = new Map(
    previousPayslips.map((row) => [row.employeeId, row.netSalary.toString()]),
  );

  const adjustmentRows = await db.payrollAdjustment.findMany({
    where: { companyId, payrollPeriodId: period.id },
    select: { employeeId: true, type: true, amount: true, hours: true },
  });
  const otHoursByEmployee = new Map<string, Big>();
  const anomalyAdjustments: AnomalyAdjustmentRef[] = adjustmentRows.map((row) => {
    if (row.type === "OVERTIME" && row.hours !== null) {
      const current = otHoursByEmployee.get(row.employeeId) ?? new Big(0);
      otHoursByEmployee.set(row.employeeId, current.plus(row.hours.toString()));
    }
    return {
      employeeId: row.employeeId,
      type: row.type,
      amount: roundWholeXaf(row.amount.toString()),
    };
  });

  // KPI totals — always aggregated from the stored payslip set.
  let gross = new Big(0);
  let deductions = new Big(0);
  let net = new Big(0);
  const deptBuckets = new Map<string, DeptCostRow & { grossBig: Big; netBig: Big }>();
  const anomalyEmployees: AnomalyEmployeeInput[] = [];

  for (const slip of payslips) {
    gross = gross.plus(slip.grossSalary.toString());
    deductions = deductions.plus(slip.deductions.toString());
    net = net.plus(slip.netSalary.toString());

    const dept = slip.employee.department;
    const bucket = deptBuckets.get(dept.id) ?? {
      departmentId: dept.id,
      name: dept.name,
      employees: 0,
      gross: "0",
      net: "0",
      grossBig: new Big(0),
      netBig: new Big(0),
    };
    bucket.employees += 1;
    bucket.grossBig = bucket.grossBig.plus(slip.grossSalary.toString());
    bucket.netBig = bucket.netBig.plus(slip.netSalary.toString());
    deptBuckets.set(dept.id, bucket);

    const otHours = otHoursByEmployee.get(slip.employeeId);
    const previousNetSalary = previous ? (previousNetByEmployee.get(slip.employeeId) ?? null) : null;
    anomalyEmployees.push({
      id: slip.employeeId,
      fullName: `${slip.employee.firstName} ${slip.employee.lastName}`,
      employeeCode: slip.employee.employeeCode,
      netSalary: slip.netSalary.toString(),
      basicSalary: slip.basicSalary.toString(),
      overtimePay: slip.overtimePay.toString(),
      overtimeHours: otHours ? otHours.toString() : null,
      previousNetSalary,
      previousPeriodName: previousNetSalary !== null ? (previous?.name ?? null) : null,
      paymentComplete: isPaymentComplete({
        paymentMethod: slip.employee.paymentMethodPreference,
        mobileMoneyProvider: slip.employee.mobileMoneyProvider,
        bankNameEnc: slip.employee.bankNameEnc,
        bankAccountNumberEnc: slip.employee.bankAccountNumberEnc,
        mobileMoneyNumberEnc: slip.employee.mobileMoneyNumberEnc,
      }),
    });
  }

  const deptCosts: DeptCostRow[] = [...deptBuckets.values()]
    .map((bucket) => ({
      departmentId: bucket.departmentId,
      name: bucket.name,
      employees: bucket.employees,
      gross: roundWholeXaf(bucket.grossBig),
      net: roundWholeXaf(bucket.netBig),
    }))
    .sort((a, b) => new Big(b.net).cmp(new Big(a.net)));

  // Trend: the six most recent processed periods including this one.
  const trendRows = await db.payrollPeriod.findMany({
    where: {
      companyId,
      status: { in: [...PROCESSED_STATUSES] },
      totalNet: { not: null },
      startDate: { lte: period.startDate },
    },
    orderBy: { startDate: "desc" },
    take: 6,
    select: { id: true, name: true, startDate: true, status: true, totalNet: true },
  });
  const trend: TrendPoint[] = trendRows
    .map((row) => ({
      periodId: row.id,
      name: row.name,
      label: monthLabel.format(row.startDate),
      status: row.status,
      net: roundWholeXaf(row.totalNet?.toString() ?? "0"),
      current: row.id === period.id,
    }))
    .reverse();

  const anomalies = detectAnomalies(anomalyEmployees, anomalyAdjustments);

  const kpis: ReviewKpis = {
    employees: payslips.length,
    gross: roundWholeXaf(gross),
    deductions: roundWholeXaf(deductions),
    net: roundWholeXaf(net),
    previous: previous
      ? {
          id: previous.id,
          name: previous.name,
          net: roundWholeXaf(previous.totalNet?.toString() ?? "0"),
        }
      : null,
    netDeltaPct: previous?.totalNet
      ? signedPercent(net, new Big(previous.totalNet.toString()))
      : null,
  };

  return { kpis, deptCosts, trend, anomalies };
}
