import { NextResponse } from "next/server";
import { toApiError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getPayslipPdfDownload } from "@/server/services/payslip.service";

export const dynamic = "force-dynamic";

/**
 * GET /payroll/[id]/payslips/[payslipId]/download — branded payslip PDF.
 * Rendered on demand from stored payslip columns + current adjustments
 * (no pdfUrl persistence — the render is deterministic). Downloads are
 * audit-logged; staff roles only (employees use the portal flow).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; payslipId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.PAYSLIPS_DOWNLOAD);
    const { id, payslipId } = await params;
    const download = await getPayslipPdfDownload(ctx, id, payslipId, await requestMeta());
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
