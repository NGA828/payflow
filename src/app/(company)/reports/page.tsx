import type { Metadata } from "next";
import { AppError } from "@/server/errors";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getReport, getReportFilterOptions, type ReportType, REPORT_TYPES } from "@/server/services/report.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";
import { statusBadgeVariant, statusLabel } from "@/lib/payroll-ui";
import { FiltersBar, ReportTabs, KpiGrid, DeptBarChart, TrendLineChart } from "./client";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card><CardContent className="py-8">
        <h1 className="text-lg font-bold text-ink">Reports are restricted</h1>
        <p className="mt-2 text-[13px] text-body">Your role does not include report access.</p>
      </CardContent></Card>
    </div>
  );
}

const TYPE_LABEL: Record<ReportType, string> = {
  summary: "Summary",
  "by-dept": "By Department",
  trend: "Trend",
  overtime: "Overtime",
  bonuses: "Bonuses",
  deductions: "Deductions",
  "per-employee": "Per Employee",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.REPORTS_VIEW);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }

  const canExport = hasPermission(ctx.membership.role, PERMISSIONS.REPORTS_EXPORT);
  const raw = await searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) flat[k] = Array.isArray(v) ? v[0] : (v as string | undefined);

  const reportType: ReportType =
    flat.report && (REPORT_TYPES as readonly string[]).includes(flat.report) ? (flat.report as ReportType) : "summary";

  // Build filter object safely — invalid dates just ignored via try/catch fallback
  const fromDate = flat.from && /^\d{4}-\d{2}-\d{2}$/.test(flat.from) ? new Date(`${flat.from}T00:00:00Z`) : null;
  const toDate = flat.to && /^\d{4}-\d{2}-\d{2}$/.test(flat.to) ? new Date(`${flat.to}T00:00:00Z`) : null;
  const filters = {
    from: fromDate,
    to: toDate,
    departmentId: flat.departmentId || null,
    employeeId: flat.employeeId || null,
    periodId: flat.periodId || null,
  };

  const [options, reportData] = await Promise.all([
    getReportFilterOptions(ctx.company.id),
    getReport(ctx.company.id, reportType, filters),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Reports</h1>
          <p className="mt-1 text-[13px] text-muted">
            {TYPE_LABEL[reportType]} · finalized payroll only (APPROVED / PAID / LOCKED) · XAF whole amounts reconcile with payslips
          </p>
        </div>
        <Badge variant="indigo" dot>{options.periods.length} finalized periods</Badge>
      </div>

      <FiltersBar departments={options.departments} employees={options.employees} periods={options.periods} canExport={canExport} />

      <ReportTabs />

      {/* ── Report bodies ─────────────────────────────────────────── */}
      {reportType === "summary" && (
        <SummaryView data={reportData as never} />
      )}
      {reportType === "by-dept" && (
        <ByDeptView data={reportData as never} />
      )}
      {reportType === "trend" && (
        <TrendView data={reportData as never} />
      )}
      {reportType === "overtime" && (
        <OvertimeView data={reportData as never} />
      )}
      {reportType === "bonuses" && (
        <BonusesView data={reportData as never} />
      )}
      {reportType === "deductions" && (
        <DeductionsView data={reportData as never} />
      )}
      {reportType === "per-employee" && (
        <PerEmployeeView data={reportData as never} />
      )}
    </div>
  );
}

