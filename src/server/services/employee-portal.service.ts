import { getDb } from "@/lib/db";
import type { EmployeeContext } from "@/server/tenant/employee-context";
import { roundWholeXaf } from "@/server/payroll/money";

export interface PortalPayslipRow {
  id: string;
  payrollPeriodId: string;
  periodName: string;
  payDate: Date;
  status: string;
  payslipNumber: string;
  gross: string;
  deductions: string;
  net: string;
  currency: string;
}

export async function listMyPayslips(ctx: EmployeeContext): Promise<PortalPayslipRow[]> {
  const db = getDb();
  const rows = await db.payslip.findMany({
    where: {
      companyId: ctx.company.id,
      employeeId: ctx.employee.id,
      status: "APPROVED", // portal only shows finalized approved payslips
    },
    orderBy: { payrollPeriod: { startDate: "desc" } },
    include: {
      payrollPeriod: { select: { id: true, name: true, payDate: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    payrollPeriodId: r.payrollPeriodId,
    periodName: r.payrollPeriod.name,
    payDate: r.payrollPeriod.payDate,
    status: r.status,
    payslipNumber: r.payslipNumber,
    gross: roundWholeXaf(r.grossSalary.toString()),
    deductions: roundWholeXaf(r.deductions.toString()),
    net: roundWholeXaf(r.netSalary.toString()),
    currency: r.currency,
  }));
}

export interface PortalPaymentRow {
  id: string;
  payrollPeriodId: string;
  periodName: string;
  payDate: Date;
  method: string;
  amount: string;
  status: string;
  paidAt: Date | null;
  reference: string | null;
}

export async function listMyPayments(ctx: EmployeeContext): Promise<PortalPaymentRow[]> {
  const db = getDb();
  const rows = await db.payment.findMany({
    where: { companyId: ctx.company.id, employeeId: ctx.employee.id },
    orderBy: { payrollPeriod: { startDate: "desc" } },
    include: { payrollPeriod: { select: { id: true, name: true, payDate: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    payrollPeriodId: r.payrollPeriodId,
    periodName: r.payrollPeriod.name,
    payDate: r.payrollPeriod.payDate,
    method: r.method,
    amount: roundWholeXaf(r.amount.toString()),
    status: r.status,
    paidAt: r.paidAt,
    reference: r.reference,
  }));
}

export async function getPortalStats(ctx: EmployeeContext) {
  const [payslips, payments, employee] = await Promise.all([
    listMyPayslips(ctx),
    listMyPayments(ctx),
    getDb().employee.findUnique({
      where: { id: ctx.employee.id },
      select: { basicSalary: true, employmentType: true, dateHired: true, status: true },
    }),
  ]);
  let totalNet = "0";
  try {
    const Big = (await import("big.js")).default;
    let sum = new Big(0);
    for (const p of payslips) sum = sum.plus(p.net);
    totalNet = sum.toFixed(0);
  } catch {}
  return {
    payslipsCount: payslips.length,
    lastPayslip: payslips[0] ?? null,
    totalNet,
    payments,
    employee,
  };
}
