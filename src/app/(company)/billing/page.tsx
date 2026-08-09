import type { Metadata } from "next";
import { AppError } from "@/server/errors";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission } from "@/server/tenant/context";
import { getCompanySubscription, listPlans } from "@/server/services/subscription.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { BillingActions } from "./client";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

function ForbiddenScreen() {
  return (
    <div className="mx-auto max-w-lg pt-16 text-center">
      <Card><CardContent className="py-8">
        <h1 className="text-lg font-bold text-ink">Billing is restricted</h1>
        <p className="mt-2 text-[13px] text-body">Your role does not include billing access.</p>
      </CardContent></Card>
    </div>
  );
}

export default async function BillingPage() {
  let ctx;
  try {
    ctx = await requireCompanyPermission(PERMISSIONS.BILLING_MANAGE);
  } catch (error) {
    if (error instanceof AppError) return <ForbiddenScreen />;
    throw error;
  }

  const [subscription, plans] = await Promise.all([
    getCompanySubscription(ctx.company.id),
    listPlans(),
  ]);

  const isTrial = ctx.effectiveStatus === "TRIAL";
  const isReadOnly = ctx.effectiveStatus === "READ_ONLY";
  const trialDaysLeft = ctx.company.trialEndsAt
    ? Math.max(0, Math.ceil((ctx.company.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60_000)))
    : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Billing & subscription</h1>
        <p className="mt-1 text-[13px] text-muted">Manage your PayFlow plan — mock billing (no real charge) for MVP</p>
      </div>

      {isTrial && trialDaysLeft !== null && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <span>⏳ Trial: {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left until {ctx.company.trialEndsAt ? formatDate(ctx.company.trialEndsAt) : "expiry"} — activate a plan to stay writable.</span>
        </div>
      )}
      {isReadOnly && (
        <div className="flex items-center gap-2.5 rounded-xl border border-[#FEF3C7] bg-warning-tint px-4 py-3 text-[13px] text-[#92400E]">
          <span>🔒 Read-only: your trial ended. You can view data, but mutations are blocked until a plan is activated. Activate below to restore full access.</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Current status</CardTitle>
            <CardDescription>{ctx.company.name}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted">Company status</span>
              <Badge variant={ctx.effectiveStatus === "ACTIVE" ? "teal" : ctx.effectiveStatus === "TRIAL" ? "amber" : ctx.effectiveStatus === "READ_ONLY" ? "amber" : "red"} dot>{ctx.effectiveStatus}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted">Subscription</span>
              <Badge variant={subscription?.status === "ACTIVE" ? "teal" : subscription?.status === "TRIALING" ? "amber" : "grey"}>{subscription?.status ?? "NONE"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted">Plan</span>
              <span className="text-[13px] font-semibold text-ink">{subscription?.plan.name ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted">Trial ends</span>
              <span className="text-[13px] text-ink">{subscription?.trialEndsAt ? formatDate(subscription.trialEndsAt) : ctx.company.trialEndsAt ? formatDate(ctx.company.trialEndsAt) : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted">Period end</span>
              <span className="text-[13px] text-ink">{subscription?.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Activate a plan (mock)</CardTitle>
            <CardDescription>No real charge — flips company to ACTIVE for demo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {plans.map((plan) => (
                <div key={plan.id} className="rounded-xl border border-border bg-white p-4">
                  <p className="text-[13px] font-bold text-ink">{plan.name}</p>
                  <p className="mt-1 text-[11px] text-muted">Up to {plan.maxEmployees} employees</p>
                  <p className="tnum mt-2 text-[18px] font-bold text-ink">{plan.priceMonthly.toString()} XAF<span className="text-[11px] font-medium text-muted"> /mo</span></p>
                  <p className="mt-1 text-[11px] text-muted">{plan.trialDays} day trial included</p>
                  <div className="mt-3">
                    <BillingActions planCode={plan.code} current={subscription?.plan.code === plan.code && subscription?.status === "ACTIVE"} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How trial & read-only works</CardTitle>
        </CardHeader>
        <CardContent className="text-[13px] leading-relaxed text-body">
          <ul className="list-disc pl-5">
            <li>New companies start on the Starter plan in TRIALING status for {plans[0]?.trialDays ?? 14} days.</li>
            <li>After trial expiry, <code className="rounded bg-slate-100 px-1">computeEffectiveStatus()</code> returns READ_ONLY — the banner appears and <code>assertCompanyWritable()</code> blocks all mutations while reads continue.</li>
            <li>Activating any plan (mock) flips company to ACTIVE and subscription to ACTIVE with a 30-day period — the only write allowed in READ_ONLY via billing permission.</li>
            <li>SUSPENDED is set by super admin — full block, shows suspension screen.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
