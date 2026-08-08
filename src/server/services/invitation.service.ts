import type { Role } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import { roleLabel } from "@/lib/roles";
import { AppError } from "@/server/errors";
import { hashPassword, passwordSchema } from "@/server/auth/password";
import { generateToken, hashToken, TOKEN_TTLS } from "@/server/auth/tokens";
import { sendEmail } from "@/server/email";
import { invitationEmail } from "@/server/email/templates";
import { audit } from "@/server/security/audit";
import { computeEffectiveStatus } from "@/server/tenant/status";
import type { CompanyContext } from "@/server/tenant/context";
import type { InvitableRole } from "@/validations/team";

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface InviteBatchResult {
  invited: string[];
  resent: string[];
}

/**
 * Creates single-use, hashed invitation tokens (7-day expiry) and emails the
 * acceptance links. A pending invitation for the same email is revoked and
 * replaced (counts as a resend). Inviting someone who already holds a
 * membership raises CONFLICT listing every offending email.
 */
export async function inviteTeamMembers(
  ctx: CompanyContext,
  emails: string[],
  role: InvitableRole,
  meta: RequestMeta = {},
): Promise<InviteBatchResult> {
  const db = getDb();
  const uniqueEmails = [...new Set(emails.map((e) => e.toLowerCase().trim()))];
  if (uniqueEmails.length === 0) {
    throw new AppError("VALIDATION", "Add at least one email address.", {
      emails: ["Add at least one email address"],
    });
  }

  // Block emails already linked to this workspace through a membership.
  const users = await db.user.findMany({
    where: { email: { in: uniqueEmails } },
    select: {
      email: true,
      memberships: { where: { companyId: ctx.company.id }, select: { status: true } },
    },
  });
  const conflicts = users
    .filter((u) => u.memberships.length > 0)
    .map((u) => `${u.email} is already linked to this workspace`);
  if (conflicts.length > 0) {
    throw new AppError("CONFLICT", "Some people cannot be invited.", { emails: conflicts });
  }

  // Existing pending invitations for these emails get replaced (resent).
  const pending = await db.invitation.findMany({
    where: {
      companyId: ctx.company.id,
      email: { in: uniqueEmails },
      acceptedAt: null,
      revokedAt: null,
    },
  });
  const resendSet = new Set(pending.map((i) => i.email));

  const expiresAt = new Date(Date.now() + TOKEN_TTLS.INVITATION_MS);
  const baseUrl = getEnv().APP_URL;
  const result: InviteBatchResult = { invited: [], resent: [] };

  for (const email of uniqueEmails) {
    const token = generateToken();
    await db.$transaction(async (tx) => {
      // Revoke any pending invitation for this email before issuing a fresh one.
      await tx.invitation.updateMany({
        where: { companyId: ctx.company.id, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.invitation.create({
        data: {
          companyId: ctx.company.id,
          email,
          role,
          tokenHash: token.hash,
          invitedById: ctx.user.id,
          expiresAt,
        },
      });
    });

    const url = `${baseUrl}/invite/${token.raw}`;
    const message = invitationEmail({
      inviterName: ctx.user.fullName,
      companyName: ctx.company.name,
      roleLabel: roleLabel(role),
      url,
    });
    await sendEmail({ to: email, ...message });

    const resent = resendSet.has(email);
    if (resent) result.resent.push(email);
    else result.invited.push(email);

    await audit({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      action: resent ? "team.invite_resent" : "team.invited",
      entityType: "Invitation",
      metadata: { email, role },
      ...meta,
    });
  }

  return result;
}

export type InvitationView =
  | { status: "invalid" }
  | {
      status: "valid";
      email: string;
      role: Role;
      companyName: string;
      inviterName: string;
      /** True when the invited email already has a PayFlow account. */
      userExists: boolean;
    };

/** Read-only lookup used by the acceptance page. Raw token, never the hash. */
export async function getInvitationView(rawToken: string): Promise<InvitationView> {
  const db = getDb();
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { company: true, invitedBy: true },
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt.getTime() < Date.now()
  ) {
    return { status: "invalid" };
  }
  const user = await db.user.findUnique({ where: { email: invitation.email } });
  return {
    status: "valid",
    email: invitation.email,
    role: invitation.role,
    companyName: invitation.company.name,
    inviterName: invitation.invitedBy.fullName,
    userExists: Boolean(user),
  };
}

/** Loads a still-valid invitation or throws BAD_REQUEST. */
async function loadValidInvitation(rawToken: string) {
  const db = getDb();
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { company: true },
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt.getTime() < Date.now()
  ) {
    throw new AppError(
      "BAD_REQUEST",
      "This invitation is invalid, was already used, or has expired. Ask your administrator for a new one.",
    );
  }
  const effective = computeEffectiveStatus(invitation.company);
  if (effective === "SUSPENDED") {
    throw new AppError(
      "SUSPENDED",
      "This workspace is currently suspended. Contact PayFlow support.",
    );
  }
  return invitation;
}

/**
 * Brand-new user: creates the account (email considered verified — the invite
 * link proved possession) plus the ACTIVE membership, and consumes the token.
 */
export async function acceptInvitationAsNewUser(
  rawToken: string,
  fullName: string,
  password: string,
  meta: RequestMeta = {},
): Promise<{ userId: string }> {
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) {
    throw new AppError("VALIDATION", "Password does not meet the requirements.", {
      password: pw.error.issues.map((i) => i.message),
    });
  }

  const db = getDb();
  const invitation = await loadValidInvitation(rawToken);

  const existing = await db.user.findUnique({ where: { email: invitation.email } });
  if (existing) {
    throw new AppError(
      "CONFLICT",
      "An account with this email already exists. Sign in to accept the invitation.",
    );
  }

  const passwordHash = await hashPassword(password);
  const user = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: invitation.email,
        fullName,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
    });
    await tx.membership.create({
      data: {
        userId: user.id,
        companyId: invitation.companyId,
        role: invitation.role,
        status: "ACTIVE",
        invitedById: invitation.invitedById,
        joinedAt: new Date(),
      },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    return user;
  });

  await audit({
    companyId: invitation.companyId,
    userId: user.id,
    action: "team.invite_accepted",
    entityType: "Invitation",
    entityId: invitation.id,
    metadata: { email: invitation.email, role: invitation.role, newAccount: true },
    ...meta,
  });

  return { userId: user.id };
}

