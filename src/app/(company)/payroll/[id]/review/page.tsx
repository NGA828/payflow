import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleCheck,
  Hourglass,
  Info,
  Lock,
  OctagonAlert,
  Play,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import { AppError } from "@/server/errors";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getPeriodDetail } from "@/server/services/payroll-period.service";
import { getReviewData } from "@/server/services/payroll-review.service";
import type { AnomalySeverity } from "@/server/payroll/anomalies";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PeriodPageHeader } from "../subnav";
import { ProcessPayrollButton } from "../client";
import {
  ApprovePeriodButton,
  DeptCostChart,
  NetTrendChart,
  RejectPeriodForm,
  SubmitPeriodButton,
  UnlockPeriodForm,
} from "./client";

export const metadata: Metadata = { title: "Review" };
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

const SEVERITY_STYLE: Record<
  AnomalySeverity,
  { icon: typeof OctagonAlert; tint: string; badge: "red" | "amber" | "blue"; label: string }
> = {
  critical: { icon: OctagonAlert, tint: "bg-danger-tint text-danger", badge: "red", label: "Critical" },
  warning: { icon: TriangleAlert, tint: "bg-amber-tint text-warning", badge: "amber", label: "Warning" },
  info: { icon: Info, tint: "bg-info-tint text-info", badge: "blue", label: "Heads-up" },
};

