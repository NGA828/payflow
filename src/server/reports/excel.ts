import ExcelJS from "exceljs";
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

function commonHeaders(workbook: ExcelJS.Workbook, title: string, companyName: string, filtersLabel: string) {
  const ws = workbook.addWorksheet(title, {
    properties: { tabColor: { argb: "FF4F46E5" } },
  });
  ws.addRow([companyName]);
  ws.addRow([title]);
  ws.addRow([filtersLabel]);
  ws.addRow([]);
  // Style header rows
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.getRow(2).font = { bold: true, size: 12 };
  ws.getRow(3).font = { italic: true, size: 10, color: { argb: "FF94A3B8" } };
  return ws;
}

function styleHeader(ws: ExcelJS.Worksheet, rowNumber: number) {
  const row = ws.getRow(rowNumber);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  row.commit();
}

export async function buildExcelReport(
  type: ReportType,
  data: SummaryReport | ByDeptReport | TrendReport | OvertimeReport | BonusesReport | DeductionsReport | PerEmployeeReport,
  meta: { companyName: string; filtersLabel: string },
): Promise<{ buffer: Buffer; filename: string }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PayFlow";
  workbook.created = new Date();

  let ws: ExcelJS.Worksheet;
  const slug = type;

  switch (type) {
    case "summary": {
      const report = data as SummaryReport;
      ws = commonHeaders(workbook, "Payroll Summary Report", meta.companyName, meta.filtersLabel);
      ws.addRow(["KPI", "Value"]);
      styleHeader(ws, ws.rowCount);
      ws.addRow(["Total periods", report.kpis.totalPeriods]);
      ws.addRow(["Total gross", report.kpis.totalGross]);
      ws.addRow(["Total deductions", report.kpis.totalDeductions]);
      ws.addRow(["Total net", report.kpis.totalNet]);
      ws.addRow(["Avg net / period", report.kpis.avgNet]);
      ws.addRow(["Total employee-periods", report.kpis.totalEmployeesPaid]);
      ws.addRow([]);
      ws.addRow(["Period", "Start", "End", "Pay date", "Status", "Employees", "Gross", "Deductions", "Net"]);
      styleHeader(ws, ws.rowCount);
      for (const p of report.periods) {
        ws.addRow([
          p.name,
          formatDate(p.startDate),
          formatDate(p.endDate),
          formatDate(p.payDate),
          p.status,
          p.totalEmployees ?? "",
          p.totalGross,
          p.totalDeductions,
          p.totalNet,
        ]);
      }
      break;
    }
    case "by-dept": {
      const report = data as ByDeptReport;
      ws = commonHeaders(workbook, "Payroll by Department", meta.companyName, meta.filtersLabel);
      ws.addRow(["Department", "Employees", "Gross", "Deductions", "Net", "Avg Net / employee"]);
      styleHeader(ws, ws.rowCount);
      for (const d of report.departments) {
        ws.addRow([d.departmentName, d.employees, d.totalGross, d.totalDeductions, d.totalNet, d.avgNet]);
      }
      ws.addRow([]);
      ws.addRow(["Period Breakdown", "Department", "Employees", "Net"]);
      styleHeader(ws, ws.rowCount);
      for (const m of report.periodDeptMatrix) {
        ws.addRow([m.periodName, m.departmentName, m.employees, m.totalNet]);
      }
      break;
    }
    case "trend": {
      const report = data as TrendReport;
      ws = commonHeaders(workbook, "Payroll Trend Report", meta.companyName, meta.filtersLabel);
      ws.addRow(["KPI", "Value"]);
      styleHeader(ws, ws.rowCount);
      ws.addRow(["First period net", report.kpis.firstNet ?? "—"]);
      ws.addRow(["Last period net", report.kpis.lastNet ?? "—"]);
      ws.addRow(["Delta", report.kpis.delta ?? "—"]);
      ws.addRow(["Delta %", report.kpis.deltaPct ?? "—"]);
      ws.addRow(["Total net", report.kpis.totalNet]);
      ws.addRow(["Avg net", report.kpis.avgNet]);
      ws.addRow([]);
      ws.addRow(["Period", "Start", "End", "Employees", "Gross", "Deductions", "Net"]);
      styleHeader(ws, ws.rowCount);
      for (const p of report.points) {
        ws.addRow([
          p.periodName,
          formatDate(p.startDate),
          formatDate(p.endDate),
          p.totalEmployees ?? "",
          p.totalGross,
          p.totalDeductions,
          p.totalNet,
        ]);
      }
      break;
    }
    case "overtime": {
      const report = data as OvertimeReport;
      ws = commonHeaders(workbook, "Overtime Report", meta.companyName, meta.filtersLabel);
      ws.addRow(["KPI", "Value"]);
      styleHeader(ws, ws.rowCount);
      ws.addRow(["Total OT hours", report.kpis.totalHours]);
      ws.addRow(["Total OT pay", report.kpis.totalPay]);
      ws.addRow(["Employees with OT", report.kpis.employeesWithOT]);
      ws.addRow([]);
      ws.addRow(["By Employee", "Code", "Name", "Department", "Total Hours", "Total Pay", "Periods"]);
      styleHeader(ws, ws.rowCount);
      for (const e of report.byEmployee) {
        ws.addRow(["", e.employeeCode, e.employeeName, e.departmentName, e.totalHours, e.totalPay, e.periods]);
      }
      ws.addRow([]);
      ws.addRow(["Period", "Employee Code", "Employee Name", "Department", "Hours", "Pay (adj)", "Pay (payslip)"]);
      styleHeader(ws, ws.rowCount);
      for (const r of report.rows) {
        ws.addRow([r.periodName, r.employeeCode, r.employeeName, r.departmentName, r.totalHours, r.totalPay, r.payslipOvertimePay]);
      }
      break;
    }
    case "bonuses": {
      const report = data as BonusesReport;
      ws = commonHeaders(workbook, "Bonuses Report", meta.companyName, meta.filtersLabel);
      ws.addRow(["KPI", "Value"]);
      styleHeader(ws, ws.rowCount);
      ws.addRow(["Total bonus amount", report.kpis.totalAmount]);
      ws.addRow(["Bonus rows", report.kpis.count]);
      ws.addRow(["Employees receiving bonus", report.kpis.employees]);
      ws.addRow([]);
      ws.addRow(["By Employee", "Code", "Name", "Department", "Total Bonus", "Count"]);
      styleHeader(ws, ws.rowCount);
      for (const e of report.byEmployee) {
        ws.addRow(["", e.employeeCode, e.employeeName, e.departmentName, e.totalAmount, e.count]);
      }
      ws.addRow([]);
      ws.addRow(["By Department", "Department", "Total Bonus", "Count"]);
      styleHeader(ws, ws.rowCount);
      for (const d of report.byDepartment) {
        ws.addRow(["", d.departmentName, d.totalAmount, d.count]);
      }
      ws.addRow([]);
      ws.addRow(["Detail", "Period", "Employee Code", "Employee Name", "Department", "Amount", "Note"]);
      styleHeader(ws, ws.rowCount);
      for (const r of report.rows) {
        ws.addRow(["", r.periodName, r.employeeCode, r.employeeName, r.departmentName, r.amount, r.note ?? ""]);
      }
      break;
    }
    case "deductions": {
      const report = data as DeductionsReport;
      ws = commonHeaders(workbook, "Deductions Report", meta.companyName, meta.filtersLabel);
      ws.addRow(["KPI", "Value"]);
      styleHeader(ws, ws.rowCount);
      ws.addRow(["Total deductions", report.kpis.totalAmount]);
      ws.addRow(["Deduction rows", report.kpis.count]);
      ws.addRow([]);
      ws.addRow(["By Type", "Type", "Total Amount", "Count"]);
      styleHeader(ws, ws.rowCount);
      for (const t of report.byType) {
        ws.addRow(["", t.type, t.totalAmount, t.count]);
      }
      ws.addRow([]);
      ws.addRow(["By Employee", "Code", "Name", "Department", "Total", "Breakdown JSON"]);
      styleHeader(ws, ws.rowCount);
      for (const e of report.byEmployee) {
        ws.addRow(["", e.employeeCode, e.employeeName, e.departmentName, e.totalAmount, JSON.stringify(e.byType)]);
      }
      ws.addRow([]);
      ws.addRow(["Detail", "Period", "Employee Code", "Employee Name", "Department", "Type", "Amount", "Note"]);
      styleHeader(ws, ws.rowCount);
      for (const r of report.rows) {
        ws.addRow(["", r.periodName, r.employeeCode, r.employeeName, r.departmentName, r.type, r.amount, r.note ?? ""]);
      }
      break;
    }
    case "per-employee": {
      const report = data as PerEmployeeReport;
      ws = commonHeaders(workbook, "Per-Employee Payroll History", meta.companyName, meta.filtersLabel);
      ws.addRow(["KPI", "Value"]);
      styleHeader(ws, ws.rowCount);
      ws.addRow(["Employees", report.kpis.totalEmployees]);
      ws.addRow(["Total gross", report.kpis.totalGross]);
      ws.addRow(["Total net", report.kpis.totalNet]);
      ws.addRow(["Avg net / employee", report.kpis.avgNet]);
      ws.addRow([]);
      ws.addRow(["Employee Code", "Employee Name", "Department", "Periods Paid", "Total Gross", "Total Deductions", "Total Net", "Avg Net"]);
      styleHeader(ws, ws.rowCount);
      for (const e of report.employees) {
        ws.addRow([
          e.employeeCode,
          e.employeeName,
          e.departmentName,
          e.periodsPaid,
          e.totalGross,
          e.totalDeductions,
          e.totalNet,
          e.avgNet,
        ]);
      }
      ws.addRow([]);
      ws.addRow(["History", "Period", "Employee Code", "Employee Name", "Basic", "OT", "Gross", "Deductions", "Net"]);
      styleHeader(ws, ws.rowCount);
      for (const e of report.employees) {
        for (const h of e.history) {
          ws.addRow([
            "",
            h.periodName,
            e.employeeCode,
            e.employeeName,
            h.basicSalary,
            h.overtimePay,
            h.grossSalary,
            h.deductions,
            h.netSalary,
          ]);
        }
      }
      break;
    }
    default: {
      ws = commonHeaders(workbook, "Report", meta.companyName, meta.filtersLabel);
      ws.addRow(["Unknown report type", type]);
    }
  }

  // Auto width
  ws.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.((cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = Math.min(len + 2, 40);
    });
    col.width = max;
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer);
  const filename = `payflow-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return { buffer, filename };
}
