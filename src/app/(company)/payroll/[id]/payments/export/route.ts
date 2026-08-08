import { NextResponse } from "next/server";
import { toApiError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { buildPaymentsExport } from "@/server/services/payment.service";

export const dynamic = "force-dynamic";

/**
 * GET /payroll/[id]/payments/export — the payment instruction CSV. Payment
 * destinations are decrypted server-side here (never exposed elsewhere).
 * Requires payments.export → employees/HR get a JSON 403.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.PAYMENTS_EXPORT);
    const { id } = await params;
    const exported = await buildPaymentsExport(ctx, id, await requestMeta());
    return new Response(exported.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const { status, body } = toApiError(error);
    return NextResponse.json(body, { status });
  }
}
