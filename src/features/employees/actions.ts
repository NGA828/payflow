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
import {
  createEmployee,
  setEmployeeStatus,
  terminateEmployee,
  updateEmployee,
  updatePaymentDetails,
} from "@/server/services/employee.service";
import {
  employeeFormSchema,
  paymentDetailsSchema,
  terminateEmployeeSchema,
} from "@/validations/employee";

function errorState(error: unknown): FormState {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
  }
  throw error;
}

/** Creates an employee record, then lands on its profile page. */
export async function createEmployeeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = employeeFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  let created: { id: string; employeeCode: string };
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.EMPLOYEES_MANAGE);
    assertCompanyWritable(ctx);
    created = await createEmployee(ctx, parsed.data, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/employees");
  redirect(`/employees/${created.id}?created=1`);
}

export async function updateEmployeeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = employeeFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  const employeeId = String(formData.get("employeeId") ?? "");
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.EMPLOYEES_MANAGE);
    assertCompanyWritable(ctx);
    await updateEmployee(ctx, employeeId, parsed.data, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  return { status: "success", message: "Employee record updated." };
}

export async function updatePaymentDetailsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = paymentDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  const employeeId = String(formData.get("employeeId") ?? "");
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.EMPLOYEES_MANAGE);
    assertCompanyWritable(ctx);
    await updatePaymentDetails(ctx, employeeId, parsed.data, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/employees");
  return { status: "success", message: "Payment details saved securely." };
}

export async function setEmployeeStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const employeeId = String(formData.get("employeeId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "ACTIVE" && status !== "INACTIVE") {
    return { status: "error", message: "Unsupported status change." };
  }
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.EMPLOYEES_MANAGE);
    assertCompanyWritable(ctx);
    await setEmployeeStatus(ctx, employeeId, status, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  return {
    status: "success",
    message: status === "INACTIVE" ? "Employee deactivated." : "Employee reactivated.",
  };
}

export async function terminateEmployeeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = terminateEmployeeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  const employeeId = String(formData.get("employeeId") ?? "");
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.EMPLOYEES_MANAGE);
    assertCompanyWritable(ctx);
    await terminateEmployee(ctx, employeeId, parsed.data.terminationDate, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  return { status: "success", message: "Employment ended. The record stays for payroll history." };
}