/**
 * Existing signed-in user: links their account to the company. The session
 * email must match the invitation email.
 */
export async function acceptInvitationAsExistingUser(
  rawToken: string,
  userId: string,
  meta: RequestMeta = {},
): Promise<void> {
  const db = getDb();
  const invitation = await loadValidInvitation(rawToken);

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("UNAUTHENTICATED", "You must be signed in to continue.");
  if (user.email !== invitation.email) {
    throw new AppError(
      "FORBIDDEN",
      `This invitation was sent to ${invitation.email}. Sign in with that account to accept it.`,
    );
  }

  await db.$transaction(async (tx) => {
    const existing = await tx.membership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId: invitation.companyId } },
    });
    if (existing) {
      if (existing.status !== "ACTIVE") {
        throw new AppError(
          "FORBIDDEN",
          "Your membership in this workspace is not active. Contact your administrator.",
        );
      }
    } else {
      await tx.membership.create({
        data: {
          userId: user.id,
          companyId: invitation.companyId,
          role: invitation.role,
          status: "ACTIVE",
          invitedById: invitation.invitedById,
          joinedAt: new Date(),
        },
      });
    }
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
  });

  await audit({
    companyId: invitation.companyId,
    userId: user.id,
    action: "team.invite_accepted",
    entityType: "Invitation",
    entityId: invitation.id,
    metadata: { email: invitation.email, role: invitation.role, newAccount: false },
    ...meta,
  });
}
