import * as React from "react";
import type { ReactElement } from "react";
import {
  Document,
  Page,
  Text,
  View,
  type DocumentProps,
} from "@react-pdf/renderer";
import { registerInterFonts } from "@/server/payslips/fonts";
import type {
  SummaryReport,
  ByDeptReport,
  TrendReport,
  OvertimeReport,
  BonusesReport,
  DeductionsReport,
  PerEmployeeReport,
  ReportType,
} from "@/server/services/report.service";
import { formatDate } from "@/lib/format";

const INK = "#0F172A";
const MUTED = "#94A3B8";
const BODY = "#475569";
const PRIMARY = "#4F46E5";
const SLATE_100 = "#F1F5F9";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontSize: 11, fontWeight: 700, color: INK, marginBottom: 6 }}>{title}</Text>
      {children}
    </View>
  );
}

function KpiRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={{ fontSize: 10, color: MUTED }}>{label}</Text>
      <Text style={{ fontSize: 10, fontWeight: 600, color: INK }}>{value}</Text>
    </View>
  );
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: INK, paddingVertical: 5, paddingHorizontal: 6, marginTop: 6 }}>
      {cols.map((c) => (
        <Text key={c} style={{ fontSize: 8, fontWeight: 700, color: "#FFFFFF", flex: 1 }}>
          {c}
        </Text>
      ))}
    </View>
  );
}

function TableRow({ cols, last }: { cols: string[]; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        paddingVertical: 4,
        paddingHorizontal: 6,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: SLATE_100,
        borderBottomStyle: "solid",
      }}
    >
      {cols.map((c, i) => (
        <Text key={`${i}-${c}`} style={{ fontSize: 8, color: BODY, flex: 1 }}>
          {c}
        </Text>
      ))}
    </View>
  );
}

export interface ReportPdfProps {
  type: ReportType;
  data: SummaryReport | ByDeptReport | TrendReport | OvertimeReport | BonusesReport | DeductionsReport | PerEmployeeReport;
  meta: { companyName: string; filtersLabel: string; generatedAt: Date };
}

function titleOf(type: ReportType): string {
  const map: Record<ReportType, string> = {
    summary: "Payroll Summary Report",
    "by-dept": "Payroll by Department",
    trend: "Payroll Trend Report",
    overtime: "Overtime Report",
    bonuses: "Bonuses Report",
    deductions: "Deductions Report",
    "per-employee": "Per-Employee Payroll History",
  };
  return map[type];
}