function SummaryView({ data }: { data: import("@/server/services/report.service").SummaryReport }) {
  const kpis = [
    { label: "Finalized periods", value: String(data.kpis.totalPeriods), sub: "APPROVED → PAID → LOCKED" },
    { label: "Total gross", value: formatMoney(data.kpis.totalGross), sub: "sum of finalized periods" },
    { label: "Total deductions", value: formatMoney(data.kpis.totalDeductions), sub: "tax + loans + advances…" },
    { label: "Total net", value: formatMoney(data.kpis.totalNet), sub: "take-home total" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-canvas/70 px-5 py-3">
            <h2 className="text-[13px] font-semibold text-ink">Net trend</h2>
            <p className="text-[12px] text-muted">Finalized periods chronological</p>
          </div>
          <CardContent className="py-4">
            <TrendLineChart data={data.periods.map((p) => ({ label: p.name, net: Number(p.totalNet), name: p.name }))} />
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-canvas/70 px-5 py-3">
            <h2 className="text-[13px] font-semibold text-ink">Average net per period</h2>
            <p className="text-[12px] text-muted">{data.kpis.totalPeriods > 0 ? `${formatMoney(data.kpis.avgNet)} average` : "No finalized payroll yet"}</p>
          </div>
          <CardContent className="py-6">
            {data.periods.length === 0 ? <p className="py-8 text-center text-[12.5px] text-muted">No finalized periods for the selected filters.</p> :
              <div className="flex flex-col gap-2">
                {data.periods.slice(-5).reverse().map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">{p.name}</p>
                      <p className="text-[11.5px] text-muted">{formatDate(p.startDate)} → {formatDate(p.endDate)} · {p.totalEmployees ?? 0} employees</p>
                    </div>
                    <div className="text-right">
                      <p className="tnum text-[13px] font-bold text-teal-700">{formatMoney(p.totalNet)}</p>
                      <Badge variant={statusBadgeVariant(p.status)}>{statusLabel(p.status)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            }
          </CardContent>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">Periods ({data.periods.length})</h2>
          <p className="text-[12px] text-muted">Only finalized payroll appears in reports — drafts are excluded by design</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Period</th>
                <th className="px-4 py-2.5">Pay date</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Employees</th>
                <th className="px-4 py-2.5 text-right">Gross</th>
                <th className="px-4 py-2.5 text-right">Deductions</th>
                <th className="px-4 py-2.5 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.periods.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-3 pr-4 pl-5 text-[13.5px] font-semibold text-ink">{p.name}</td>
                  <td className="tnum px-4 py-3 text-[13px] text-body">{formatDate(p.payDate)}</td>
                  <td className="px-4 py-3"><Badge variant={statusBadgeVariant(p.status)} dot>{statusLabel(p.status)}</Badge></td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-body">{p.totalEmployees ?? "—"}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-body">{formatMoney(p.totalGross)}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-danger">−{formatMoney(p.totalDeductions)}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] font-bold text-teal-700">{formatMoney(p.totalNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ByDeptView({ data }: { data: import("@/server/services/report.service").ByDeptReport }) {
  const largest = data.departments[0];
  const kpis = [
    { label: "Departments", value: String(data.departments.length) },
    { label: "Total gross", value: formatMoney(data.departments.reduce((a, r) => a + Number(r.totalGross), 0)), sub: "sum across filtered periods" },
    { label: "Total net", value: formatMoney(data.departments.reduce((a, r) => a + Number(r.totalNet), 0)) },
    { label: "Largest dept", value: largest?.departmentName ?? "—", sub: largest ? formatMoney(largest.totalNet) : undefined },
  ];
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-canvas/70 px-5 py-3">
            <h2 className="text-[13px] font-semibold text-ink">Cost by department</h2>
            <p className="text-[12px] text-muted">Net pay totals (filtered periods)</p>
          </div>
          <CardContent className="py-4">
            <DeptBarChart data={data.departments.map((d) => ({ name: d.departmentName, net: Number(d.totalNet) }))} />
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-canvas/70 px-5 py-3">
            <h2 className="text-[13px] font-semibold text-ink">Departments ({data.departments.length})</h2>
            <p className="text-[12px] text-muted">Sorted by net pay descending</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                  <th className="py-2.5 pr-4 pl-5">Department</th>
                  <th className="px-4 py-2.5 text-right">Employees</th>
                  <th className="px-4 py-2.5 text-right">Gross</th>
                  <th className="px-4 py-2.5 text-right">Net</th>
                  <th className="px-4 py-2.5 text-right">Avg / employee</th>
                </tr>
              </thead>
              <tbody>
                {data.departments.map((d) => (
                  <tr key={d.departmentId} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                    <td className="py-3 pr-4 pl-5 text-[13px] font-semibold text-ink">{d.departmentName}</td>
                    <td className="tnum px-4 py-3 text-right text-[13px] text-body">{d.employees}</td>
                    <td className="tnum px-4 py-3 text-right text-[13px] text-body">{formatMoney(d.totalGross)}</td>
                    <td className="tnum px-4 py-3 text-right text-[13px] font-bold text-teal-700">{formatMoney(d.totalNet)}</td>
                    <td className="tnum px-4 py-3 text-right text-[13px] text-body">{formatMoney(d.avgNet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">Period × Department matrix</h2>
          <p className="text-[12px] text-muted">Useful for month-on-month department comparison</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Period</th>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5 text-right">Employees</th>
                <th className="px-4 py-2.5 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.periodDeptMatrix.map((row) => (
                <tr key={`${row.periodId}-${row.departmentId}`} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-2.5 pr-4 pl-5 text-[13px] text-body">{row.periodName}</td>
                  <td className="px-4 py-2.5 text-[13px] font-medium text-ink">{row.departmentName}</td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px] text-body">{row.employees}</td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px] font-semibold text-teal-700">{formatMoney(row.totalNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function TrendView({ data }: { data: import("@/server/services/report.service").TrendReport }) {
  const kpis = [
    { label: "First finalized net", value: data.kpis.firstNet ? formatMoney(data.kpis.firstNet) : "—" },
    { label: "Last finalized net", value: data.kpis.lastNet ? formatMoney(data.kpis.lastNet) : "—" },
    { label: "Change", value: data.kpis.delta ? formatMoney(data.kpis.delta) : "—", sub: data.kpis.deltaPct ?? undefined },
    { label: "Total net (range)", value: formatMoney(data.kpis.totalNet), sub: `Avg ${formatMoney(data.kpis.avgNet)} / period` },
  ];
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid kpis={kpis} />
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">Net payroll trend</h2>
          <p className="text-[12px] text-muted">Chronological — only finalized periods included</p>
        </div>
        <CardContent className="py-4">
          <TrendLineChart data={data.points.map((p) => ({ label: p.periodName, net: Number(p.totalNet), name: p.periodName }))} />
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">Periods ({data.points.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Period</th>
                <th className="px-4 py-2.5">Dates</th>
                <th className="px-4 py-2.5 text-right">Employees</th>
                <th className="px-4 py-2.5 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((p) => (
                <tr key={p.periodId} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-3 pr-4 pl-5 text-[13px] font-semibold text-ink">{p.periodName}</td>
                  <td className="tnum px-4 py-3 text-[13px] text-body">{formatDate(p.startDate)} – {formatDate(p.endDate)}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-body">{p.totalEmployees ?? "—"}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] font-bold text-teal-700">{formatMoney(p.totalNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function OvertimeView({ data }: { data: import("@/server/services/report.service").OvertimeReport }) {
  const kpis = [
    { label: "Total OT hours", value: data.kpis.totalHours, sub: "sum of finalized periods" },
    { label: "Total OT pay", value: formatMoney(data.kpis.totalPay) },
    { label: "Employees with OT", value: String(data.kpis.employeesWithOT) },
    { label: "OT periods", value: String(data.periods.length), sub: "finalized periods in range" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid kpis={kpis} />
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">Overtime by employee</h2>
          <p className="text-[12px] text-muted">Aggregated across finalized periods</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Employee</th>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5 text-right">Hours</th>
                <th className="px-4 py-2.5 text-right">OT Pay</th>
                <th className="px-4 py-2.5 text-right">Periods with OT</th>
              </tr>
            </thead>
            <tbody>
              {data.byEmployee.map((row) => (
                <tr key={row.employeeId} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-3 pr-4 pl-5">
                    <p className="text-[13px] font-semibold text-ink">{row.employeeName}</p>
                    <p className="tnum text-xs text-muted">{row.employeeCode}</p>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-body">{row.departmentName}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-body">{row.totalHours}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] font-semibold text-ink">{formatMoney(row.totalPay)}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-body">{row.periods}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">Detail rows ({data.rows.length})</h2>
          <p className="text-[12px] text-muted">Per period — hours from adjustments, pay from adjustments or payslip</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Period</th>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5 text-right">Hours</th>
                <th className="px-4 py-2.5 text-right">Adj Pay</th>
                <th className="px-4 py-2.5 text-right">Payslip OT</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={`${row.payrollPeriodId}-${row.employeeId}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-2.5 pr-4 pl-5 text-[13px] text-body">{row.periodName}</td>
                  <td className="px-4 py-2.5">
                    <p className="text-[13px] font-medium text-ink">{row.employeeName}</p>
                    <p className="tnum text-xs text-muted">{row.employeeCode} · {row.departmentName}</p>
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px] text-body">{row.totalHours}</td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px] text-body">{formatMoney(row.totalPay)}</td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px] text-body">{formatMoney(row.payslipOvertimePay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BonusesView({ data }: { data: import("@/server/services/report.service").BonusesReport }) {
  const kpis = [
    { label: "Total bonuses", value: formatMoney(data.kpis.totalAmount) },
    { label: "Bonus entries", value: String(data.kpis.count) },
    { label: "Employees", value: String(data.kpis.employees) },
    { label: "Periods", value: String(data.periods.length) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-canvas/70 px-5 py-3">
            <h2 className="text-[13px] font-semibold text-ink">Bonuses by department</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                  <th className="py-2.5 pr-4 pl-5">Department</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {data.byDepartment.map((d) => (
                  <tr key={d.departmentId} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 pl-5 text-[13px] font-medium text-ink">{d.departmentName}</td>
                    <td className="tnum px-4 py-2.5 text-right text-[13px] font-semibold text-ink">{formatMoney(d.totalAmount)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-[13px] text-body">{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-canvas/70 px-5 py-3">
            <h2 className="text-[13px] font-semibold text-ink">Bonuses by employee (top)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                  <th className="py-2.5 pr-4 pl-5">Employee</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {data.byEmployee.slice(0, 15).map((e) => (
                  <tr key={e.employeeId} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 pl-5"><p className="text-[13px] font-medium text-ink">{e.employeeName}</p><p className="tnum text-xs text-muted">{e.employeeCode}</p></td>
                    <td className="tnum px-4 py-2.5 text-right text-[13px] font-semibold text-ink">{formatMoney(e.totalAmount)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-[13px] text-body">{e.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">All bonus adjustments ({data.rows.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Period</th>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Note</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={`${r.payrollPeriodId}-${r.employeeId}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-2.5 pr-4 pl-5 text-[13px] text-body">{r.periodName}</td>
                  <td className="px-4 py-2.5"><p className="text-[13px] font-medium text-ink">{r.employeeName}</p><p className="tnum text-xs text-muted">{r.employeeCode} · {r.departmentName}</p></td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px] font-semibold text-ink">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-body">{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DeductionsView({ data }: { data: import("@/server/services/report.service").DeductionsReport }) {
  const kpis = [
    { label: "Total deductions (adjustments)", value: formatMoney(data.kpis.totalAmount) },
    { label: "Deduction entries", value: String(data.kpis.count) },
    { label: "Types", value: String(data.byType.length) },
    { label: "Employees affected", value: String(data.byEmployee.length) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid kpis={kpis} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-canvas/70 px-5 py-3">
            <h2 className="text-[13px] font-semibold text-ink">By type</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                  <th className="py-2.5 pr-4 pl-5">Type</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {data.byType.map((t) => (
                  <tr key={t.type} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 pl-5 text-[13px] font-medium text-ink">{t.type}</td>
                    <td className="tnum px-4 py-2.5 text-right text-[13px] font-semibold text-ink">{formatMoney(t.totalAmount)}</td>
                    <td className="tnum px-4 py-2.5 text-right text-[13px] text-body">{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-canvas/70 px-5 py-3">
            <h2 className="text-[13px] font-semibold text-ink">By employee (top)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                  <th className="py-2.5 pr-4 pl-5">Employee</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.byEmployee.slice(0, 15).map((e) => (
                  <tr key={e.employeeId} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 pl-5"><p className="text-[13px] font-medium text-ink">{e.employeeName}</p><p className="tnum text-xs text-muted">{e.employeeCode} · {e.departmentName}</p></td>
                    <td className="tnum px-4 py-2.5 text-right text-[13px] font-semibold text-ink">{formatMoney(e.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">All deduction adjustments ({data.rows.length})</h2>
          <p className="text-[12px] text-muted">LOAN, ADVANCE, PENALTY, OTHER_DEDUCTION, TAX (additional)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Period</th>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Note</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={`${r.payrollPeriodId}-${r.employeeId}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-2.5 pr-4 pl-5 text-[13px] text-body">{r.periodName}</td>
                  <td className="px-4 py-2.5"><p className="text-[13px] font-medium text-ink">{r.employeeName}</p><p className="tnum text-xs text-muted">{r.employeeCode} · {r.departmentName}</p></td>
                  <td className="px-4 py-2.5"><Badge variant={r.type === "TAX" ? "amber" : r.type === "LOAN" ? "blue" : r.type === "PENALTY" ? "red" : "grey"}>{r.type}</Badge></td>
                  <td className="tnum px-4 py-2.5 text-right text-[13px] font-semibold text-ink">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-body">{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PerEmployeeView({ data }: { data: import("@/server/services/report.service").PerEmployeeReport }) {
  const kpis = [
    { label: "Employees paid", value: String(data.kpis.totalEmployees), sub: "distinct in finalized payroll" },
    { label: "Total gross", value: formatMoney(data.kpis.totalGross) },
    { label: "Total net", value: formatMoney(data.kpis.totalNet) },
    { label: "Avg net / employee", value: formatMoney(data.kpis.avgNet) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <KpiGrid kpis={kpis} />
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-canvas/70 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-ink">Employees ({data.employees.length})</h2>
          <p className="text-[12px] text-muted">Aggregated history across finalized periods — click-through to employee profiles</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Employee</th>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5 text-right">Periods</th>
                <th className="px-4 py-2.5 text-right">Total gross</th>
                <th className="px-4 py-2.5 text-right">Total deductions</th>
                <th className="px-4 py-2.5 text-right">Total net</th>
                <th className="px-4 py-2.5 text-right">Avg net</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((e) => (
                <tr key={e.employeeId} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-3 pr-4 pl-5">
                    <p className="text-[13px] font-semibold text-ink">{e.employeeName}</p>
                    <p className="tnum text-xs text-muted">{e.employeeCode}</p>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-body">{e.departmentName}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-body">{e.periodsPaid}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-body">{formatMoney(e.totalGross)}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-danger">−{formatMoney(e.totalDeductions)}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] font-bold text-teal-700">{formatMoney(e.totalNet)}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] text-body">{formatMoney(e.avgNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
