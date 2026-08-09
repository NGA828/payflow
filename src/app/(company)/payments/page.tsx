import type { Metadata } from "next";
import Link from "next/link";
import { AppError } from "@/server/errors";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getDb } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card><CardContent className="py-8">
        <h1 className="text-lg font-bold text-ink">Payments are restricted</h1>
        <p className="mt-2 text-[13px] text-body">Only Company Admins and Accountants can see payments.</p>
      </CardContent></Card>
    </div>
  );
}

export default async function GlobalPaymentsPage() {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.PAYMENTS_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }

  const db = getDb();
  const payments = await db.payment.findMany({
    where: { companyId: ctx.company.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      payrollPeriod: { select: { id: true, name: true, payDate: true, status: true } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Payments</h1>
          <p className="mt-1 text-[13px] text-muted">Recent payroll payments across all periods · click into a period for full actions</p>
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
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Pay date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-3 pr-4 pl-5">
                    <Link href={`/payroll/${p.payrollPeriod.id}/payments`} className="text-[13px] font-semibold text-ink hover:text-primary-700 hover:underline">
                      {p.payrollPeriod.name}
                    </Link>
                    <p className="text-[11.5px] text-muted">{p.payrollPeriod.status}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-medium text-ink">{p.employee.firstName} {p.employee.lastName}</p>
                    <p className="tnum text-xs text-muted">{p.employee.employeeCode}</p>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-body">{p.method}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] font-bold text-ink">{formatMoney(p.amount.toString())}</td>
                  <td className="px-4 py-3"><Badge variant={p.status === "SUCCESSFUL" ? "teal" : p.status === "FAILED" ? "red" : "grey"} dot>{p.status}</Badge></td>
                  <td className="tnum px-4 py-3 text-[13px] text-body">{formatDate(p.payrollPeriod.payDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {payments.length === 0 && (
          <CardContent className="py-8 text-center">
            <p className="text-[13px] text-muted">No payments yet — approve a payroll period to materialize payments.</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
