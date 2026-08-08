/**
 * Integration test for team invitations (Phase 2).
 * Enable with: RUN_DB_TESTS=1 npm test
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { Company } from "@prisma/client";
import { getDb, disposeDb } from "@/lib/db";
import { registerCompany } from "@/server/services/onboarding.service";
import {
  acceptInvitationAsExistingUser,
  acceptInvitationAsNewUser,
  getInvitationView,
  inviteTeamMembers,
} from "@/server/services/invitation.service";
import { generateToken } from "@/server/auth/tokens";
import type { CompanyContext } from "@/server/tenant/context";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("invitations (integration)", () => {
  const prisma = getDb();
  const ownerEmail = `owner-${Date.now()}@invites.test`;
  const hrEmail = `hr-${Date.now()}@invites.test`;
  const acctEmail = `acct-${Date.now()}@invites.test`;
  let companyId = "";
  let ownerId = "";

  async function ctx(): Promise<CompanyContext> {
    const company = (await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
    })) as Company;
    const membership = await prisma.membership.findFirstOrThrow({
      where: { companyId, role: "COMPANY_ADMIN" },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isSuperAdmin: false,
        emailVerifiedAt: user.emailVerifiedAt,
      },
      membership: { id: membership.id, role: membership.role, status: membership.status },
      company,
      effectiveStatus: "TRIAL",
    };
  }

  /** Swaps the stored hash for a known token so tests can drive acceptance. */
  async function forceKnownToken(inviteEmail: string) {
    const row = await prisma.invitation.findFirstOrThrow({
      where: { companyId, email: inviteEmail, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const known = generateToken();
    await prisma.invitation.update({
      where: { id: row.id },
      data: { tokenHash: known.hash },
    });
    return known;
  }

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({
      where: { email: { in: [ownerEmail, hrEmail, acctEmail] } },
    });
    await disposeDb();
  });

  it("creates hashed single-use invitations with a 7-day expiry", async () => {
    const result = await registerCompany({
      fullName: "Invite Owner",
      email: ownerEmail,
      companyName: "Invites Test SARL",
      password: "Secure#Pass23",
    });
    ownerId = result.userId;
    companyId = result.companyId;

    const res = await inviteTeamMembers(await ctx(), [hrEmail], "HR_MANAGER");
    expect(res.invited).toEqual([hrEmail]);

    const invite = await prisma.invitation.findFirstOrThrow({
      where: { companyId, email: hrEmail },
    });
    expect(invite.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(invite.role).toBe("HR_MANAGER");
    expect(invite.invitedById).toBe(ownerId);

    const ttlMs = invite.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(6.9 * 24 * 60 * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(7 * 24 * 60 * 60_000);
  });

  it("revokes and re-issues a pending invitation on resend, keeping one valid token", async () => {
    const res = await inviteTeamMembers(await ctx(), [hrEmail], "ACCOUNTANT");
    expect(res.resent).toEqual([hrEmail]);

    const invites = await prisma.invitation.findMany({
      where: { companyId, email: hrEmail },
      orderBy: { createdAt: "asc" },
    });
    expect(invites).toHaveLength(2);
    expect(invites[0]?.revokedAt).not.toBeNull();
    expect(invites[1]?.revokedAt).toBeNull();

    // The audit trail shows the original invite and the resend.
    const actions = await prisma.auditLog.findMany({
      where: { companyId, action: { in: ["team.invited", "team.invite_resent"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(actions.map((a) => a.action)).toEqual(["team.invited", "team.invite_resent"]);
  });

  it("accepts a new user: verified account + ACTIVE membership, token consumed", async () => {
    const known = await forceKnownToken(hrEmail);

    const view = await getInvitationView(known.raw);
    expect(view.status).toBe("valid");
    if (view.status === "valid") {
      expect(view.email).toBe(hrEmail);
      expect(view.role).toBe("ACCOUNTANT"); // role from the latest invitation
    }

    await acceptInvitationAsNewUser(known.raw, "Helene HR", "Secure#Pass23");

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: hrEmail },
      include: { memberships: true },
    });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.memberships).toHaveLength(1);
    expect(user.memberships[0]?.role).toBe("ACCOUNTANT");
    expect(user.memberships[0]?.status).toBe("ACTIVE");
    expect(user.memberships[0]?.invitedById).toBe(ownerId);

    // Consumed: any further attempt fails.
    await expect(
      acceptInvitationAsNewUser(known.raw, "Again", "Secure#Pass23"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await getInvitationView(known.raw)).status).toBe("invalid");
  });

  it("rejects inviting someone who already holds a membership", async () => {
    await expect(
      inviteTeamMembers(await ctx(), [hrEmail], "HR_MANAGER"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // And the owner herself.
    await expect(
      inviteTeamMembers(await ctx(), [ownerEmail], "HR_MANAGER"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("accepts an existing signed-in user only when emails match", async () => {
    const existingUser = await prisma.user.create({
      data: {
        email: acctEmail,
        fullName: "Existing Accountant",
        passwordHash: "x",
        emailVerifiedAt: new Date(),
      },
    });

    await inviteTeamMembers(await ctx(), [acctEmail], "ACCOUNTANT");
    const known = await forceKnownToken(acctEmail);

    // Wrong user id → FORBIDDEN
    await expect(
      acceptInvitationAsExistingUser(known.raw, ownerId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await acceptInvitationAsExistingUser(known.raw, existingUser.id);
    const membership = await prisma.membership.findUniqueOrThrow({
      where: { userId_companyId: { userId: existingUser.id, companyId } },
    });
    expect(membership.role).toBe("ACCOUNTANT");
    expect(membership.status).toBe("ACTIVE");
  });

  it("reports garbage tokens as invalid", async () => {
    expect((await getInvitationView("definitely-not-a-token")).status).toBe("invalid");
  });
});
