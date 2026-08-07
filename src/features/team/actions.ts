"use server";

import { redirect } from "next/navigation";
import { AppError } from "@/server/errors";
import { requestMeta } from "@/server/form";
import { zodFieldErrors, type FormState } from "@/lib/form-state";
import { requireUser } from "@/server/tenant/context";
import {
  acceptInvitationAsExistingUser,
  acceptInvitationAsNewUser,
} from "@/server/services/invitation.service";
import {
  acceptInviteExistingUserSchema,
  acceptInviteNewUserSchema,
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