export function ReportPdfDocument({ type, data, meta }: ReportPdfProps) {
  const title = titleOf(type);
  return (
    <Document title={title} author={meta.companyName} creator="PayFlow">
      <Page size="A4" orientation="landscape" style={{ fontFamily: "Inter", paddingHorizontal: 32, paddingVertical: 28 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: INK, paddingBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: 700, color: INK }}>{meta.companyName}</Text>
            <Text style={{ fontSize: 12, fontWeight: 600, color: PRIMARY, marginTop: 2 }}>{title}</Text>
            <Text style={{ fontSize: 8, color: MUTED, marginTop: 3 }}>{meta.filtersLabel}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 8, color: MUTED }}>Generated</Text>
            <Text style={{ fontSize: 9, fontWeight: 500, color: INK }}>{formatDate(meta.generatedAt)}</Text>
            <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>Finalized periods only · PayFlow</Text>
          </View>
        </View>

        {/* KPIs */}
        {type === "summary" && (
          <Section title="Key Performance Indicators">
            <View style={{ flexDirection: "row", gap: 24 }}>
              <View style={{ flex: 1 }}>
                <KpiRow label="Total periods" value={String((data as SummaryReport).kpis.totalPeriods)} />
                <KpiRow label="Total gross" value={(data as SummaryReport).kpis.totalGross} />
                <KpiRow label="Total deductions" value={(data as SummaryReport).kpis.totalDeductions} />
                <KpiRow label="Total net" value={(data as SummaryReport).kpis.totalNet} />
                <KpiRow label="Avg net / period" value={(data as SummaryReport).kpis.avgNet} />
              </View>
            </View>
          </Section>
        )}

        {type === "by-dept" && (
          <Section title="Cost by Department">
            <TableHeader cols={["Department", "Employees", "Gross", "Deductions", "Net", "Avg Net"]} />
            {(data as ByDeptReport).departments.slice(0, 30).map((d, i, arr) => (
              <TableRow key={d.departmentId} cols={[d.departmentName, String(d.employees), d.totalGross, d.totalDeductions, d.totalNet, d.avgNet]} last={i === arr.length - 1} />
            ))}
          </Section>
        )}

        {type === "trend" && (
          <Section title="Trend">
            <View style={{ flexDirection: "row", gap: 24 }}>
              <View style={{ flex: 1 }}>
                <KpiRow label="First net" value={(data as TrendReport).kpis.firstNet ?? "—"} />
                <KpiRow label="Last net" value={(data as TrendReport).kpis.lastNet ?? "—"} />
                <KpiRow label="Delta" value={(data as TrendReport).kpis.delta ?? "—"} />
                <KpiRow label="Delta %" value={(data as TrendReport).kpis.deltaPct ?? "—"} />
              </View>
              <View style={{ flex: 1 }}>
                <KpiRow label="Total net" value={(data as TrendReport).kpis.totalNet} />
                <KpiRow label="Avg net" value={(data as TrendReport).kpis.avgNet} />
              </View>
            </View>
            <View style={{ marginTop: 10 }}>
              <TableHeader cols={["Period", "Start", "End", "Employees", "Gross", "Deductions", "Net"]} />
              {(data as TrendReport).points.map((p, i, arr) => (
                <TableRow key={p.periodId} cols={[p.periodName, formatDate(p.startDate), formatDate(p.endDate), String(p.totalEmployees ?? ""), p.totalGross, p.totalDeductions, p.totalNet]} last={i === arr.length - 1} />
              ))}
            </View>
          </Section>
        )}

        {type === "overtime" && (
          <Section title="Overtime — by Employee">
            <TableHeader cols={["Code", "Employee", "Department", "Hours", "Pay", "Periods"]} />
            {(data as OvertimeReport).byEmployee.slice(0, 40).map((e, i, arr) => (
              <TableRow key={e.employeeId} cols={[e.employeeCode, e.employeeName, e.departmentName, e.totalHours, e.totalPay, String(e.periods)]} last={i === arr.length - 1} />
            ))}
          </Section>
        )}

        {type === "bonuses" && (
          <Section title="Bonuses — by Employee">
            <TableHeader cols={["Code", "Employee", "Department", "Total Bonus", "Count"]} />
            {(data as BonusesReport).byEmployee.slice(0, 40).map((e, i, arr) => (
              <TableRow key={e.employeeId} cols={[e.employeeCode, e.employeeName, e.departmentName, e.totalAmount, String(e.count)]} last={i === arr.length - 1} />
            ))}
          </Section>
        )}

        {type === "deductions" && (
          <Section title="Deductions — by Type">
            <TableHeader cols={["Type", "Total", "Count"]} />
            {(data as DeductionsReport).byType.map((t, i, arr) => (
              <TableRow key={t.type} cols={[t.type, t.totalAmount, String(t.count)]} last={i === arr.length - 1} />
            ))}
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 9, fontWeight: 600, color: INK, marginBottom: 4 }}>By Employee (top 30)</Text>
              <TableHeader cols={["Code", "Employee", "Department", "Total"]} />
              {(data as DeductionsReport).byEmployee.slice(0, 30).map((e, i, arr) => (
                <TableRow key={e.employeeId} cols={[e.employeeCode, e.employeeName, e.departmentName, e.totalAmount]} last={i === arr.length - 1} />
              ))}
            </View>
          </Section>
        )}

        {type === "per-employee" && (
          <Section title="Per-Employee Totals">
            <TableHeader cols={["Code", "Employee", "Department", "Periods", "Gross", "Deductions", "Net", "Avg Net"]} />
            {(data as PerEmployeeReport).employees.slice(0, 40).map((e, i, arr) => (
              <TableRow key={e.employeeId} cols={[e.employeeCode, e.employeeName, e.departmentName, String(e.periodsPaid), e.totalGross, e.totalDeductions, e.totalNet, e.avgNet]} last={i === arr.length - 1} />
            ))}
          </Section>
        )}

        {/* Periods table common for summary fallback */}
        {type === "summary" && (
          <Section title="Periods">
            <TableHeader cols={["Period", "Start", "End", "Status", "Employees", "Gross", "Deductions", "Net"]} />
            {(data as SummaryReport).periods.slice(0, 40).map((p, i, arr) => (
              <TableRow key={p.id} cols={[p.name, formatDate(p.startDate), formatDate(p.endDate), p.status, String(p.totalEmployees ?? ""), p.totalGross, p.totalDeductions, p.totalNet]} last={i === arr.length - 1} />
            ))}
          </Section>
        )}

        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: SLATE_100, paddingTop: 6 }}>
          <Text style={{ fontSize: 7, color: MUTED, textAlign: "center" }}>
            PayFlow · {meta.companyName} · {title} · This report includes only finalized payroll periods (APPROVED, PAID, LOCKED) · Generated from payslips & adjustments
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(props: ReportPdfProps): Promise<Buffer> {
  registerInterFonts();
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer((<ReportPdfDocument {...props} />) as ReactElement<DocumentProps>);
}
