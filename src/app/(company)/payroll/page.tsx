import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ChevronRight, Plus } from "lucide-react";
import { AppError } from "@/server/errors";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { listPeriods } from "@/server/services/payroll-period.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { statusBadgeVariant, statusLabel } from "@/lib/payroll-ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payroll" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card>
        <CardContent className="py-8">
          <h1 className="text-lg font-bold text-ink">Payroll is restricted</h1>
          <p className="mt-2 text-[13px] text-body">
            Your role does not include payroll access. Ask a Company Admin if you believe this is
            a mistake.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function PayrollPage() {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.PAYROLL_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }
  const canManagePeriods = hasPermission(ctx.membership.role, PERMISSIONS.PAYROLL_PERIODS_MANAGE);

  const periods = await listPeriods(ctx.company.id);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Payroll periods</h1>
          <p className="mt-1 text-[13px] text-muted">
            {periods.length === 0
              ? "One period per pay run — draft, process, approve, pay."
              : `${periods.length} period${periods.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {canManagePeriods && (
          <Link href="/payroll/new" className={buttonVariants({ variant: "primary" })}>
            <Plus className="h-4 w-4" /> New period
          </Link>
        )}
      </div>

      {periods.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50">
              <CalendarCheck className="h-5.5 w-5.5 text-primary-600" strokeWidth={1.7} />
            </span>
            <p className="text-[13.5px] font-semibold text-ink">No payroll periods yet</p>
            <p className="mt-1 max-w-xs text-[12.5px] text-body">
              Create your first period to prepare this month&apos;s payroll — periods can never
              overlap.
            </p>
            {canManagePeriods && (
              <Link href="/payroll/new" className={cn(buttonVariants({ variant: "primary", size: "sm" }), "mt-4")}>
                <Plus className="h-3.5 w-3.5" /> New period
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-border bg-canvas/70 text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                  <th className="py-2.5 pr-4 pl-5">Period</th>
                  <th className="px-4 py-2.5">Dates</th>
                  <th className="px-4 py-2.5">Pay date</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Employees</th>
                  <th className="px-4 py-2.5 text-right">Gross</th>
                  <th className="px-4 py-2.5 text-right">Net</th>
                  <th className="py-2.5 pr-5 pl-4 text-right">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-canvas/60">
                    <td className="py-3 pr-4 pl-5">
                      <Link href={`/payroll/${period.id}`} className="text-[13.5px] font-semibold text-ink hover:text-primary-700 hover:underline">
                        {period.name}
                      </Link>
                    </td>
                    <td className="tnum px-4 py-3 text-[13px] text-body">
                      {formatDate(period.startDate)} – {formatDate(period.endDate)}
                    </td>
                    <td className="tnum px-4 py-3 text-[13px] text-body">{formatDate(period.payDate)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant(period.status)} dot>
                        {statusLabel(period.status)}
                      </Badge>
                    </td>
                    <td className="tnum px-4 py-3 text-right text-[13px] text-body">
                      {period.totalEmployees ?? "—"}
                    </td>
                    <td className="tnum px-4 py-3 text-right text-[13px] text-body">
                      {period.totalGross ? formatMoney(period.totalGross) : "—"}
                    </td>
                    <td className="tnum px-4 py-3 text-right text-[13px] font-semibold text-teal-700">
                      {period.totalNet ? formatMoney(period.totalNet) : "—"}
                    </td>
                    <td className="py-3 pr-5 pl-4 text-right">
                      <Link href={`/payroll/${period.id}`} aria-label={`Open ${period.name}`}>
                        <ChevronRight className="ml-auto h-4 w-4 text-muted" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
