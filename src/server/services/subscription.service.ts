import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import type { CompanyContext } from "@/server/tenant/context";
import { computeEffectiveStatus } from "@/server/tenant/status";
import { audit } from "@/server/security/audit";

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function getCompanySubscription(companyId: string) {
  const db = getDb();
  const sub = await db.subscription.findUnique({
    where: { companyId },
    include: { plan: true },
  });
  if (!sub) return null;
  const company = await db.company.findUnique({ where: { id: companyId } });
  if (!company) return null;
  return {
    id: sub.id,
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    plan: sub.plan,
    companyStatus: company.status,
    effectiveStatus: computeEffectiveStatus(company),
    trialEndsAtCompany: company.trialEndsAt,
  };
}

export async function listPlans() {
  return getDb().subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { priceMonthly: "asc" },
  });
}

export async function activatePlan(
  ctx: CompanyContext,
  planCode: string,
  meta: RequestMeta = {},
) {
  const db = getDb();
  const plan = await db.subscriptionPlan.findUnique({ where: { code: planCode } });
  if (!plan) throw new AppError("NOT_FOUND", "Plan not found.");

  const company = await db.company.findUnique({ where: { id: ctx.company.id } });
  if (!company) throw new AppError("NOT_FOUND", "Company not found.");

  // Mock billing: flip to ACTIVE, set period end 30 days from now, clear trial
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60_000);

  await db.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { companyId: ctx.company.id },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
      },
      create: {
        companyId: ctx.company.id,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodEnd: periodEnd,
      },
    });
    // If company was READ_ONLY or TRIAL, bring to ACTIVE
    if (company.status !== "ACTIVE") {
      await tx.company.update({
        where: { id: ctx.company.id },
        data: { status: "ACTIVE", trialEndsAt: null },
      });
    }
  });

  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "subscription.state_changed",
    entityType: "Subscription",
    entityId: ctx.company.id,
    metadata: { plan: plan.code, status: "ACTIVE", periodEnd: periodEnd.toISOString() },
    ...meta,
  });

  return { planCode: plan.code, status: "ACTIVE" as const, periodEnd };
}

export function isCompanyWritable(effectiveStatus: string): boolean {
  return effectiveStatus !== "READ_ONLY" && effectiveStatus !== "SUSPENDED";
}
