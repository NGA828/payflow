import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Banknote,
  CheckCircle2,
  Clock,
  Download,
  Lock,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { AppError } from "@/server/errors";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getPeriodDetail } from "@/server/services/payroll-period.service";
import { ensurePayments, listPayments } from "@/server/services/payment.service";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PeriodPageHeader } from "../subnav";
import { LockPeriodButton, PaymentRowActions } from "./client";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const METHOD_LABEL = {
  BANK: "Bank transfer",
  MOBILE_MONEY: "Mobile money",
  CASH: "Cash",
} as const;

const STATUS_BADGE = {
  PENDING: { variant: "grey", label: "Pending" },
  SUCCESSFUL: { variant: "green", label: "Paid" },
  FAILED: { variant: "red", label: "Failed" },
} as const;

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card>
        <CardContent className="py-8">
          <h1 className="text-lg font-bold text-ink">Payments are restricted</h1>
          <p className="mt-2 text-[13px] text-body">
            Only Company Admins and Accountants can see payment operations.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function TotalsCard({
  icon: Icon,
  label,
  amount,
  count,
  tint,
  amountClass,
}: {
  icon: typeof Clock;
  label: string;
  amount: string;
  count: number;
  tint: string;
  amountClass?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tint)}>
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[.06em] text-muted uppercase">{label}</p>
          <p className={cn("tnum truncate text-[15px] font-bold text-ink", amountClass)}>{amount}</p>
          <p className="truncate text-[11.5px] text-muted">
            {count} payment{count === 1 ? "" : "s"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.PAYMENTS_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }
  const role = ctx.membership.role;
  const canManage = hasPermission(role, PERMISSIONS.PAYMENTS_MANAGE);
  const canExport = hasPermission(role, PERMISSIONS.PAYMENTS_EXPORT);
  const canLock = hasPermission(role, PERMISSIONS.PAYROLL_APPROVE);

  const { id } = await params;
  const period = await getPeriodDetail(ctx.company.id, id, false);
  if (!period) notFound();

  const paymentsOpen = ["APPROVED", "PAID", "LOCKED"].includes(period.status);
  // Backfill for periods approved before payments existed (idempotent).
  if (paymentsOpen) await ensurePayments(ctx.company.id, period.id);
  const board = paymentsOpen ? await listPayments(ctx.company.id, id) : null;
  const actionable = period.status === "APPROVED" && canManage;
  const outstanding =
    (board?.totals.pending.count ?? 0) + (board?.totals.failed.count ?? 0);

  return (
    <div className="flex flex-col gap-5">
      <PeriodPageHeader
        periodId={period.id}
        name={period.name}
        status={period.status}
        dateRange={`${formatDate(period.startDate)} – ${formatDate(period.endDate)} · pay date ${formatDate(period.payDate)}`}
        active="payments"
        withPayments
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canExport && paymentsOpen && outstanding > 0 && (
              <Link
                href={`/payroll/${period.id}/payments/export`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                <Download className="h-3.5 w-3.5" /> Export CSV ({outstanding})
              </Link>
            )}
            {period.status === "PAID" && canLock && <LockPeriodButton periodId={period.id} />}
          </div>
        }
      />

      {!paymentsOpen && (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-indigo-50">
              <Banknote className="h-5 w-5 text-primary-600" strokeWidth={1.7} />
            </span>
            <p className="text-[14px] font-semibold text-ink">Payments unlock at approval</p>
            <p className="mt-1 max-w-sm text-[12.5px] text-body">
              Once a Company Admin approves this period, one payment per payslip appears here —
              ready to export, mark paid or mark failed.
            </p>
            <Link
              href={`/payroll/${period.id}/review`}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-4")}
            >
              Go to review
            </Link>
          </CardContent>
        </Card>
      )}

      {board && (
        <>
          {period.status === "APPROVED" && (
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-canvas px-4 py-3 text-[13px] text-body">
              <ShieldCheck className="h-4 w-4 shrink-0 text-teal-600" />
              {canManage
                ? "Export the instruction file, issue the transfers, then record each outcome here. The period turns PAID when every payment succeeds."
                : "The treasurer is issuing payments for this approved period."}
            </div>
          )}
          {period.status === "PAID" && (
            <div className="flex items-center gap-2.5 rounded-lg border border-success/25 bg-success-tint px-4 py-3 text-[13px] text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Every payment succeeded — the period is PAID.
              {canLock
                ? " Locking is final: the period becomes read-only forever."
                : " A Company Admin can now lock it for good."}
            </div>
          )}
          {period.status === "LOCKED" && (
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-canvas px-4 py-3 text-[13px] text-body">
              <Lock className="h-4 w-4 shrink-0 text-muted" />
              Locked — closed for good, read-only forever.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <TotalsCard
              icon={CheckCircle2}
              label="Paid out"
              amount={formatMoney(board.totals.successful.amount)}
              count={board.totals.successful.count}
              tint="bg-teal-50 text-teal-700"
              amountClass="text-teal-700"
            />
            <TotalsCard
              icon={Clock}
              label="Pending"
              amount={formatMoney(board.totals.pending.amount)}
              count={board.totals.pending.count}
              tint="bg-slate-100 text-body"
            />
            <TotalsCard
              icon={XCircle}
              label="Failed"
              amount={formatMoney(board.totals.failed.amount)}
              count={board.totals.failed.count}
              tint="bg-danger-tint text-danger"
            />
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-border bg-canvas/70 px-5 py-3">
              <h2 className="text-[13px] font-semibold text-ink">Payments ({board.rows.length})</h2>
              <p className="text-[12px] text-muted">
                One per payslip · amounts equal net pay · successful payments are final
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                    <th className="py-2.5 pr-4 pl-5">Employee</th>
                    <th className="px-4 py-2.5">Method</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Reference / outcome</th>
                    {actionable && (
                      <th className="py-2.5 pr-5 pl-4">
                        <span className="sr-only">Record</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((row) => {
                    const badge = STATUS_BADGE[row.status];
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 align-top transition-colors last:border-0 hover:bg-canvas/60"
                      >
                        <td className="py-3 pr-4 pl-5">
                          <p className="text-[13.5px] font-semibold text-ink">{row.fullName}</p>
                          <p className="tnum text-xs text-muted">
                            {row.employeeCode} · {row.departmentName}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={row.method === "BANK" ? "indigo" : row.method === "MOBILE_MONEY" ? "teal" : "grey"}>
                            {METHOD_LABEL[row.method]}
                          </Badge>
                        </td>
                        <td className="tnum px-4 py-3 text-right text-[13px] font-bold text-ink">
                          {formatMoney(row.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={badge.variant} dot>
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="max-w-[220px] px-4 py-3 text-[12px] text-body">
                          {row.status === "SUCCESSFUL" && (
                            <>
                              <span className="tnum">{row.reference ?? "— no reference —"}</span>
                              {row.paidAt && (
                                <span className="tnum block text-[11px] text-muted">
                                  paid {formatDate(new Date(row.paidAt))}
                                </span>
                              )}
                            </>
                          )}
                          {row.status === "FAILED" && (
                            <span className="text-danger">{row.failureReason}</span>
                          )}
                          {row.status === "PENDING" && <span className="text-muted">awaiting transfer</span>}
                        </td>
                        {actionable && (
                          <td className="py-3 pr-5 pl-4">
                            {row.status === "SUCCESSFUL" ? (
                              <span className="text-[11.5px] text-muted">final</span>
                            ) : (
                              <PaymentRowActions periodId={period.id} paymentId={row.id} />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
