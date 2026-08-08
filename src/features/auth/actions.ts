"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut, auth } from "@/server/auth";
import { audit } from "@/server/security/audit";
import { assertWithinRateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/form";
import { safeRedirectPath, zodFieldErrors, type FormState } from "@/lib/form-state";
import {
  forgotPasswordSchema,
  loginSchema,
  registerCompanySchema,
  resendVerificationSchema,
  resetPasswordSchema,
} from "@/validations/auth";
import {
  registerCompany,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
} from "@/server/services/onboarding.service";
import { AppError } from "@/server/errors";

export type AuthFormState = FormState;

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const { email, password, next } = parsed.data;
  const meta = await requestMeta();

  try {
    assertWithinRateLimit(`login:${meta.ipAddress ?? "?"}:${email}`, 5, 15 * 60_000);
  } catch (error) {
    if (error instanceof AppError) return { status: "error", message: error.message };
    throw error;
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      await audit({
        action: "auth.login_failed",
        entityType: "User",
        metadata: { email },
        ...meta,
      });
      return { status: "error", message: "Invalid email or password." };
    }
    throw error;
  }

  await audit({ action: "auth.login", metadata: { email }, ...meta });

  // Super admins have no company workspace; they land on the dashboard gate
  // screen until the platform admin area ships (/admin).
  redirect(safeRedirectPath(next) ?? "/dashboard");
}

export async function logoutAction(): Promise<void> {
  const session = await auth();
  const meta = await requestMeta();
  if (session?.user?.id) {
    await audit({ userId: session.user.id, action: "auth.logout", ...meta });
  }
  await signOut({ redirectTo: "/login" });
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerCompanySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const meta = await requestMeta();

  try {
    assertWithinRateLimit(`register:${meta.ipAddress ?? "?"}`, 10, 60 * 60_000);
    await registerCompany(parsed.data, meta);
  } catch (error) {
    if (error instanceof AppError) {
      return { status: "error", message: error.message, fieldErrors: error.fieldErrors };
    }
    throw error;
  }

  redirect(`/verify-email?sent=1&email=${encodeURIComponent(parsed.data.email)}`);
}

export async function resendVerificationAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resendVerificationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const meta = await requestMeta();

  try {
    assertWithinRateLimit(`resend:${meta.ipAddress ?? "?"}:${parsed.data.email}`, 3, 15 * 60_000);
  } catch (error) {
    if (error instanceof AppError) return { status: "error", message: error.message };
    throw error;
  }

  await resendVerificationEmail(parsed.data.email);
  return {
    status: "success",
    message: "If the account exists and is unverified, a new link is on its way.",
  };
}

export async function requestResetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const meta = await requestMeta();

  try {
    assertWithinRateLimit(`reset:${meta.ipAddress ?? "?"}:${parsed.data.email}`, 3, 15 * 60_000);
    await requestPasswordReset(parsed.data.email, meta);
  } catch (error) {
    if (error instanceof AppError) return { status: "error", message: error.message };
    throw error;
  }

  // Always succeed to avoid leaking which emails are registered.
  return { status: "success", message: "If that email is registered, a reset link is on its way." };
}

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const meta = await requestMeta();

  try {
    await resetPassword(parsed.data.token, parsed.data.password, meta);
  } catch (error) {
    if (error instanceof AppError) return { status: "error", message: error.message };
    throw error;
  }

  redirect("/login?reset=success");
}