function KpiCard({
  label,
  value,
  sub,
  tint,
  icon: Icon,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  tint: string;
  icon: typeof Users;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tint)}>
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[.06em] text-muted uppercase">{label}</p>
          <p className={cn("tnum truncate text-[15px] font-bold text-ink", valueClass)}>{value}</p>
          {sub && <p className="truncate text-[11.5px] text-muted">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.PAYROLL_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }
  const role = ctx.membership.role;
  const canProcess = hasPermission(role, PERMISSIONS.PAYROLL_PROCESS);
  const canSubmit = hasPermission(role, PERMISSIONS.PAYROLL_SUBMIT);
  const canApprove = hasPermission(role, PERMISSIONS.PAYROLL_APPROVE);
  const canUnlock = hasPermission(role, PERMISSIONS.PAYROLL_UNLOCK);
  const canViewPayments = hasPermission(role, PERMISSIONS.PAYMENTS_VIEW);

  const { id } = await params;
  const period = await getPeriodDetail(ctx.company.id, id, false);
  if (!period) notFound();

  const reviewable = !["DRAFT", "IN_PROGRESS"].includes(period.status);
  const review = reviewable ? await getReviewData(ctx.company.id, id) : null;

  const headerActions = (() => {
    if (period.status === "READY" && canSubmit) {
      return <SubmitPeriodButton periodId={period.id} />;
    }
    if (period.status === "SUBMITTED" && canApprove) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <ApprovePeriodButton periodId={period.id} />
          <RejectPeriodForm periodId={period.id} />
        </div>
      );
    }
    if (period.status === "APPROVED" && canUnlock) {
      return <UnlockPeriodForm periodId={period.id} />;
    }
    return undefined;
  })();

  return (
    <div className="flex flex-col gap-5">
      <PeriodPageHeader
        periodId={period.id}
        name={period.name}
        status={period.status}
        dateRange={`${formatDate(period.startDate)} – ${formatDate(period.endDate)} · pay date ${formatDate(period.payDate)}`}
        withPayments={canViewPayments}
        active="review"
        actions={headerActions}
      />

      {/* Status banner */}
      {period.status === "READY" && (
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-canvas px-4 py-3 text-[13px] text-body">
          <CircleCheck className="h-4 w-4 shrink-0 text-teal-600" />
          {canSubmit
            ? "Review the numbers and anomalies below, then submit to a Company Admin for approval."
            : "Ready — waiting for an Accountant to submit this period for approval."}
        </div>
      )}
      {period.status === "SUBMITTED" && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-tint px-4 py-3 text-[13px] text-amber-900">
          <Hourglass className="h-4 w-4 shrink-0" />
          {canApprove
            ? "Submitted to you for approval. Check the anomalies and totals, then approve or send it back with a note."
            : "Submitted — waiting for a Company Admin to approve. Adjustments are frozen."}
        </div>
      )}
      {period.status === "APPROVED" && (
        <div className="flex items-center gap-2.5 rounded-lg border border-success/25 bg-success-tint px-4 py-3 text-[13px] text-success">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Approved. Payslips are final and payments can be issued. Unlocking is possible only before any payment succeeds.
        </div>
      )}
      {(period.status === "PAID" || period.status === "LOCKED") && (
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-canvas px-4 py-3 text-[13px] text-body">
          <Lock className="h-4 w-4 shrink-0 text-muted" />
          {period.status === "PAID"
            ? "Paid — all successful payments are recorded. This period is read-only."
            : "Locked — closed for good, read-only forever."}
        </div>
      )}

      {!reviewable && (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-indigo-50">
              <Play className="h-5 w-5 text-primary-600" strokeWidth={1.7} />
            </span>
            <p className="text-[14px] font-semibold text-ink">Nothing to review yet</p>
            <p className="mt-1 max-w-sm text-[12.5px] text-body">
              Process this period first — the cockpit then shows cost KPIs, department breakdowns,
              trends and anomaly checks, and the submit/approve decisions happen right here.
            </p>
            {canProcess && period.status === "DRAFT" && (
              <div className="mt-4">
                <ProcessPayrollButton periodId={period.id} reprocess={false} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {review && (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={Users}
              label="Employees"
              value={String(review.kpis.employees)}
              sub={review.kpis.previous ? `paid in ${review.kpis.previous.name}: on record` : "first period on record"}
              tint="bg-indigo-50 text-primary-600"
            />
            <KpiCard
              icon={Wallet}
              label="Gross pay"
              value={formatMoney(review.kpis.gross)}
              sub="before deductions"
              tint="bg-indigo-50 text-primary-600"
            />
            <KpiCard
              icon={ArrowDownRight}
              label="Deductions"
              value={formatMoney(review.kpis.deductions)}
              sub="tax, loans, advances, penalties"
              tint="bg-danger-tint text-danger"
            />
            <KpiCard
              icon={review.kpis.netDeltaPct?.startsWith("-") ? ArrowDownRight : ArrowUpRight}
              label="Net pay"
              value={formatMoney(review.kpis.net)}
              sub={
                review.kpis.netDeltaPct && review.kpis.previous
                  ? `${review.kpis.netDeltaPct} vs ${review.kpis.previous.name}`
                  : "what employees take home"
              }
              tint="bg-teal-50 text-teal-700"
              valueClass="text-teal-700"
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="border-b border-border bg-canvas/70 px-5 py-3">
                <h2 className="text-[13px] font-semibold text-ink">Cost by department</h2>
                <p className="text-[12px] text-muted">Net pay per department this period</p>
              </div>
              <CardContent className="py-4">
                {review.deptCosts.length === 0 ? (
                  <p className="py-8 text-center text-[12.5px] text-muted">No payslips to chart.</p>
                ) : (
                  <DeptCostChart
                    data={review.deptCosts.map((row) => ({
                      name: row.name,
                      net: Number(row.net),
                      employees: row.employees,
                    }))}
                  />
                )}
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <div className="border-b border-border bg-canvas/70 px-5 py-3">
                <h2 className="text-[13px] font-semibold text-ink">Net pay trend</h2>
                <p className="text-[12px] text-muted">
                  Latest processed periods · the ringed point is this one
                </p>
              </div>
              <CardContent className="py-4">
                {review.trend.length === 0 ? (
                  <p className="py-8 text-center text-[12.5px] text-muted">
                    The trend appears once periods are processed.
                  </p>
                ) : (
                  <NetTrendChart
                    data={review.trend.map((point) => ({
                      label: point.label,
                      net: Number(point.net),
                      current: point.current,
                      name: point.name,
                    }))}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Anomalies */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-canvas/70 px-5 py-3">
              <div>
                <h2 className="text-[13px] font-semibold text-ink">Anomaly checks</h2>
                <p className="text-[12px] text-muted">
                  Big swings, missing payment details, negative nets, heavy overtime and duplicate lines
                </p>
              </div>
              {review.anomalies.length > 0 && (
                <Badge variant="amber" dot>
                  {review.anomalies.length} to review
                </Badge>
              )}
            </div>
            {review.anomalies.length === 0 ? (
              <CardContent className="py-8 text-center">
                <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-teal-600" strokeWidth={1.8} />
                <p className="text-[13px] font-semibold text-ink">Clean run</p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  No anomalies detected — every check passed.
                </p>
              </CardContent>
            ) : (
              <ul className="divide-y divide-slate-100">
                {review.anomalies.map((anomaly, index) => {
                  const style = SEVERITY_STYLE[anomaly.severity];
                  const Icon = style.icon;
                  return (
                    <li key={`${anomaly.code}-${anomaly.employee?.id ?? index}`} className="flex items-center gap-3 px-5 py-3">
                      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", style.tint)}>
                        <Icon className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <p className="min-w-0 flex-1 text-[13px] text-body">{anomaly.message}</p>
                      {anomaly.employee && (
                        <Link
                          href={`/employees/${anomaly.employee.id}`}
                          className="shrink-0 text-[12px] font-medium text-primary-600 hover:underline"
                        >
                          View employee
                        </Link>
                      )}
                      <Badge variant={style.badge}>{style.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
