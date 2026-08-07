/**
 * Integration test for team management & admin policies against a real DB.
 * Enable with: RUN_DB_TESTS=1 npm test
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { getDb, disposeDb } from "@/lib/db";
import { registerCompany } from "@/server/services/onboarding.service";
import {
  acceptInvitationAsNewUser,
  getInvitationView,
  inviteTeamMembers,
} from "@/server/services/invitation.service";
import {
  changeMemberRole,
  listTeam,
  resendInvitation,
  revokeInvitation,
  setMembershipStatus,
} from "@/server/services/team.service";
import type { CompanyContext } from "@/server/tenant/context";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("team management (integration)", () => {
  const prisma = getDb();
  const run = Date.now();
  const companyIds: string[] = [];
  const userIds: string[] = [];

  let companyId = "";
  let ownerId = "";
  let secondId = ""; // second user who joins as HR_MANAGER first
  let ownerMembershipId = "";
  let secondMembershipId = "";

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await disposeDb();
  });

  async function ctx(targetCompanyId: string, asUserId?: string): Promise<CompanyContext> {
    const [company, membership] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: targetCompanyId } }),
      prisma.membership.findFirstOrThrow({
        where: { companyId: targetCompanyId, ...(asUserId ? { userId: asUserId } : {}) },
      }),
    ]);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: membership.userId } });
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isSuperAdmin: false,
        emailVerifiedAt: user.emailVerifiedAt,
      },
      membership: { id: membership.id, role: membership.role as Role, status: membership.status },
      company,
      effectiveStatus: "TRIAL",
    };
  }

  it("runs the full path: owner registers, invites, second user accepts", async () => {
    const reg = await registerCompany({
      fullName: "Owner Admin",
      email: `team-${run}-owner@team.test`,
      companyName: "Team Test SARL",
      password: "Secure#Pass23",
    });
    companyId = reg.companyId;
    ownerId = reg.userId;
    companyIds.push(companyId);
    userIds.push(ownerId);

    const ownerCtx = await ctx(companyId);
    await inviteTeamMembers(ownerCtx, [`team-${run}-hr@team.test`], "HR_MANAGER");

    const accepted = await acceptInvitationAsNewUser(
      // swap in a known raw token (the emailed one is hashed at rest)
      await (async () => {
        const invite = await prisma.invitation.findFirstOrThrow({
          where: { companyId, email: `team-${run}-hr@team.test` },
        });
        const { generateToken } = await import("@/server/auth/tokens");
        const known = generateToken();
        await prisma.invitation.update({
          where: { id: invite.id },
          data: { tokenHash: known.hash },
        });
        return known.raw;
      })(),
      "Second User",
      "Second#Pass23",
    );
    secondId = accepted.userId;
    userIds.push(secondId);

    const memberships = await prisma.membership.findMany({ where: { companyId } });
    ownerMembershipId = memberships.find((m) => m.userId === ownerId)!.id;
    secondMembershipId = memberships.find((m) => m.userId === secondId)!.id;

    const roster = await listTeam(companyId);
    expect(roster.members).toHaveLength(2);
    expect(roster.invitations).toHaveLength(0); // accepted → no longer open
  });

  it("role changes: policies + audit + last-admin guard", async () => {
    const ownerCtx = await ctx(companyId, ownerId);

    // last-admin guard: owner cannot demote THEMSELVES (self rule first)
    await expect(
      changeMemberRole(ownerCtx, ownerMembershipId, "HR_MANAGER"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // promote second user to admin
    const promoted = await changeMemberRole(ownerCtx, secondMembershipId, "COMPANY_ADMIN");
    expect(promoted.changed).toBe(true);

    // now owner CAN be demoted by the second admin (2 admins exist)
    const secondCtx = await ctx(companyId, secondId);
    await changeMemberRole(secondCtx, ownerMembershipId, "ACCOUNTANT");
    expect(
      (await prisma.membership.findUniqueOrThrow({ where: { id: ownerMembershipId } })).role,
    ).toBe("ACCOUNTANT");

    // second user is now the sole admin: demoting them must fail
    await expect(
      changeMemberRole(await ctx(companyId, ownerId), secondMembershipId, "HR_MANAGER"),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // audit trail
    const entry = await prisma.auditLog.findFirst({
      where: { companyId, action: "team.role_changed" },
    });
    expect(entry).not.toBeNull();
    expect(entry?.metadata).toMatchObject({ from: "HR_MANAGER", to: "COMPANY_ADMIN" });
  });

  it("disable/enable membership with safeguards", async () => {
    const secondCtx = await ctx(companyId, secondId);

    // self-disable is blocked
    await expect(
      setMembershipStatus(secondCtx, secondMembershipId, "disable"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // disable the (non-admin) owner — allowed since second is admin
    const result = await setMembershipStatus(secondCtx, ownerMembershipId, "disable");
    expect(result.changed).toBe(true);
    expect(
      (await prisma.membership.findUniqueOrThrow({ where: { id: ownerMembershipId } })).status,
    ).toBe("DISABLED");

    // idempotent
    expect((await setMembershipStatus(secondCtx, ownerMembershipId, "disable")).changed).toBe(false);

    // cannot change a disabled member's role
    await expect(
      changeMemberRole(secondCtx, ownerMembershipId, "HR_MANAGER"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // re-enable
    await setMembershipStatus(secondCtx, ownerMembershipId, "enable");
    expect(
      (await prisma.membership.findUniqueOrThrow({ where: { id: ownerMembershipId } })).status,
    ).toBe("ACTIVE");

    const entry = await prisma.auditLog.findFirst({
      where: { companyId, action: "team.membership_status_changed" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry?.metadata).toMatchObject({ from: "DISABLED", to: "ACTIVE" });
  });

  it("revoke kills the link; resend replaces tokens for expired invites", async () => {
    const secondCtx = await ctx(companyId, secondId);

    // fresh invitation
    await inviteTeamMembers(secondCtx, [`team-${run}-acc@team.test`], "ACCOUNTANT");
    const invite = await prisma.invitation.findFirstOrThrow({
      where: { companyId, email: `team-${run}-acc@team.test`, revokedAt: null },
    });

    // expiry + token swap to exercise views
    const { generateToken } = await import("@/server/auth/tokens");
    const old = generateToken();
    await prisma.invitation.update({
      where: { id: invite.id },
      data: { tokenHash: old.hash, expiresAt: new Date(Date.now() - 1000) }, // already expired
    });
    expect((await getInvitationView(old.raw)).status).toBe("invalid");

    // resend → old revoked, fresh valid token
    await resendInvitation(secondCtx, invite.id);
    const fresh = await prisma.invitation.findFirstOrThrow({
      where: { companyId, email: `team-${run}-acc@team.test`, revokedAt: null },
    });
    expect(fresh.id).not.toBe(invite.id);
    const known = generateToken();
    await prisma.invitation.update({ where: { id: fresh.id }, data: { tokenHash: known.hash } });
    expect((await getInvitationView(known.raw)).status).toBe("valid");

    // revoke kills it; re-revoke is a safe no-op
    await revokeInvitation(secondCtx, fresh.id);
    await revokeInvitation(secondCtx, fresh.id);
    expect((await getInvitationView(known.raw)).status).toBe("invalid");

    // resend on a revoked invite gives guidance
    await expect(resendInvitation(secondCtx, fresh.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("keeps tenant isolation on every mutation path", async () => {
    const alien = await registerCompany({
      fullName: "Alien Admin",
      email: `team-${run}-alien@team.test`,
      companyName: "Alien SARL",
      password: "Secure#Pass23",
    });
    companyIds.push(alien.companyId);
    userIds.push(alien.userId);
    const alienCtx = await ctx(alien.companyId, alien.userId);

    await expect(
      changeMemberRole(alienCtx, secondMembershipId, "ACCOUNTANT"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      setMembershipStatus(alienCtx, ownerMembershipId, "disable"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const roster = await listTeam(alien.companyId);
    expect(roster.members).toHaveLength(1);
  });
});
