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
import {
  createAdjustment,
  deleteAdjustment,
  updateAdjustment,
} from "@/server/services/adjustment.service";
import { createPeriodSchema } from "@/validations/payroll";
import { adjustmentFormSchema } from "@/validations/adjustment";

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

// ── Adjustments (/payroll/[id]/adjustments) ─────────────────────────

export async function createAdjustmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const payrollPeriodId = String(formData.get("payrollPeriodId") ?? "");
  try {
    const parsed = adjustmentFormSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

    const ctx = await requireCompanyPermission(PERMISSIONS.PAYROLL_ADJUST);
    assertCompanyWritable(ctx);
    await createAdjustment(ctx, payrollPeriodId, parsed.data, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(`/payroll/${payrollPeriodId}`);
  revalidatePath(`/payroll/${payrollPeriodId}/adjustments`);
  return { status: "success", message: "Adjustment added to this period." };
}

export async function updateAdjustmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const payrollPeriodId = String(formData.get("payrollPeriodId") ?? "");
  const adjustmentId = String(formData.get("adjustmentId") ?? "");
  try {
    const parsed = adjustmentFormSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

    const ctx = await requireCompanyPermission(PERMISSIONS.PAYROLL_ADJUST);
    assertCompanyWritable(ctx);
    await updateAdjustment(ctx, adjustmentId, parsed.data, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(`/payroll/${payrollPeriodId}`);
  revalidatePath(`/payroll/${payrollPeriodId}/adjustments`);
  return { status: "success", message: "Adjustment updated." };
}

export async function deleteAdjustmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const payrollPeriodId = String(formData.get("payrollPeriodId") ?? "");
  const adjustmentId = String(formData.get("adjustmentId") ?? "");
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.PAYROLL_ADJUST);
    assertCompanyWritable(ctx);
    await deleteAdjustment(ctx, adjustmentId, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(`/payroll/${payrollPeriodId}`);
  revalidatePath(`/payroll/${payrollPeriodId}/adjustments`);
  return { status: "success", message: "Adjustment removed." };
}
