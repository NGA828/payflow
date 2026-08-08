import Big from "big.js";

/**
 * Payroll anomaly detection (pure — no I/O). Rules are deliberately few,
 * explainable and threshold-based; every anomaly names a human-readable
 * reason. Messages NEVER carry absolute salary amounts (the review tab is
 * visible to payroll.view roles) — only percentages, hours and counts.
 *
 *   NEGATIVE_NET          critical  deductions exceed gross
 *   MISSING_PAYMENT       warning   payment details incomplete → transfer impossible
 *   DUPLICATE_ADJUSTMENT  warning   identical (employee, type, amount) rows ≥ 2
 *   NET_DELTA             info      |net| moved > 10% vs previous finalized period
 *   HIGH_OVERTIME         info      > 20 OT hours, or OT pay > 20% of basic
 */

export type AnomalyCode =
  | "NEGATIVE_NET"
  | "MISSING_PAYMENT"
  | "DUPLICATE_ADJUSTMENT"
  | "NET_DELTA"
  | "HIGH_OVERTIME";

export type AnomalySeverity = "critical" | "warning" | "info";

export interface AnomalyEmployeeRef {
  id: string;
  fullName: string;
  employeeCode: string;
}

export interface Anomaly {
  code: AnomalyCode;
  severity: AnomalySeverity;
  employee?: AnomalyEmployeeRef;
  message: string;
}

export interface AnomalyEmployeeInput {
  id: string;
  fullName: string;
  employeeCode: string;
  /** Current-period figures (whole-XAF strings). */
  netSalary: string;
  basicSalary: string;
  overtimePay: string;
  /** Total overtime hours logged this period (from adjustments). */
  overtimeHours: string | null;
  /** Net in the previous finalized period, when one exists. */
  previousNetSalary: string | null;
  previousPeriodName: string | null;
  paymentComplete: boolean;
}

export interface AnomalyAdjustmentRef {
  employeeId: string;
  type: string;
  amount: string;
}

export const NET_DELTA_THRESHOLD = "0.1"; // 10%
export const HIGH_OT_HOURS = "20";
export const HIGH_OT_SHARE = "0.2"; // 20% of basic

const SEVERITY_RANK: Record<AnomalySeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function percentChange(current: string, previous: string): Big | null {
  const prev = new Big(previous);
  if (prev.eq(0)) return null;
  return new Big(current).minus(prev).div(prev.abs());
}

function formatSignedPercent(ratio: Big): string {
  const pct = ratio.times(100).round(1, 1).toFixed(1);
  return ratio.gte(0) ? `+${pct}%` : `${pct}%`;
}

export function detectAnomalies(
  employees: AnomalyEmployeeInput[],
  adjustments: AnomalyAdjustmentRef[],
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const employee of employees) {
    const ref: AnomalyEmployeeRef = {
      id: employee.id,
      fullName: employee.fullName,
      employeeCode: employee.employeeCode,
    };
    const who = `${employee.fullName} (${employee.employeeCode})`;

    if (new Big(employee.netSalary).lt(0)) {
      anomalies.push({
        code: "NEGATIVE_NET",
        severity: "critical",
        employee: ref,
        message: `${who} has a negative net — deductions exceed gross. Fix adjustments before submitting.`,
      });
    }

    if (!employee.paymentComplete) {
      anomalies.push({
        code: "MISSING_PAYMENT",
        severity: "warning",
        employee: ref,
        message: `${who} is missing payment details — their transfer cannot be issued.`,
      });
    }

    if (employee.previousNetSalary !== null) {
      const delta = percentChange(employee.netSalary, employee.previousNetSalary);
      if (delta !== null && delta.abs().gt(NET_DELTA_THRESHOLD)) {
        const pct = formatSignedPercent(delta);
        anomalies.push({
          code: "NET_DELTA",
          severity: "info",
          employee: ref,
          message: `${who}'s net moved ${pct} vs ${employee.previousPeriodName ?? "the previous period"} — worth a glance.`,
        });
      }
    }

    if (employee.overtimeHours !== null && new Big(employee.overtimeHours).gt(HIGH_OT_HOURS)) {
      anomalies.push({
        code: "HIGH_OVERTIME",
        severity: "info",
        employee: ref,
        message: `${who} logged ${employee.overtimeHours} overtime hours this period.`,
      });
    } else {
      const basic = new Big(employee.basicSalary);
      if (basic.gt(0) && new Big(employee.overtimePay).div(basic).gt(HIGH_OT_SHARE)) {
        anomalies.push({
          code: "HIGH_OVERTIME",
          severity: "info",
          employee: ref,
          message: `${who}'s overtime pay exceeds 20% of basic salary this period.`,
        });
      }
    }
  }

  // Identical adjustment rows (same employee, type, amount) ≥ 2 — usually double entry.
  const groups = new Map<string, { count: number; amount: string; type: string }>();
  for (const row of adjustments) {
    const key = `${row.employeeId}|${row.type}|${row.amount}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { count: 1, amount: row.amount, type: row.type });
  }
  for (const [key, group] of groups) {
    if (group.count < 2) continue;
    const employeeId = key.split("|")[0] ?? "";
    const employee = employees.find((row) => row.id === employeeId);
    if (!employee) continue;
    anomalies.push({
      code: "DUPLICATE_ADJUSTMENT",
      severity: "warning",
      employee: { id: employee.id, fullName: employee.fullName, employeeCode: employee.employeeCode },
      message: `${employee.fullName} (${employee.employeeCode}) has ${group.count} identical ${group.type} adjustments — double entry?`,
    });
  }

  return anomalies.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.code.localeCompare(b.code) ||
      (a.employee?.fullName ?? "").localeCompare(b.employee?.fullName ?? ""),
  );
}
