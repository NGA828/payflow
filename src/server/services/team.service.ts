import type { Invitation, Membership, Role, User } from "@prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/security/audit";
import type { CompanyContext } from "@/server/tenant/context";
import { assertCompanyWritable } from "@/server/tenant/status";
import { inviteTeamMembers } from "@/server/services/invitation.service";
import type { InvitableRole } from "@/validations/team";

interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ── Pure admin-policy guards (unit-tested) ──────────────────────────

/** Admins cannot act on their own membership (self-lockout protection). */
export function assertNotSelf(actorUserId: string, targetUserId: string): void {
  if (actorUserId === targetUserId) {
    throw new AppError(
      "BAD_REQUEST",
      "You can't change your own membership. Ask another Company Admin.",
    );
  }
}

/**
 * Removing the last ACTIVE Company Admin (demote or disable) would orphan the
 * workspace. Allowed once a second active admin exists.
 */
export function wouldRemoveLastAdmin(
  targetCurrentRole: Role,
  becomesAdmin: boolean,
  activeCompanyAdmins: number,
): boolean {
  return targetCurrentRole === "COMPANY_ADMIN" && !becomesAdmin && activeCompanyAdmins <= 1;
}

// ── Read model ──────────────────────────────────────────────────────

export type MemberWithUser = Membership & { user: User; invitedBy: User | null };

export interface TeamInvitationItem {
  id: string;
  email: string;
  role: Role;
  invitedByName: string;
  createdAt: Date;
  expiresAt: Date;
  status: "PENDING" | "EXPIRED";
}

export interface TeamRoster {
  members: MemberWithUser[];
  invitations: TeamInvitationItem[];
}

/** Members (all membership statuses) + open invitations, company-scoped. */
export async function listTeam(companyId: string): Promise<TeamRoster> {
  const db = getDb();
  const [members, invitations] = await Promise.all([
    db.membership.findMany({
      where: { companyId },
      include: { user: true, invitedBy: true },
      orderBy: [{ status: "asc" }, { joinedAt: "asc" }],
    }),
    db.invitation.findMany({
      where: { companyId, acceptedAt: null, revokedAt: null },
      include: { invitedBy: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const now = Date.now();
  return {
    members,
    invitations: invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      invitedByName: inv.invitedBy.fullName,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      status: inv.expiresAt.getTime() < now ? "EXPIRED" : "PENDING",
    })),
  };
}

async function activeAdminCount(companyId: string): Promise<number> {
  return getDb().membership.count({
    where: { companyId, role: "COMPANY_ADMIN", status: "ACTIVE" },
  });
}

// ── Membership mutations ────────────────────────────────────────────

/** Reassigns a member's staff role. Policies: not self, last-admin safe. */
export async function changeMemberRole(
  ctx: CompanyContext,
  membershipId: string,
  newRole: InvitableRole,
  meta: RequestMeta = {},
): Promise<{ changed: boolean }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const target = await db.membership.findFirst({
    where: { id: membershipId, companyId: ctx.company.id },
    include: { user: true },
  });
  if (!target) throw new AppError("NOT_FOUND", "Member not found.");
  if (target.status === "DISABLED") {
    throw new AppError(
      "BAD_REQUEST",
      "Re-enable this membership before changing its role.",
    );
  }

  assertNotSelf(ctx.user.id, target.userId);
  if (target.role === newRole) return { changed: false };

  const admins = await activeAdminCount(ctx.company.id);
  if (wouldRemoveLastAdmin(target.role, newRole === "COMPANY_ADMIN", admins)) {
    throw new AppError(
      "CONFLICT",
      "Every workspace needs at least one active Company Admin. Promote someone else first.",
    );
  }

  await db.membership.update({ where: { id: target.id }, data: { role: newRole } });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "team.role_changed",
    entityType: "Membership",
    entityId: target.id,
    metadata: { targetEmail: target.user.email, from: target.role, to: newRole },
    ...meta,
  });
  return { changed: true };
}

/** Disables (revokes access) or re-enables a membership. */
export async function setMembershipStatus(
  ctx: CompanyContext,
  membershipId: string,
  action: "disable" | "enable",
  meta: RequestMeta = {},
): Promise<{ changed: boolean }> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const target = await db.membership.findFirst({
    where: { id: membershipId, companyId: ctx.company.id },
    include: { user: true },
  });
  if (!target) throw new AppError("NOT_FOUND", "Member not found.");

  if (action === "disable") {
    assertNotSelf(ctx.user.id, target.userId);
    if (target.status === "DISABLED") return { changed: false };

    const admins = await activeAdminCount(ctx.company.id);
    if (wouldRemoveLastAdmin(target.role, false, admins)) {
      throw new AppError(
        "CONFLICT",
        "Every workspace needs at least one active Company Admin. Promote someone else first.",
      );
    }

    await db.membership.update({ where: { id: target.id }, data: { status: "DISABLED" } });
    await audit({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      action: "team.membership_status_changed",
      entityType: "Membership",
      entityId: target.id,
      metadata: { targetEmail: target.user.email, from: target.status, to: "DISABLED" },
      ...meta,
    });
    return { changed: true };
  }

  if (target.status === "ACTIVE") return { changed: false };
  await db.membership.update({ where: { id: target.id }, data: { status: "ACTIVE" } });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "team.membership_status_changed",
    entityType: "Membership",
    entityId: target.id,
    metadata: { targetEmail: target.user.email, from: target.status, to: "ACTIVE" },
    ...meta,
  });
  return { changed: true };
}

// ── Invitation management ───────────────────────────────────────────

function loadOpenInvitation(
  invitation: Invitation | null,
): asserts invitation is Invitation {
  if (!invitation) throw new AppError("NOT_FOUND", "Invitation not found.");
}

/** Revokes an open (pending or expired) invitation. Idempotent-tolerant. */
export async function revokeInvitation(
  ctx: CompanyContext,
  invitationId: string,
  meta: RequestMeta = {},
): Promise<void> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const invitation = await db.invitation.findFirst({
    where: { id: invitationId, companyId: ctx.company.id },
  });
  loadOpenInvitation(invitation);
  if (invitation.revokedAt) return;
  if (invitation.acceptedAt) {
    throw new AppError("BAD_REQUEST", "This invitation was already accepted.");
  }

  await db.invitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "team.invite_revoked",
    entityType: "Invitation",
    entityId: invitation.id,
    metadata: { email: invitation.email, role: invitation.role },
    ...meta,
  });
}

/**
 * Re-issues an open invitation (fresh token + 7 days, old link revoked).
 * Works for pending AND expired invitations.
 */
export async function resendInvitation(
  ctx: CompanyContext,
  invitationId: string,
  meta: RequestMeta = {},
): Promise<void> {
  assertCompanyWritable(ctx);
  const db = getDb();
  const invitation = await db.invitation.findFirst({
    where: { id: invitationId, companyId: ctx.company.id },
  });
  loadOpenInvitation(invitation);
  if (invitation.acceptedAt) {
    throw new AppError("BAD_REQUEST", "This invitation was already accepted.");
  }
  if (invitation.revokedAt) {
    throw new AppError(
      "BAD_REQUEST",
      "This invitation was revoked. Send a fresh invite instead.",
    );
  }

  // inviteTeamMembers revokes-and-replaces pending tokens for the same email.
  await inviteTeamMembers(ctx, [invitation.email], invitation.role as InvitableRole, meta);
}