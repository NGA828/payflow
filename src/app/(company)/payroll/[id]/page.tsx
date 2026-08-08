import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Check,
  CircleSlash,
  Landmark,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { AppError } from "@/server/errors";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import {
  EXCLUSION_LABELS,
  getPeriodDetail,
} from "@/server/services/payroll-period.service";
import { STATUS_DISPLAY, STATUS_ORDER } from "@/server/payroll/state-machine";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DeletePeriodButton, ProcessPayrollButton } from "./client";
import { PeriodPageHeader } from "./subnav";

export const metadata: Metadata = { title: "Payroll period" };
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

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  tint: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tint)}>
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[.06em] text-muted uppercase">{label}</p>
          <p className="tnum truncate text-[15px] font-bold text-ink">{value}</p>
          {sub && <p className="truncate text-[11.5px] text-muted">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function PayrollPeriodPage({
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
  const canManagePeriods = hasPermission(ctx.membership.role, PERMISSIONS.PAYROLL_PERIODS_MANAGE);
  const canSeeSensitive = hasPermission(ctx.membership.role, PERMISSIONS.EMPLOYEES_VIEW_SENSITIVE);
  const canProcess = hasPermission(ctx.membership.role, PERMISSIONS.PAYROLL_PROCESS);

  const { id } = await params;
  const sp = await searchParams;
  const period = await getPeriodDetail(ctx.company.id, id, canSeeSensitive);
  if (!period) notFound();

  const currentStep = STATUS_ORDER.indexOf(period.status);
  const payslipTotal = period.payslipCount;

  return (
    <div className="flex flex-col gap-5">
      {sp.created === "1" && (
        <div className="flex items-center gap-2.5 rounded-lg border border-success/25 bg-success-tint px-4 py-3 text-[13px] font-medium text-success">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Period “{period.name}” created as a draft.
        </div>
      )}

      <PeriodPageHeader
        periodId={period.id}
        name={period.name}
        status={period.status}
        dateRange={`${formatDate(period.startDate)} – ${formatDate(period.endDate)} · pay date ${formatDate(period.payDate)}`}
        active="overview"
        actions={
          <div className="flex items-center gap-2">
            {canProcess && (period.status === "DRAFT" || period.status === "READY") && (
              <ProcessPayrollButton periodId={period.id} reprocess={period.status === "READY"} />
            )}
            {canManagePeriods && period.status === "DRAFT" && (
              <DeletePeriodButton periodId={period.id} periodName={period.name} />
            )}
          </div>
        }
      />

      {/* Status stepper */}
      <Card>
        <CardContent className="overflow-x-auto py-4">
          <ol className="flex min-w-[720px] items-center">
            {STATUS_ORDER.map((status, index) => {
              const reached = index < currentStep;
              const current = index === currentStep;
              return (
                <li key={status} className={cn("relative flex-1", index < STATUS_ORDER.length - 1 && "pr-2")}>
                  <div className="flex items-center">
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[11px] font-bold",
                        current
                          ? "brand-gradient border-transparent text-white"
                          : reached
                            ? "border-teal-600 bg-teal-600 text-white"
                            : "border-border bg-white text-muted",
                      )}
                    >
                      {reached ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    {index < STATUS_ORDER.length - 1 && (
                      <span className={cn("mx-2 h-px flex-1", reached || current ? "bg-teal-600" : "bg-border")} />
                    )}
                  </div>
                  <p className={cn("mt-1.5 text-[11.5px] font-semibold", current ? "text-primary-700" : reached ? "text-ink" : "text-muted")}>
                    {STATUS_DISPLAY[status].label}
                  </p>
                  {current && <p className="text-[11px] text-muted">{STATUS_DISPLAY[status].hint}</p>}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Users} label="Eligible employees" value={String(period.eligibleCount)} sub={period.excludedCount > 0 ? `${period.excludedCount} excluded below` : "everyone is in scope"} tint="bg-indigo-50 text-primary-600" />
        <SummaryCard icon={Landmark} label="Adjustments" value={String(period.adjustmentCount)} sub="overtime, bonuses, loans…" tint="bg-amber-tint text-warning" />
        <SummaryCard icon={Wallet} label="Payslips" value={String(payslipTotal)} sub={payslipTotal === 0 ? "computed at processing" : undefined} tint="bg-teal-50 text-teal-700" />
        <SummaryCard icon={CalendarDays} label="Pay date" value={formatDate(period.payDate)} sub={period.notes ?? undefined} tint="bg-slate-100 text-body" />
      </div>

      {(period.totalGross || period.totalNet || period.totalDeductions) && (
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard icon={Wallet} label="Total gross" value={period.totalGross ? formatMoney(period.totalGross) : "—"} tint="bg-indigo-50 text-primary-600" />
          <SummaryCard icon={CircleSlash} label="Total deductions" value={period.totalDeductions ? formatMoney(period.totalDeductions) : "—"} tint="bg-danger-tint text-danger" />
          <SummaryCard icon={Wallet} label="Total net" value={period.totalNet ? formatMoney(period.totalNet) : "—"} tint="bg-teal-50 text-teal-700" />
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">
            Who will be paid ({period.eligibleCount})
          </h2>
          <p className="text-[12px] text-muted">
            Based on each employee&apos;s status, hire and termination dates against this period.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Employee</th>
                <th className="px-4 py-2.5">Department</th>
                {canSeeSensitive && <th className="px-4 py-2.5 text-right">Basic salary</th>}
                <th className="px-4 py-2.5">Scope</th>
              </tr>
            </thead>
            <tbody>
              {period.eligibility.map((row) => (
                <tr key={row.employeeId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 pr-4 pl-5">
                    <Link href={`/employees/${row.employeeId}`} className="text-[13px] font-medium text-ink hover:text-primary-700 hover:underline">
                      {row.fullName}
                    </Link>
                    <span className="tnum ml-2 text-xs text-muted">{row.employeeCode}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-body">{row.departmentName}</td>
                  {canSeeSensitive && (
                    <td className="tnum px-4 py-2.5 text-right text-[13px] text-body">
                      {row.basicSalary ? formatMoney(row.basicSalary) : "—"}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    {row.exclusion === null ? (
                      <Badge variant="green" dot>In scope</Badge>
                    ) : (
                      <Badge variant="grey" dot>{EXCLUSION_LABELS[row.exclusion]}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
