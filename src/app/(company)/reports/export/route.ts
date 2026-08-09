import { NextResponse } from "next/server";
import { toApiError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getReport, REPORT_TYPES, type ReportType } from "@/server/services/report.service";
import { buildExcelReport } from "@/server/reports/excel";
import { renderReportPdf } from "@/server/reports/report-document";
import { slugifyFileStem } from "@/server/files/slug";
import { audit } from "@/server/security/audit";

export const dynamic = "force-dynamic";

function parseFilterFromSearch(search: URLSearchParams) {
  const from = search.get("from");
  const to = search.get("to");
  const fromDate = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00Z`) : null;
  const toDate = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T00:00:00Z`) : null;
  return {
    from: fromDate,
    to: toDate,
    departmentId: search.get("departmentId") || null,
    employeeId: search.get("employeeId") || null,
    periodId: search.get("periodId") || null,
  };
}

function filtersLabel(search: URLSearchParams): string {
  const parts: string[] = [];
  if (search.get("from")) parts.push(`From ${search.get("from")}`);
  if (search.get("to")) parts.push(`To ${search.get("to")}`);
  if (search.get("departmentId")) parts.push(`Dept ${search.get("departmentId")}`);
  if (search.get("employeeId")) parts.push(`Employee ${search.get("employeeId")}`);
  if (search.get("periodId")) parts.push(`Period ${search.get("periodId")}`);
  return parts.length > 0 ? parts.join(" · ") + " · finalized periods only" : "All finalized periods (APPROVED, PAID, LOCKED)";
}

export async function GET(request: Request) {
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.REPORTS_EXPORT);
    const url = new URL(request.url);
    const reportParam = url.searchParams.get("report") as ReportType | null;
    const format = (url.searchParams.get("format") as "excel" | "pdf" | null) ?? "excel";

    const reportType: ReportType = reportParam && (REPORT_TYPES as readonly string[]).includes(reportParam) ? reportParam : "summary";

    const filters = parseFilterFromSearch(url.searchParams);
    const data = await getReport(ctx.company.id, reportType, filters);

    const label = filtersLabel(url.searchParams);

    if (format === "pdf") {
      const pdf = await renderReportPdf({
        type: reportType,
        data: data as never,
        meta: { companyName: ctx.company.name, filtersLabel: label, generatedAt: new Date() },
      });
      await audit({
        companyId: ctx.company.id,
        userId: ctx.user.id,
        action: "report.exported",
        entityType: "Report",
        entityId: reportType,
        metadata: { report: reportType, format: "pdf", filters: Object.fromEntries(url.searchParams.entries()) },
        ...(await requestMeta()),
      });
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="payflow-${slugifyFileStem(reportType)}-${new Date().toISOString().slice(0, 10)}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const { buffer, filename } = await buildExcelReport(reportType, data as never, {
      companyName: ctx.company.name,
      filtersLabel: label,
    });

    await audit({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      action: "report.exported",
      entityType: "Report",
      entityId: reportType,
      metadata: { report: reportType, format: "excel", filters: Object.fromEntries(url.searchParams.entries()) },
      ...(await requestMeta()),
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const { status, body } = toApiError(error);
    return NextResponse.json(body, { status });
  }
}
