import crypto from "node:crypto";
import { getEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/security/audit";
import { passwordSchema, hashPassword } from "@/server/auth/password";
import { generateToken, hashToken, TOKEN_TTLS } from "@/server/auth/tokens";
import { sendEmail } from "@/server/email";
import { passwordResetEmail, verificationEmail } from "@/server/email/templates";
import type { RegisterCompanyInput } from "@/validations/auth";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "company";
}

/**
 * Company registration: User + Company + COMPANY_ADMIN membership + trial
 * subscription, atomically. Then an email verification token is issued.
 */
export async function registerCompany(
  input: RegisterCompanyInput,
  requestMeta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<{ userId: string; companyId: string }> {
  const db = getDb();

  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(
      "CONFLICT",
      "An account with this email already exists. Try signing in instead.",
      { email: ["Email is already registered"] },
    );
  }

  const plan = await db.subscriptionPlan.findUnique({ where: { code: "starter" } });
  if (!plan) throw new AppError("INTERNAL", "Default plan is missing. Run db:seed.");

  const passwordHash = await hashPassword(input.password);
  const trialEndsAt = new Date(Date.now() + plan.trialDays * 24 * 60 * 60_000);
  const slug = `${slugify(input.companyName)}-${crypto.randomBytes(3).toString("hex")}`;

  const { user, company } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.email, fullName: input.fullName, passwordHash },
    });
    const company = await tx.company.create({
      data: { name: input.companyName, slug, trialEndsAt },
    });
    await tx.membership.create({
      data: {
        userId: user.id,
        companyId: company.id,
        role: "COMPANY_ADMIN",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
    await tx.subscription.create({
      data: {
        companyId: company.id,
        planId: plan.id,
        status: "TRIALING",
        trialEndsAt,
      },
    });
    return { user, company };
  });

  // Verification token + email
  const token = generateToken();
  await db.authToken.create({
    data: {
      userId: user.id,
      type: "EMAIL_VERIFICATION",
      tokenHash: token.hash,
      expiresAt: new Date(Date.now() + TOKEN_TTLS.EMAIL_VERIFICATION_MS),
    },
  });
  const url = `${getEnv().APP_URL}/verify-email?token=${token.raw}`;
  const message = verificationEmail(user.fullName, url);
  await sendEmail({ to: user.email, ...message });

  await audit({
    companyId: company.id,
    userId: user.id,
    action: "auth.register",
    entityType: "User",
    entityId: user.id,
    ...requestMeta,
  });
  await audit({
    companyId: company.id,
    userId: user.id,
    action: "company.created",
    entityType: "Company",
    entityId: company.id,
    ...requestMeta,
  });

  return { userId: user.id, companyId: company.id };
}

export type VerifyEmailResult = "verified" | "already_verified" | "invalid_or_expired";

/** Consumes an email-verification token and marks the user as verified. */
export async function verifyEmailToken(
  rawToken: string,
  requestMeta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<VerifyEmailResult> {
  const db = getDb();
  const token = await db.authToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });

  if (!token || token.type !== "EMAIL_VERIFICATION") return "invalid_or_expired";
  if (token.expiresAt.getTime() < Date.now()) return "invalid_or_expired";

  if (token.consumedAt) {
    return token.user.emailVerifiedAt ? "already_verified" : "invalid_or_expired";
  }

  await db.$transaction(async (tx) => {
    await tx.authToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });
    await tx.user.update({
      where: { id: token.userId },
      data: { emailVerifiedAt: new Date() },
    });
  });

  await audit({
    userId: token.userId,
    action: "auth.email_verified",
    entityType: "User",
    entityId: token.userId,
    ...requestMeta,
  });

  return "verified";
}

/** Issues a fresh verification email if the account exists and is unverified. */
export async function resendVerificationEmail(email: string): Promise<void> {
  const db = getDb();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.emailVerifiedAt) return; // stay silent — no account enumeration

  const token = generateToken();
  await db.authToken.create({
    data: {
      userId: user.id,
      type: "EMAIL_VERIFICATION",
      tokenHash: token.hash,
      expiresAt: new Date(Date.now() + TOKEN_TTLS.EMAIL_VERIFICATION_MS),
    },
  });
  const url = `${getEnv().APP_URL}/verify-email?token=${token.raw}`;
  const message = verificationEmail(user.fullName, url);
  await sendEmail({ to: user.email, ...message });
}

/** Starts a password reset. Always succeeds from the caller's perspective. */
export async function requestPasswordReset(
  email: string,
  requestMeta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const db = getDb();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;

  const token = generateToken();
  await db.authToken.create({
    data: {
      userId: user.id,
      type: "PASSWORD_RESET",
      tokenHash: token.hash,
      expiresAt: new Date(Date.now() + TOKEN_TTLS.PASSWORD_RESET_MS),
    },
  });
  const url = `${getEnv().APP_URL}/reset-password?token=${token.raw}`;
  const message = passwordResetEmail(user.fullName, url);
  await sendEmail({ to: user.email, ...message });

  await audit({
    userId: user.id,
    action: "auth.password_reset_requested",
    entityType: "User",
    entityId: user.id,
    ...requestMeta,
  });
}

/** Read-only check used to decide which screen the reset page renders. */
export async function isPasswordResetTokenValid(rawToken: string): Promise<boolean> {
  const token = await getDb().authToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  return Boolean(
    token &&
      token.type === "PASSWORD_RESET" &&
      !token.consumedAt &&
      token.expiresAt.getTime() > Date.now(),
  );
}

/** Consumes a reset token and sets a new password. */
export async function resetPassword(
  rawToken: string,
  newPassword: string,
  requestMeta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    throw new AppError("VALIDATION", "Password does not meet the requirements.", {
      password: parsed.error.issues.map((i) => i.message),
    });
  }

  const db = getDb();
  const token = await db.authToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  if (
    !token ||
    token.type !== "PASSWORD_RESET" ||
    token.consumedAt ||
    token.expiresAt.getTime() < Date.now()
  ) {
    throw new AppError(
      "BAD_REQUEST",
      "This reset link is invalid or has expired. Request a new one.",
    );
  }

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.authToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });
    await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
  });

  await audit({
    userId: token.userId,
    action: "auth.password_reset_completed",
    entityType: "User",
    entityId: token.userId,
    ...requestMeta,
  });
}
