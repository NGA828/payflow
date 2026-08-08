"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import { zodFieldErrors, type FormState } from "@/lib/form-state";
import { PERMISSIONS } from "@/server/rbac/permissions";
import {
  assertCompanyWritable,
  requireCompanyPermission,
  type CompanyContext,
} from "@/server/tenant/context";
import {
  createDepartment,
  createPosition,
  removeDepartment,
  removePosition,
  restoreDepartment,
  restorePosition,
  updateDepartment,
  updatePosition,
} from "@/server/services/org.service";
import { departmentFormSchema, positionFormSchema } from "@/validations/org";

function errorState(error: unknown): FormState {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
  }
  throw error;
}

async function orgContext(): Promise<CompanyContext> {
  const ctx = await requireCompanyPermission(PERMISSIONS.ORG_MANAGE);
  assertCompanyWritable(ctx);
  return ctx;
}

const orgPath = "/organization";
const deptPath = (id: string) => `${orgPath}/departments/${id}`;

// ── Departments ─────────────────────────────────────────────────────

export async function createDepartmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = departmentFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  try {
    const ctx = await orgContext();
    await createDepartment(ctx, parsed.data, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(orgPath);
  revalidatePath("/dashboard");
  return { status: "success", message: `Department “${parsed.data.name}” created.` };
}

export async function updateDepartmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const departmentId = String(formData.get("departmentId") ?? "");
  const parsed = departmentFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  try {
    const ctx = await orgContext();
    await updateDepartment(ctx, departmentId, parsed.data, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(orgPath);
  revalidatePath(deptPath(departmentId));
  return { status: "success", message: "Department updated." };
}

export async function removeDepartmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const departmentId = String(formData.get("departmentId") ?? "");
  const fromDetail = formData.get("fromDetail") === "1";

  let outcome: "deleted" | "archived";
  try {
    const ctx = await orgContext();
    outcome = await removeDepartment(ctx, departmentId, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(orgPath);
  revalidatePath("/dashboard");
  if (fromDetail) redirect(orgPath);
  return {
    status: "success",
    message:
      outcome === "archived"
        ? "Department archived — employees keep their history, and it no longer appears in pickers."
        : "Department deleted.",
  };
}

export async function restoreDepartmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const departmentId = String(formData.get("departmentId") ?? "");
  try {
    const ctx = await orgContext();
    await restoreDepartment(ctx, departmentId, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(orgPath);
  revalidatePath(deptPath(departmentId));
  return { status: "success", message: "Department restored." };
}

// ── Positions ───────────────────────────────────────────────────────

export async function createPositionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const departmentId = String(formData.get("departmentId") ?? "");
  const parsed = positionFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  try {
    const ctx = await orgContext();
    await createPosition(ctx, departmentId, parsed.data, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(orgPath);
  revalidatePath(deptPath(departmentId));
  return { status: "success", message: `Position “${parsed.data.title}” created.` };
}

export async function updatePositionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const positionId = String(formData.get("positionId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const parsed = positionFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  try {
    const ctx = await orgContext();
    await updatePosition(ctx, positionId, parsed.data, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(deptPath(departmentId));
  return { status: "success", message: "Position updated." };
}

export async function removePositionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const positionId = String(formData.get("positionId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");

  let outcome: "deleted" | "archived";
  try {
    const ctx = await orgContext();
    outcome = await removePosition(ctx, positionId, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(deptPath(departmentId));
  revalidatePath(orgPath);
  return {
    status: "success",
    message:
      outcome === "archived"
        ? "Position archived — employees keep their history, and it no longer appears in pickers."
        : "Position deleted.",
  };
}

export async function restorePositionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const positionId = String(formData.get("positionId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  try {
    const ctx = await orgContext();
    await restorePosition(ctx, positionId, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(deptPath(departmentId));
  return { status: "success", message: "Position restored." };
}
