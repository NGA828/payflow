import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Circle,
  PartyPopper,
  Rocket,
  Users,
  Wallet,
} from "lucide-react";
import { getDb } from "@/lib/db";
import { requireCompanyContext } from "@/server/tenant/context";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const ctx = await requireCompanyContext();
  const { setup: setupParam } = await searchParams;
  const db = getDb();

  const [departments, employees, periods, teamMembers, recentAudit] = await Promise.all([
    db.department.count({ where: { companyId: ctx.company.id, status: "ACTIVE" } }),
    db.employee.count({ where: { companyId: ctx.company.id, status: "ACTIVE" } }),
    db.payrollPeriod.count({ where: { companyId: ctx.company.id } }),
    db.membership.count({ where: { companyId: ctx.company.id, status: "ACTIVE" } }),
    db.auditLog.findMany({
      where: { companyId: ctx.company.id },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const setup = [
    { label: "Company registered", done: true },
    { label: "Complete company setup", done: Boolean(ctx.company.setupCompletedAt), href: "/setup" },
    { label: "Create departments & positions", done: departments > 0, href: "/organization" },
    { label: "Add your first employee", done: employees > 0, href: "/employees" },
    { label: "Invite your team", done: teamMembers > 1, href: "/team" },
    { label: "Run your first payroll", done: periods > 0, href: "/payroll" },
  ];
  const setupDone = setup.filter((item) => item.done).length;
  const canManageSettings = hasPermission(
    ctx.membership.role,
    PERMISSIONS.COMPANY_MANAGE_SETTINGS,
  );
  const showSetupBanner = !ctx.company.setupCompletedAt && canManageSettings;

  const kpis = [
    { label: "Active employees", value: employees, icon: Users, tint: "bg-indigo-50 text-primary-600" },
    { label: "Departments", value: departments, icon: Building2, tint: "bg-info-tint text-info" },
    { label: "Payroll periods", value: periods, icon: CalendarCheck, tint: "bg-warning-tint text-warning" },
    { label: "Team members", value: teamMembers, icon: Wallet, tint: "bg-teal-50 text-teal-600" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Good to see you, {ctx.user.fullName.split(" ")[0]}</h1>
        <p className="mt-1 text-[13px] text-muted">
          Here&apos;s where {ctx.company.name} stands today.
        </p>
      </div>

      {setupParam === "done" && (
        <div className="flex items-center gap-3 rounded-xl border border-[#A7F3D0] bg-success-tint px-4 py-3.5 text-[13.5px] text-[#065F46]">
          <PartyPopper className="h-4.5 w-4.5 shrink-0" />
          <span>
            <strong className="font-semibold">Setup complete.</strong> Your workspace is ready —
            add employees and departments to prepare your first payroll.
          </span>
        </div>
      )}

      {showSetupBanner && (
        <div className="brand-gradient relative overflow-hidden rounded-2xl p-[1px] shadow-pop">
          <div className="flex flex-col gap-4 rounded-[15px] bg-white/97 px-5 py-4.5 sm:flex-row sm:items-center">
            <span className="brand-gradient grid h-10 w-10 shrink-0 place-items-center rounded-xl shadow-sm">
              <Rocket className="h-5 w-5 text-white" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-ink">
                Finish setting up {ctx.company.name}
              </p>
              <p className="mt-0.5 text-[12.5px] text-body">
                Step {Math.min(ctx.company.setupStep, 5)} of 5 — confirm payroll settings and
                invite your team to unlock the full workspace.
              </p>
            </div>
            <Link
              href="/setup"
              className="brand-gradient inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-92"
            >
              Continue setup <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="text-[12.5px] font-medium text-muted">{kpi.label}</p>
                  <p className="tnum mt-1.5 text-[26px] font-bold text-ink">{kpi.value}</p>
                </div>
                <span className={cn("grid h-9 w-9 place-items-center rounded-lg", kpi.tint)}>
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Getting started</CardTitle>
              <CardDescription>
                {setupDone} of {setup.length} steps complete
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="brand-gradient h-full rounded-full transition-all"
                style={{ width: `${Math.round((setupDone / setup.length) * 100)}%` }}
              />
            </div>
            <ul className="flex flex-col">
              {setup.map((item) => {
                const inner = (
                  <>
                    {item.done ? (
                      <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-success" />
                    ) : (
                      <Circle className="h-[18px] w-[18px] shrink-0 text-slate-300" />
                    )}
                    <span className={cn("text-[13.5px]", item.done ? "text-muted line-through" : "font-medium text-ink")}>
                      {item.label}
                    </span>
                    {!item.done && <ArrowRight className="ml-auto h-4 w-4 text-muted" />}
                  </>
                );
                return (
                  <li key={item.label}>
                    {item.href && !item.done ? (
                      <Link href={item.href} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-canvas">
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-2 py-2">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Latest events in this workspace</CardDescription>
            </div>
            <Link href="/audit-log" className="text-[12.5px] font-semibold text-primary-600 hover:text-primary-700">
              View all
            </Link>
          </CardHeader>
          <CardContent className="pt-3">
            {recentAudit.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">No activity yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100">
                {recentAudit.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {entry.action.replaceAll(".", " · ")}
                      </p>
                      {entry.entityType && (
                        <p className="text-xs text-muted">
                          {entry.entityType}
                        </p>
                      )}
                    </div>
                    <time className="tnum shrink-0 text-xs text-muted">
                      {formatDateTime(entry.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
