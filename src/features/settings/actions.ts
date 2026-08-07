"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import { zodFieldErrors, type FormState } from "@/lib/form-state";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission, assertCompanyWritable } from "@/server/tenant/context";
import { updateCompanyInfo, updatePayrollSettings } from "@/server/services/company.service";
import { companyInfoSchema, payrollSettingsSchema } from "@/validations/company";

/** Settings page edits — same rules as the wizard, without advancing steps. */

export async function updateCompanyProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = companyInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.COMPANY_MANAGE_SETTINGS);
    assertCompanyWritable(ctx);
    await updateCompanyInfo(ctx, parsed.data, await requestMeta());
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
    }
    throw error;
  }
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { status: "success", message: "Company profile updated." };
}

export async function updatePayrollConfigAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = payrollSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.COMPANY_MANAGE_SETTINGS);
    assertCompanyWritable(ctx);
    await updatePayrollSettings(ctx, parsed.data, await requestMeta());
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
    }
    throw error;
  }
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { status: "success", message: "Payroll settings updated." };
}
