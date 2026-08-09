import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Admin Dashboard" };
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const db = getDb();
  const [
    totalCompanies,
    trialCompanies,
    activeCompanies,
    readOnlyCompanies,
    suspendedCompanies,
    totalUsers,
    totalEmployees,
    recentCompanies,
    plans,
  ] = await Promise.all([
    db.company.count(),
    db.company.count({ where: { status: "TRIAL" } }),
    db.company.count({ where: { status: "ACTIVE" } }),
    db.company.count({ where: { status: "READ_ONLY" } }),
    db.company.count({ where: { status: "SUSPENDED" } }),
    db.user.count(),
    db.employee.count(),
    db.company.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { id: true, name: true, status: true, createdAt: true, trialEndsAt: true } }),
    db.subscriptionPlan.findMany({ orderBy: { priceMonthly: "asc" } }),
  ]);

  const kpis = [
    { label: "Companies", value: totalCompanies },
    { label: "Trial", value: trialCompanies },
    { label: "Active", value: activeCompanies },
    { label: "Read-only", value: readOnlyCompanies },
    { label: "Suspended", value: suspendedCompanies },
    { label: "Users", value: totalUsers },
    { label: "Employees", value: totalEmployees },
    { label: "Plans", value: plans.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Platform dashboard</h1>
        <p className="mt-1 text-[13px] text-muted">Overview of PayFlow platform — company health, trials, suspensions</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="py-4">
              <p className="text-[11px] font-semibold tracking-[.06em] text-muted uppercase">{k.label}</p>
              <p className="tnum mt-1 text-[22px] font-bold text-ink">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent companies</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <ul className="divide-y divide-slate-100">
              {recentCompanies.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">{c.name}</p>
                    <p className="text-[11.5px] text-muted">{c.status} · created {formatDate(c.createdAt)}</p>
                  </div>
                  <a href={`/admin/companies/${c.id}`} className="text-[12px] font-medium text-primary-600 hover:underline">View</a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plans</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <ul className="divide-y divide-slate-100">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{p.name} ({p.code})</p>
                    <p className="text-[11.5px] text-muted">{p.maxEmployees} employees · {p.priceMonthly.toString()} XAF/mo</p>
                  </div>
                  <span className={`text-[11px] ${p.isActive ? "text-teal-700" : "text-muted"}`}>{p.isActive ? "Active" : "Inactive"}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
