import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { requireEmployeeContext } from "@/server/tenant/employee-context";
import { listMyPayslips } from "@/server/services/employee-portal.service";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "My Payslips" };
export const dynamic = "force-dynamic";

export default async function PortalPayslipsPage() {
  const ctx = await requireEmployeeContext();
  const payslips = await listMyPayslips(ctx);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-ink">My payslips</h1>
        <p className="mt-1 text-[13px] text-muted">{payslips.length === 0 ? "No approved payslips yet." : `${payslips.length} approved payslip${payslips.length === 1 ? "" : "s"}`}</p>
      </div>

      {payslips.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-indigo-50"><FileText className="h-5 w-5 text-primary-600" /></span>
            <p className="text-[14px] font-semibold text-ink">No payslips yet</p>
            <p className="mt-1 max-w-sm text-[12.5px] text-body">Your payroll admin will notify you once your payslips are approved.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                  <th className="py-2.5 pr-4 pl-5">Period</th>
                  <th className="px-4 py-2.5">Payslip №</th>
                  <th className="px-4 py-2.5">Pay date</th>
                  <th className="px-4 py-2.5 text-right">Gross</th>
                  <th className="px-4 py-2.5 text-right">Deductions</th>
                  <th className="px-4 py-2.5 text-right">Net</th>
                  <th className="py-2.5 pr-5 pl-4 text-right">Download</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((ps) => (
                  <tr key={ps.id} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                    <td className="py-3 pr-4 pl-5">
                      <p className="text-[13.5px] font-semibold text-ink">{ps.periodName}</p>
                    </td>
                    <td className="tnum px-4 py-3 text-[12.5px] text-body">{ps.payslipNumber}</td>
                    <td className="tnum px-4 py-3 text-[13px] text-body">{formatDate(ps.payDate)}</td>
                    <td className="tnum px-4 py-3 text-right text-[13px] text-body">{formatMoney(ps.gross)}</td>
                    <td className="tnum px-4 py-3 text-right text-[13px] text-danger">−{formatMoney(ps.deductions)}</td>
                    <td className="tnum px-4 py-3 text-right text-[13px] font-bold text-teal-700">{formatMoney(ps.net)}</td>
                    <td className="py-3 pr-5 pl-4 text-right">
                      <Link href={`/portal/payslips/${ps.id}/download`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                        <Download className="h-3.5 w-3.5" /> PDF
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
