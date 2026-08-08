"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import { zodFieldErrors, type FormState } from "@/lib/form-state";
import {
  assertCompanyWritable,
  requireCompanyPermission,
} from "@/server/tenant/context";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { createPeriod, deletePeriod } from "@/server/services/payroll-period.service";
import { createPeriodSchema } from "@/validations/payroll";

function errorState(error: unknown): FormState {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
  }
  throw error;
}

export async function createPeriodAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createPeriodSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  let created: { id: string; name: string };
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.PAYROLL_PERIODS_MANAGE);
    assertCompanyWritable(ctx);
    created = await createPeriod(ctx, parsed.data, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/payroll");
  redirect(`/payroll/${created.id}?created=1`);
}

export async function deletePeriodAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const periodId = String(formData.get("periodId") ?? "");
  let deleted: { name: string };
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.PAYROLL_PERIODS_MANAGE);
    assertCompanyWritable(ctx);
    deleted = await deletePeriod(ctx, periodId, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/payroll");
  revalidatePath(`/payroll/${periodId}`);
  return { status: "success", message: `Period “${deleted.name}” deleted.` };
}
