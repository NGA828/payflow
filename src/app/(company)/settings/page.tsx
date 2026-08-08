import type { Metadata } from "next";
import { Building2, CalendarCheck, Info } from "lucide-react";
import { AppError } from "@/server/errors";
import { PERMISSIONS, hasPermission } from "@/server/rbac/permissions";
import { requireCompanyContext } from "@/server/tenant/context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ProfileSettingsForm, PayrollConfigForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function taxRateToPercent(taxRate: unknown): string {
  const n = Number(taxRate);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 10_000) / 100);
}

const STATUS_BADGES: Record<string, { variant: "amber" | "green" | "red" | "grey"; label: string }> = {
  TRIAL: { variant: "amber", label: "Trial" },
  ACTIVE: { variant: "green", label: "Active" },
  SUSPENDED: { variant: "red", label: "Suspended" },
  READ_ONLY: { variant: "grey", label: "Read-only" },
};

export default async function SettingsPage() {
  let ctx;
  try {
    ctx = await requireCompanyContext();
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
  if (!hasPermission(ctx.membership.role, PERMISSIONS.COMPANY_MANAGE_SETTINGS)) {
    return (
      <div className="mx-auto max-w-lg pt-16 text-center">
        <Card>
          <CardContent className="py-8">
            <h1 className="text-lg font-bold text-ink">Admins manage settings</h1>
            <p className="mt-2 text-[13px] text-body">
              Only a Company Admin can change workspace settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const subscription = await getDb().subscription.findUnique({
    where: { companyId: ctx.company.id },
    include: { plan: true },
  });
  const statusBadge = STATUS_BADGES[ctx.effectiveStatus] ?? STATUS_BADGES.READ_ONLY;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Settings</h1>
        <p className="mt-1 text-[13px] text-muted">
          Workspace configuration for {ctx.company.name}. Changes apply immediately and are
          audited.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-primary-600">
              <Building2 className="h-4 w-4" />
            </span>
            <div>
              <CardTitle>Company profile</CardTitle>
              <CardDescription>Legal details printed on payslips and reports.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProfileSettingsForm
            defaults={{
              name: ctx.company.name,
              country: ctx.company.country,
              address: ctx.company.address ?? "",
              taxId: ctx.company.taxId ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-teal-600">
              <CalendarCheck className="h-4 w-4" />
            </span>
            <div>
              <CardTitle>Payroll configuration</CardTitle>
              <CardDescription>How the payroll engine prices hours, overtime and tax.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <PayrollConfigForm
            defaults={{
              payrollFrequency: ctx.company.payrollFrequency,
              standardHoursPerWeek: String(Number(ctx.company.standardHoursPerWeek)),
              overtimeMultiplier: String(Number(ctx.company.overtimeMultiplier)),
              taxRatePercent: taxRateToPercent(ctx.company.taxRate),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-body">
              <Info className="h-4 w-4" />
            </span>
            <div>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>Subscription and workspace status.</CardDescription>
            </div>
          </div>
          <Badge variant={statusBadge?.variant ?? "grey"} dot>
            {statusBadge?.label ?? ctx.effectiveStatus}
          </Badge>
        </CardHeader>
        <CardContent className="pt-3">
          <dl className="grid gap-4 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Plan</dt>
              <dd className="mt-1 font-semibold text-ink">{subscription?.plan.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Subscription</dt>
              <dd className="mt-1 font-semibold text-ink">{subscription?.status ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">
                {ctx.effectiveStatus === "TRIAL" ? "Trial ends" : "Created"}
              </dt>
              <dd className="tnum mt-1 font-semibold text-ink">
                {ctx.effectiveStatus === "TRIAL" && ctx.company.trialEndsAt
                  ? formatDate(ctx.company.trialEndsAt)
                  : formatDate(ctx.company.createdAt)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
