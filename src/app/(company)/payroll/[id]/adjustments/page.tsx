import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Lock, Plus, Scale } from "lucide-react";
import { AppError } from "@/server/errors";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getPeriodDetail } from "@/server/services/payroll-period.service";
import {
  adjustmentsEditable,
  listAdjustments,
} from "@/server/services/adjustment.service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ADJUSTMENT_TYPE_LABELS } from "@/validations/adjustment";
import { PeriodPageHeader } from "../subnav";
import {
  AddAdjustmentButton,
  AdjustmentRowActions,
  type EmployeeOption,
} from "./client";

export const metadata: Metadata = { title: "Adjustments" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card>
        <CardContent className="py-8">
          <h1 className="text-lg font-bold text-ink">Payroll is restricted</h1>
          <p className="mt-2 text-[13px] text-body">Your role does not include payroll access.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TotalCard({
  icon: Icon,
  label,
  amount,
  sub,
  tint,
  amountClass,
}: {
  icon: typeof ArrowUpRight;
  label: string;
  amount: string;
  sub: string;
  tint: string;
  amountClass: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tint)}>
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[.06em] text-muted uppercase">{label}</p>
          <p className={cn("tnum truncate text-[15px] font-bold", amountClass)}>{amount}</p>
          <p className="truncate text-[11.5px] text-muted">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AdjustmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.PAYROLL_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }
  const canAdjust =
    hasPermission(ctx.membership.role, PERMISSIONS.PAYROLL_ADJUST);
  const canViewPayments = hasPermission(ctx.membership.role, PERMISSIONS.PAYMENTS_VIEW);

  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "deductions" ? "deductions" : "earnings";

  const period = await getPeriodDetail(ctx.company.id, id, false);
  if (!period) notFound();

  const board = await listAdjustments(ctx.company.id, id);
  const editable = canAdjust && adjustmentsEditable(period.status);

  const employees: EmployeeOption[] = period.eligibility
    .filter((row) => row.exclusion === null)
    .map((row) => ({
      id: row.employeeId,
      label: `${row.fullName} · ${row.employeeCode}`,
    }));

  const rows = board.rows.filter((row) =>
    tab === "earnings" ? row.category === "EARNING" : row.category === "DEDUCTION",
  );

  return (
    <div className="flex flex-col gap-5">
      <PeriodPageHeader
        periodId={period.id}
        name={period.name}
        status={period.status}
        dateRange={`${formatDate(period.startDate)} – ${formatDate(period.endDate)} · pay date ${formatDate(period.payDate)}`}
        withPayments={canViewPayments}
        active="adjustments"
      />

      {!adjustmentsEditable(period.status) && (
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-canvas px-4 py-3 text-[13px] text-body">
          <Lock className="h-4 w-4 shrink-0 text-muted" />
          Adjustments are locked — {period.status === "IN_PROGRESS" ? "the engine is processing this period." : "this period has been submitted."}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <TotalCard icon={ArrowUpRight} label="Earnings" amount={formatMoney(board.totals.earningsTotal)} sub={`${board.totals.earningCount} adjustment${board.totals.earningCount === 1 ? "" : "s"}`} tint="bg-teal-50 text-teal-700" amountClass="text-ink" />
        <TotalCard icon={ArrowDownRight} label="Deductions" amount={formatMoney(board.totals.deductionsTotal)} sub={`${board.totals.deductionCount} adjustment${board.totals.deductionCount === 1 ? "" : "s"}`} tint="bg-danger-tint text-danger" amountClass="text-ink" />
        <TotalCard icon={Scale} label="Net impact" amount={formatMoney(board.totals.netImpact)} sub="earnings minus deductions" tint="bg-indigo-50 text-primary-600" amountClass="text-primary-700" />
      </div>

      {board.totals.perEmployee.length > 0 && (
        <Card>
          <div className="border-b border-border bg-canvas/70 px-5 py-3">
            <h2 className="text-[13px] font-semibold text-ink">Per-employee totals</h2>
          </div>
          <div className="grid gap-2 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
            {board.totals.perEmployee.map((bucket) => (
              <div key={bucket.employeeId} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="truncate text-[12.5px] font-medium text-ink">{bucket.employeeName}</span>
                <span className="tnum flex shrink-0 items-center gap-1.5 text-[12px]">
                  <span className="text-teal-700">+{formatMoney(bucket.earningsTotal)}</span>
                  <span className="text-muted">/</span>
                  <span className="text-danger">−{formatMoney(bucket.deductionsTotal)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-canvas/70 px-5 py-3">
          <div className="flex gap-1">
            {(["earnings", "deductions"] as const).map((item) => (
              <Link
                key={item}
                href={`/payroll/${period.id}/adjustments?tab=${item}`}
                aria-current={tab === item ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  tab === item ? "bg-white text-primary-700 shadow-sm ring-1 ring-border" : "text-muted hover:text-ink",
                )}
              >
                {item === "earnings"
                  ? `Earnings (${board.totals.earningCount})`
                  : `Deductions (${board.totals.deductionCount})`}
              </Link>
            ))}
          </div>
          {editable && (
            <AddAdjustmentButton
              payrollPeriodId={period.id}
              employees={employees}
              category={tab === "earnings" ? "EARNING" : "DEDUCTION"}
            />
          )}
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-indigo-50">
              <Plus className="h-5 w-5 text-primary-600" strokeWidth={1.7} />
            </span>
            <p className="text-[13.5px] font-semibold text-ink">No {tab} yet</p>
            <p className="mt-1 max-w-xs text-[12.5px] text-body">
              {tab === "earnings"
                ? "Overtime, bonuses and allowances raise this period's gross pay."
                : "Loans, advances and penalties reduce net pay."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                  <th className="py-2.5 pr-4 pl-5">Employee</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Hours</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Note</th>
                  <th className="px-4 py-2.5">Added by</th>
                  {editable && (
                    <th className="py-2.5 pr-5 pl-4 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-canvas/60">
                    <td className="py-3 pr-4 pl-5">
                      <p className="text-[13.5px] font-semibold text-ink">{row.employeeName}</p>
                      <p className="tnum text-xs text-muted">{row.employeeCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={row.category === "EARNING" ? "teal" : "red"}>
                        {ADJUSTMENT_TYPE_LABELS[row.type]}
                      </Badge>
                    </td>
                    <td className="tnum px-4 py-3 text-[13px] text-body">{row.hours ?? "—"}</td>
                    <td className={cn("tnum px-4 py-3 text-right text-[13px] font-semibold", row.category === "EARNING" ? "text-teal-700" : "text-danger")}>
                      {row.category === "EARNING" ? "+" : "−"}
                      {formatMoney(row.amount)}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-[12.5px] text-muted">{row.note ?? "—"}</td>
                    <td className="px-4 py-3 text-[12.5px] text-muted">
                      {row.createdByName}
                      <span className="tnum block text-[11px]">{formatDate(row.createdAt)}</span>
                    </td>
                    {editable && (
                      <td className="py-3 pr-4 pl-4 text-right">
                        <AdjustmentRowActions
                          payrollPeriodId={period.id}
                          employees={employees}
                          adjustment={{
                            id: row.id,
                            employeeId: row.employeeId,
                            type: row.type,
                            amount: row.amount,
                            hours: row.hours,
                            note: row.note,
                            category: row.category,
                            label: `${ADJUSTMENT_TYPE_LABELS[row.type]} for ${row.employeeName}`,
                          }}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
