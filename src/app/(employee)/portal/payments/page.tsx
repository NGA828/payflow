import type { Metadata } from "next";
import { requireEmployeeContext } from "@/server/tenant/employee-context";
import { listMyPayments } from "@/server/services/employee-portal.service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Payment History" };
export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "amber" | "teal" | "red" | "grey"> = {
  PENDING: "amber",
  SUCCESSFUL: "teal",
  FAILED: "red",
};

export default async function PortalPaymentsPage() {
  const ctx = await requireEmployeeContext();
  const payments = await listMyPayments(ctx);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Payment history</h1>
        <p className="mt-1 text-[13px] text-muted">{payments.length === 0 ? "No payments recorded yet." : `${payments.length} payroll payments`}</p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[.06em] text-muted uppercase">
                <th className="py-2.5 pr-4 pl-5">Period</th>
                <th className="px-4 py-2.5">Pay date</th>
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Paid at</th>
                <th className="px-4 py-2.5">Reference</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-canvas/60">
                  <td className="py-3 pr-4 pl-5 text-[13px] font-semibold text-ink">{p.periodName}</td>
                  <td className="tnum px-4 py-3 text-[13px] text-body">{formatDate(p.payDate)}</td>
                  <td className="px-4 py-3 text-[13px] text-body">{p.method}</td>
                  <td className="tnum px-4 py-3 text-right text-[13px] font-bold text-ink">{formatMoney(p.amount)}</td>
                  <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[p.status] ?? "grey"} dot>{p.status}</Badge></td>
                  <td className="tnum px-4 py-3 text-[13px] text-body">{p.paidAt ? formatDate(p.paidAt) : "—"}</td>
                  <td className="tnum px-4 py-3 text-[12.5px] text-body">{p.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {payments.length === 0 && (
          <CardContent className="py-8 text-center">
            <p className="text-[13px] text-muted">No payments yet — they appear after your company approves payroll and records payments.</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
