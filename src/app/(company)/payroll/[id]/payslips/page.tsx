import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Archive, Download, FileText, Wallet } from "lucide-react";
import Big from "big.js";
import { AppError } from "@/server/errors";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getPeriodDetail } from "@/server/services/payroll-period.service";
import {
  listPayslipsForPeriod,
  type PayslipListRow,
} from "@/server/services/payroll-processing.service";
import { roundWholeXaf } from "@/server/payroll/money";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PeriodPageHeader } from "../subnav";
import { ProcessPayrollButton } from "../client";

export const metadata: Metadata = { title: "Payslips" };
export const dynamic = "force-dynamic";

const STATUS_BADGE = {
  DRAFT: { variant: "grey", label: "Draft" },
  APPROVED: { variant: "teal", label: "Approved" },
  VOID: { variant: "red", label: "Void" },
} as const;

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card>
        <CardContent className="py-8">
          <h1 className="text-lg font-bold text-ink">Payslips are restricted</h1>
          <p className="mt-2 text-[13px] text-body">Your role does not include payslip access.</p>
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

/** Aggregate the rows we actually show, so tabs and cards never disagree. */
function totalsOf(rows: PayslipListRow[]): {
  gross: string;
  deductions: string;
  net: string;
} {
  let gross = new Big(0);
  let deductions = new Big(0);
  let net = new Big(0);
  for (const row of rows) {
    gross = gross.plus(row.grossSalary);
    deductions = deductions.plus(row.deductions);
    net = net.plus(row.netSalary);
  }
  return {
    gross: roundWholeXaf(gross),
    deductions: roundWholeXaf(deductions),
    net: roundWholeXaf(net),
  };
}

export default async function PayslipsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.PAYSLIPS_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }
  const canProcess = hasPermission(ctx.membership.role, PERMISSIONS.PAYROLL_PROCESS);
  const canViewPayments = hasPermission(ctx.membership.role, PERMISSIONS.PAYMENTS_VIEW);
  const canDownload = hasPermission(ctx.membership.role, PERMISSIONS.PAYSLIPS_DOWNLOAD);

  const { id } = await params;
  const period = await getPeriodDetail(ctx.company.id, id, false);
  if (!period) notFound();

  const rows = await listPayslipsForPeriod(ctx.company.id, id);
  const totals = totalsOf(rows);
  const canRun = canProcess && (period.status === "DRAFT" || period.status === "READY");
  const canZip = canDownload && rows.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <PeriodPageHeader
        periodId={period.id}
        name={period.name}
        status={period.status}
        dateRange={`${formatDate(period.startDate)} – ${formatDate(period.endDate)} · pay date ${formatDate(period.payDate)}`}
        withPayments={canViewPayments}
        active="payslips"
        actions={
          canRun || canZip ? (
            <div className="flex items-center gap-2">
              {canZip && (
                <Link
                  href={`/payroll/${period.id}/payslips/export`}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  <Archive className="h-4 w-4" /> Download ZIP
                </Link>
              )}
              {canRun && (
                <ProcessPayrollButton periodId={period.id} reprocess={period.status === "READY"} />
              )}
            </div>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-indigo-50">
              <FileText className="h-5 w-5 text-primary-600" strokeWidth={1.7} />
            </span>
            <p className="text-[14px] font-semibold text-ink">No payslips yet</p>
            <p className="mt-1 max-w-sm text-[12.5px] text-body">
              {period.status === "DRAFT" || period.status === "IN_PROGRESS"
                ? "Process this period and the engine will compute one payslip per eligible employee."
                : "This period moved past processing without any payslips on record."}
            </p>
            {canRun && (
              <div className="mt-4">
                <ProcessPayrollButton periodId={period.id} reprocess={false} />
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <TotalCard
              icon={ArrowUpRight}
              label="Gross"
              amount={formatMoney(totals.gross)}
              sub={`${rows.length} payslip${rows.length === 1 ? "" : "s"}`}
              tint="bg-indigo-50 text-primary-600"
              amountClass="text-ink"
            />
            <TotalCard
              icon={ArrowDownRight}
              label="Deductions"
              amount={formatMoney(totals.deductions)}
              sub="tax, loans, advances, penalties"
              tint="bg-danger-tint text-danger"
              amountClass="text-ink"
            />
            <TotalCard
              icon={Wallet}
              label="Net pay"
              amount={formatMoney(totals.net)}
              sub="what employees take home"
              tint="bg-teal-50 text-teal-700"
              amountClass="text-teal-700"
            />
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-border bg-canvas/70 px-5 py-3">
              <h2 className="text-[13px] font-semibold text-ink">Payslips ({rows.length})</h2>
              <p className="text-[12px] text-muted">
                Branded PDFs rendered from the last payroll run — download individually or as one
                ZIP.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                    <th className="py-2.5 pr-4 pl-5">Employee</th>
                    <th className="px-4 py-2.5">Payslip №</th>
                    <th className="px-4 py-2.5 text-right">Basic</th>
                    <th className="px-4 py-2.5 text-right">Overtime</th>
                    <th className="px-4 py-2.5 text-right">Gross</th>
                    <th className="px-4 py-2.5 text-right">Deductions</th>
                    <th className="px-4 py-2.5 text-right">Net pay</th>
                    <th className="py-2.5 pr-5 pl-4">Status</th>
                    {canDownload && (
                      <th className="py-2.5 pr-5 pl-4 text-right">
                        <span className="sr-only">Download PDF</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const badge = STATUS_BADGE[row.status];
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 transition-colors last:border-0 hover:bg-canvas/60"
                      >
                        <td className="py-3 pr-4 pl-5">
                          <Link
                            href={`/employees/${row.employeeId}`}
                            className="text-[13.5px] font-semibold text-ink hover:text-primary-700 hover:underline"
                          >
                            {row.fullName}
                          </Link>
                          <p className="tnum text-xs text-muted">
                            {row.employeeCode} · {row.departmentName}
                          </p>
                        </td>
                        <td className="tnum px-4 py-3 text-[12.5px] text-body">{row.payslipNumber}</td>
                        <td className="tnum px-4 py-3 text-right text-[13px] text-body">
                          {formatMoney(row.basicSalary)}
                        </td>
                        <td className="tnum px-4 py-3 text-right text-[13px] text-body">
                          {row.overtimePay === "0" ? "—" : formatMoney(row.overtimePay)}
                        </td>
                        <td className="tnum px-4 py-3 text-right text-[13px] font-semibold text-ink">
                          {formatMoney(row.grossSalary)}
                        </td>
                        <td className="tnum px-4 py-3 text-right text-[13px] text-danger">
                          −{formatMoney(row.deductions)}
                        </td>
                        <td className="tnum px-4 py-3 text-right text-[13px] font-bold text-teal-700">
                          {formatMoney(row.netSalary)}
                        </td>
                        <td className="py-3 pr-5 pl-4">
                          <Badge variant={badge.variant} dot>
                            {badge.label}
                          </Badge>
                        </td>
                        {canDownload && (
                          <td className="py-3 pr-5 pl-4 text-right">
                            <Link
                              href={`/payroll/${period.id}/payslips/${row.id}/download`}
                              className={buttonVariants({ variant: "ghost", size: "sm" })}
                              title={`Download ${row.payslipNumber}`}
                              aria-label={`Download payslip ${row.payslipNumber} for ${row.fullName}`}
                            >
                              <Download className="h-4 w-4" /> PDF
                            </Link>
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
