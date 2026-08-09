import type { Metadata } from "next";
import Link from "next/link";
import { AppError } from "@/server/errors";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getDb } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Payslips" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card><CardContent className="py-8">
        <h1 className="text-lg font-bold text-ink">Payslips are restricted</h1>
        <p className="mt-2 text-[13px] text-body">Your role does not include payslip access.</p>
      </CardContent></Card>
    </div>
  );
}

export default async function GlobalPayslipsPage() {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.PAYSLIPS_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }

  const db = getDb();
  const payslips = await db.payslip.findMany({
    where: { companyId: ctx.company.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      payrollPeriod: { select: { id: true, name: true, status: true, payDate: true } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Payslips</h1>
          <p className="mt-1 text-[13px] text-muted">Recent payslips across all periods · finalized and draft</p>
        </div>
        <Link href="/payroll" className="text-[13px] font-medium text-primary-600 hover:underline">Go to payroll</Link>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-border bg-canvas/70 text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Period</th>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5">Payslip №</th>
                <th className="px-4 py-2.5 text-right">Gross</th>
                <th className="px-4 py-2.5 text-right">Net</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((ps) => (
                <tr key={ps.id} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-3 pr-4 pl-5">
                    <Link href={`/payroll/${ps.payrollPeriod.id}/payslips`} className="text-[13px] font-semibold text-ink hover:text-primary-700 hover:underline">
                      {ps.payrollPeriod.name}
                    </Link>
                    <p className="text-[11.5px] text-muted">{formatDate(ps.payrollPeriod.payDate)} · {ps.payrollPeriod.status}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-ink">{ps.employee.firstName} {ps.employee.lastName}</p>
                    <p className="tnum text-xs text-muted">{ps.employee.employeeCode}</p>
                  </td>
                  <td className="tnum px-4 py-3 text-[12.5px] text-body">{ps.payslipNumber}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-body">{formatMoney(ps.grossSalary.toString())}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] font-bold text-teal-700">{formatMoney(ps.netSalary.toString())}</td>
                  <td className="px-4 py-3"><Badge variant={ps.status === "APPROVED" ? "teal" : ps.status === "VOID" ? "red" : "grey"} dot>{ps.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {payslips.length === 0 && (
          <CardContent className="py-8 text-center">
            <p className="text-[13px] text-muted">No payslips yet — process a payroll period to generate payslips.</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
