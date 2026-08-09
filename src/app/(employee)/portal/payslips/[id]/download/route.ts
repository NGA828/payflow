import { NextResponse } from "next/server";
import { toApiError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import { requireEmployeeContext } from "@/server/tenant/employee-context";
import { getDb } from "@/lib/db";
import { getPayslipPdfDownload } from "@/server/services/payslip.service";
import type { CompanyContext } from "@/server/tenant/context";

export const dynamic = "force-dynamic";

/**
 * Employee-scoped payslip PDF download — only APPROVED payslips of the
 * logged-in employee. Reuses the same service as the staff download.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const empCtx = await requireEmployeeContext();
    const { id } = await params;

    // Ensure the payslip belongs to the employee and is APPROVED
    const payslip = await getDb().payslip.findFirst({
      where: { id, companyId: empCtx.company.id, employeeId: empCtx.employee.id, status: "APPROVED" },
      select: { id: true, payrollPeriodId: true },
    });
    if (!payslip) {
      throw new (await import("@/server/errors")).AppError("NOT_FOUND", "Payslip not found or not yet approved for your account.");
    }

    const companyCtx: CompanyContext = {
      user: empCtx.user,
      membership: empCtx.membership,
      company: empCtx.company,
      effectiveStatus: empCtx.effectiveStatus,
    };
    const download = await getPayslipPdfDownload(companyCtx, payslip.payrollPeriodId, payslip.id, await requestMeta());

    return new Response(new Uint8Array(download.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${download.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const { status, body } = toApiError(error);
    return NextResponse.json(body, { status });
  }
}
