import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanActions, CreatePlanForm } from "./client";

export const metadata: Metadata = { title: "Plans" };
export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const db = getDb();
  const plans = await db.subscriptionPlan.findMany({ orderBy: { priceMonthly: "asc" } });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Subscription plans</h1>
          <p className="mt-1 text-[13px] text-muted">{plans.length} plans · mock billing for MVP</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{plan.name}</CardTitle>
                <Badge variant={plan.isActive ? "teal" : "grey"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-[12px] text-muted">Code: {plan.code}</p>
              <p className="tnum text-[20px] font-bold text-ink">{plan.priceMonthly.toString()} XAF<span className="text-[11px] font-medium text-muted"> /mo</span></p>
              <p className="text-[12px] text-muted">Up to {plan.maxEmployees} employees · {plan.trialDays} day trial</p>
              <div className="pt-2"><PlanActions plan={plan} /></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Create / update plan</CardTitle></CardHeader>
        <CardContent>
          <CreatePlanForm />
        </CardContent>
      </Card>
    </div>
  );
}
