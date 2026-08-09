"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import type { FormState } from "@/lib/form-state";
import { requireCompanyPermission } from "@/server/tenant/context";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { activatePlan } from "@/server/services/subscription.service";
import { z } from "zod";

const planSchema = z.object({
  planCode: z.string().min(1),
});

function errorState(error: unknown): FormState {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
  }
  throw error;
}

export async function activatePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Select a valid plan." };
  }
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.BILLING_MANAGE);
    // Billing is allowed even in READ_ONLY (the sole exception that restores writability)
    // If SUSPENDED, still blocked — suspension is admin-only.
    if (ctx.effectiveStatus === "SUSPENDED") {
      throw new AppError("SUSPENDED", "Workspace is suspended — contact support.");
    }
    await activatePlan(ctx, parsed.data.planCode, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/billing");
  revalidatePath("/dashboard");
  return { status: "success", message: "Plan activated — workspace is now ACTIVE." };
}
