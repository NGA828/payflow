import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Wallet, Calendar, Building2 } from "lucide-react";
import { requireEmployeeContext } from "@/server/tenant/employee-context";
import { getPortalStats } from "@/server/services/employee-portal.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Employee Dashboard" };
export const dynamic = "force-dynamic";

export default async function EmployeePortalDashboard() {
  const ctx = await requireEmployeeContext();
  const stats = await getPortalStats(ctx);

  const kpis = [
    { label: "Payslips", value: String(stats.payslipsCount), icon: FileText, tint: "bg-indigo-50 text-primary-600" },
    { label: "Total net paid", value: formatMoney(stats.totalNet), icon: Wallet, tint: "bg-teal-50 text-teal-700" },
    { label: "Department", value: ctx.employee.departmentName, icon: Building2, tint: "bg-slate-100 text-slate-600" },
    { label: "Position", value: ctx.employee.positionTitle, icon: Calendar, tint: "bg-amber-50 text-amber-700" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Welcome, {ctx.employee.firstName}</h1>
        <p className="mt-1 text-[13px] text-muted">
          Employee {ctx.employee.employeeCode} · {ctx.employee.departmentName} · {ctx.company.name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-muted">{kpi.label}</p>
                  <p className="tnum mt-1 truncate text-[16px] font-bold text-ink">{kpi.value}</p>
                </div>
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${kpi.tint}`}>
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Latest payslip</CardTitle>
              <CardDescription>{stats.lastPayslip ? `${stats.lastPayslip.periodName} · ${formatDate(stats.lastPayslip.payDate)}` : "No payslips yet"}</CardDescription>
            </div>
            {stats.lastPayslip && (
              <Link href={`/portal/payslips`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                View all
              </Link>
            )}
          </CardHeader>
          <CardContent className="pt-3">
            {!stats.lastPayslip ? (
              <p className="py-6 text-center text-[13px] text-muted">No approved payslips yet — your HR will notify you when payroll is processed.</p>
            ) : (
              <div className="rounded-lg bg-canvas p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-ink">{stats.lastPayslip.payslipNumber}</p>
                  <p className="text-[11px] text-muted">{stats.lastPayslip.status}</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
                  <div><p className="text-muted">Gross</p><p className="tnum font-semibold text-ink">{formatMoney(stats.lastPayslip.gross)}</p></div>
                  <div><p className="text-muted">Deductions</p><p className="tnum font-semibold text-danger">−{formatMoney(stats.lastPayslip.deductions)}</p></div>
                  <div><p className="text-muted">Net</p><p className="tnum font-bold text-teal-700">{formatMoney(stats.lastPayslip.net)}</p></div>
                </div>
                <Link href={`/portal/payslips/${stats.lastPayslip.id}/download`} className={`${buttonVariants({ variant: "primary", size: "sm" })} mt-4 w-full justify-center`}>
                  Download PDF
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Payment history</CardTitle>
              <CardDescription>Recent payroll payments</CardDescription>
            </div>
            <Link href="/portal/payments" className={buttonVariants({ variant: "ghost", size: "sm" })}>View all</Link>
          </CardHeader>
          <CardContent className="pt-3">
            {stats.payments.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {stats.payments.slice(0, 5).map((pmt) => (
                  <li key={pmt.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{pmt.periodName}</p>
                      <p className="text-[11.5px] text-muted">{pmt.method} · {pmt.status} {pmt.paidAt ? `· ${formatDate(pmt.paidAt)}` : ""}</p>
                    </div>
                    <p className="tnum text-[13px] font-semibold text-ink">{formatMoney(pmt.amount)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
