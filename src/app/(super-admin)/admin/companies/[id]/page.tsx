import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/format";
import { SuspendActions } from "./client";

export const metadata: Metadata = { title: "Company detail" };
export const dynamic = "force-dynamic";

export default async function AdminCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const company = await db.company.findUnique({
    where: { id },
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { employees: true, memberships: true, payrollPeriods: true, payslips: true } },
      memberships: { include: { user: { select: { fullName: true, email: true } } }, take: 10, orderBy: { createdAt: "asc" } },
    },
  });
  if (!company) notFound();

  const periods = await db.payrollPeriod.findMany({
    where: { companyId: company.id },
    orderBy: { startDate: "desc" },
    take: 8,
    select: { id: true, name: true, status: true, totalNet: true, startDate: true },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{company.name}</h1>
          <p className="mt-1 text-[13px] text-muted">{company.id} · created {formatDate(company.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={company.status === "ACTIVE" ? "teal" : company.status === "TRIAL" ? "amber" : company.status === "SUSPENDED" ? "red" : "amber"} dot>{company.status}</Badge>
          <SuspendActions companyId={company.id} status={company.status} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Subscription</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex justify-between text-[13px]"><span className="text-muted">Plan</span><span className="font-semibold text-ink">{company.subscription?.plan.name ?? "—"} ({company.subscription?.plan.code ?? "—"})</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-muted">Sub status</span><Badge variant="grey">{company.subscription?.status ?? "NONE"}</Badge></div>
            <div className="flex justify-between text-[13px]"><span className="text-muted">Trial ends</span><span>{company.trialEndsAt ? formatDate(company.trialEndsAt) : "—"}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-muted">Period end</span><span>{company.subscription?.currentPeriodEnd ? formatDate(company.subscription.currentPeriodEnd) : "—"}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-muted">Country</span><span>{company.country}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-muted">Currency</span><span>{company.currency}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Stats</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex justify-between text-[13px]"><span className="text-muted">Employees</span><span className="font-semibold">{company._count.employees}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-muted">Team members</span><span className="font-semibold">{company._count.memberships}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-muted">Payroll periods</span><span className="font-semibold">{company._count.payrollPeriods}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-muted">Payslips</span><span className="font-semibold">{company._count.payslips}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-muted">Address</span><span className="truncate">{company.address ?? "—"}</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-muted">Tax ID</span><span>{company.taxId ?? "—"}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Members (first 10)</CardTitle></CardHeader>
          <CardContent className="pt-3">
            <ul className="divide-y divide-slate-100">
              {company.memberships.map((m) => (
                <li key={m.id} className="py-2">
                  <p className="text-[13px] font-medium text-ink">{m.user.fullName}</p>
                  <p className="text-[11.5px] text-muted">{m.user.email} · {m.role} · {m.status}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent payroll periods</CardTitle></CardHeader>
        <CardContent className="pt-3">
          {periods.length === 0 ? <p className="py-4 text-center text-[13px] text-muted">No payroll periods</p> : (
            <ul className="divide-y divide-slate-100">
              {periods.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{p.name}</p>
                    <p className="text-[11.5px] text-muted">{p.status} · {formatDate(p.startDate)} · {p.totalNet ? formatMoney(p.totalNet.toString()) : "—"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
