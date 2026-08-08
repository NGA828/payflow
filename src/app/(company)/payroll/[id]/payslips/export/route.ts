import { NextResponse } from "next/server";
import { toApiError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getPeriodPayslipZip } from "@/server/services/payslip.service";

export const dynamic = "force-dynamic";

/**
 * GET /payroll/[id]/payslips/export — ZIP with one branded PDF per non-VOID
 * payslip of the period. Audited as `payslip.generated`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.PAYSLIPS_DOWNLOAD);
    const { id } = await params;
    const download = await getPeriodPayslipZip(ctx, id, await requestMeta());
    return new Response(new Uint8Array(download.zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${download.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const { status, body } = toApiError(error);
    return NextResponse.json(body, { status });
  }
}
