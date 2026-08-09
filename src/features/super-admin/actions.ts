"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import type { FormState } from "@/lib/form-state";
import { requireSuperAdmin } from "@/server/tenant/context";
import { getDb } from "@/lib/db";
import { audit } from "@/server/security/audit";
import { z } from "zod";

function errorState(error: unknown): FormState {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
  }
  throw error;
}

export async function suspendCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const companyId = String(formData.get("companyId") ?? "");
  try {
    const user = await requireSuperAdmin();
    const db = getDb();
    await db.company.update({ where: { id: companyId }, data: { status: "SUSPENDED" } });
    await audit({
      companyId,
      userId: user.id,
      action: "admin.company_suspended",
      entityType: "Company",
      entityId: companyId,
      ...(await requestMeta()),
    });
  } catch (e) {
    return errorState(e);
  }
  revalidatePath("/admin/companies");
  revalidatePath(`/admin/companies/${companyId}`);
  return { status: "success", message: "Company suspended." };
}

export async function reactivateCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const companyId = String(formData.get("companyId") ?? "");
  try {
    const user = await requireSuperAdmin();
    const db = getDb();
    await db.company.update({ where: { id: companyId }, data: { status: "ACTIVE" } });
    await audit({
      companyId,
      userId: user.id,
      action: "admin.company_reactivated",
      entityType: "Company",
      entityId: companyId,
      ...(await requestMeta()),
    });
  } catch (e) {
    return errorState(e);
  }
  revalidatePath("/admin/companies");
  revalidatePath(`/admin/companies/${companyId}`);
  return { status: "success", message: "Company reactivated to ACTIVE." };
}

const planSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  maxEmployees: z.coerce.number().int().min(1),
  priceMonthly: z.coerce.number().min(0),
  trialDays: z.coerce.number().int().min(1).max(365),
});

export async function upsertPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Invalid plan data." };
  }
  try {
    await requireSuperAdmin();
    const db = getDb();
    await db.subscriptionPlan.upsert({
      where: { code: parsed.data.code },
      update: {
        name: parsed.data.name,
        maxEmployees: parsed.data.maxEmployees,
        priceMonthly: parsed.data.priceMonthly,
        trialDays: parsed.data.trialDays,
        isActive: true,
      },
      create: {
        code: parsed.data.code,
        name: parsed.data.name,
        maxEmployees: parsed.data.maxEmployees,
        priceMonthly: parsed.data.priceMonthly,
        trialDays: parsed.data.trialDays,
        isActive: true,
      },
    });
  } catch (e) {
    return errorState(e);
  }
  revalidatePath("/admin/plans");
  revalidatePath("/admin");
  return { status: "success", message: "Plan saved." };
}

export async function togglePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const planId = String(formData.get("planId") ?? "");
  try {
    await requireSuperAdmin();
    const db = getDb();
    const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError("NOT_FOUND", "Plan not found.");
    await db.subscriptionPlan.update({ where: { id: planId }, data: { isActive: !plan.isActive } });
  } catch (e) {
    return errorState(e);
  }
  revalidatePath("/admin/plans");
  return { status: "success", message: "Plan toggled." };
}
