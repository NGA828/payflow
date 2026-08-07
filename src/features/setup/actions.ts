"use server";

import { redirect } from "next/navigation";
import { AppError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import { zodFieldErrors, type FormState } from "@/lib/form-state";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { requireCompanyPermission, assertCompanyWritable } from "@/server/tenant/context";
import { updateCompanyInfo, updatePayrollSettings } from "@/server/services/company.service";
import { createInitialDepartments } from "@/server/services/org.service";
import { inviteTeamMembers } from "@/server/services/invitation.service";
import { advanceSetupStep, completeSetup } from "@/server/services/setup.service";
import { companyInfoSchema, orgBasicsSchema, payrollSettingsSchema } from "@/validations/company";
import { inviteTeamSchema } from "@/validations/team";

function errorState(error: unknown): FormState {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
  }
  throw error;
}

export async function saveCompanyInfoStep(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = companyInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.COMPANY_MANAGE_SETTINGS);
    assertCompanyWritable(ctx);
    await updateCompanyInfo(ctx, parsed.data, await requestMeta());
    await advanceSetupStep(ctx, 1);
  } catch (error) {
    return errorState(error);
  }
  redirect("/setup?step=2");
}

export async function savePayrollSettingsStep(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = payrollSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.COMPANY_MANAGE_SETTINGS);
    assertCompanyWritable(ctx);
    await updatePayrollSettings(ctx, parsed.data, await requestMeta());
    await advanceSetupStep(ctx, 2);
  } catch (error) {
    return errorState(error);
  }
  redirect("/setup?step=3");
}

const isSkip = (formData: FormData) => formData.get("skip") === "1";

export async function saveOrgBasicsStep(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.COMPANY_MANAGE_SETTINGS);
    assertCompanyWritable(ctx);

    if (!isSkip(formData)) {
      const names = formData
        .getAll("department")
        .map((v) => String(v).trim())
        .filter((v) => v.length > 0);
      if (names.length > 0) {
        const parsed = orgBasicsSchema.safeParse({ departments: names });
        if (!parsed.success) {
          return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
        }
        await createInitialDepartments(ctx, parsed.data.departments, await requestMeta());
      }
    }
    await advanceSetupStep(ctx, 3);
  } catch (error) {
    return errorState(error);
  }
  redirect("/setup?step=4");
}

export async function saveInvitesStep(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.COMPANY_MANAGE_SETTINGS);
    assertCompanyWritable(ctx);

    if (!isSkip(formData)) {
      const emails = formData
        .getAll("email")
        .map((v) => String(v).trim())
        .filter((v) => v.length > 0);
      if (emails.length > 0) {
        const parsed = inviteTeamSchema.safeParse({
          emails,
          role: formData.get("role"),
        });
        if (!parsed.success) {
          return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
        }
        const meta = await requestMeta();
        await inviteTeamMembers(ctx, parsed.data.emails, parsed.data.role, meta);
      }
    }
    await advanceSetupStep(ctx, 4);
  } catch (error) {
    return errorState(error);
  }
  redirect("/setup?step=5");
}

export async function finishSetupAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.COMPANY_MANAGE_SETTINGS);
    assertCompanyWritable(ctx);
    await completeSetup(ctx, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  redirect("/dashboard?setup=done");
}
