"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import { zodFieldErrors, type FormState } from "@/lib/form-state";
import {
  assertCompanyWritable,
  requireCompanyPermission,
  requireUser,
} from "@/server/tenant/context";
import { PERMISSIONS } from "@/server/rbac/permissions";
import {
  acceptInvitationAsExistingUser,
  acceptInvitationAsNewUser,
  inviteTeamMembers,
} from "@/server/services/invitation.service";
import {
  changeMemberRole,
  resendInvitation,
  revokeInvitation,
  setMembershipStatus,
} from "@/server/services/team.service";
import {
  acceptInviteExistingUserSchema,
  acceptInviteNewUserSchema,
  changeRoleSchema,
  inviteMemberSchema,
} from "@/validations/team";

/** Signed-out invitee creating their account from the invitation link. */
export async function acceptInviteNewUserAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = acceptInviteNewUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  try {
    await acceptInvitationAsNewUser(
      parsed.data.token,
      parsed.data.fullName,
      parsed.data.password,
      await requestMeta(),
    );
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
    }
    throw error;
  }
  redirect("/login?invited=1");
}

/** Signed-in user accepting an invitation sent to their own email. */
export async function acceptInviteExistingUserAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = acceptInviteExistingUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  try {
    const user = await requireUser();
    await acceptInvitationAsExistingUser(parsed.data.token, user.id, await requestMeta());
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
    }
    throw error;
  }
  redirect("/dashboard");
}

// ── Team management (/team) ─────────────────────────────────────────

function errorState(error: unknown): FormState {
  if (error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
  }
  throw error;
}

/** Sends one invitation from the /team dialog. */
export async function inviteMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = inviteMemberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  let resent: boolean;
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.TEAM_INVITE);
    assertCompanyWritable(ctx);
    const meta = await requestMeta();
    const result = await inviteTeamMembers(ctx, [parsed.data.email], parsed.data.role, meta);
    resent = result.resent.length > 0;
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/team");
  return {
    status: "success",
    message: resent
      ? `A fresh invitation link is on its way to ${parsed.data.email}.`
      : `Invitation sent to ${parsed.data.email}.`,
  };
}

export async function resendInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const invitationId = String(formData.get("invitationId") ?? "");
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.TEAM_INVITE);
    assertCompanyWritable(ctx);
    await resendInvitation(ctx, invitationId, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/team");
  return { status: "success", message: "Invitation re-sent with a fresh 7-day link." };
}

export async function revokeInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const invitationId = String(formData.get("invitationId") ?? "");
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.TEAM_MANAGE);
    assertCompanyWritable(ctx);
    await revokeInvitation(ctx, invitationId, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/team");
  return { status: "success", message: "Invitation revoked — the link no longer works." };
}

export async function changeMemberRoleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const membershipId = String(formData.get("membershipId") ?? "");
  const parsed = changeRoleSchema.safeParse({ role: formData.get("role") });
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.TEAM_MANAGE);
    assertCompanyWritable(ctx);
    await changeMemberRole(ctx, membershipId, parsed.data.role, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/team");
  return { status: "success", message: "Role updated." };
}

export async function setMembershipStatusAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const membershipId = String(formData.get("membershipId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  if (intent !== "disable" && intent !== "enable") {
    return { status: "error", message: "Unknown action." };
  }
  try {
    const ctx = await requireCompanyPermission(PERMISSIONS.TEAM_MANAGE);
    assertCompanyWritable(ctx);
    await setMembershipStatus(ctx, membershipId, intent, await requestMeta());
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/team");
  return {
    status: "success",
    message: intent === "disable" ? "Access disabled — they can no longer open the workspace." : "Access re-enabled.",
  };
}
