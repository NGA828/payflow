/**
 * Integration test for the onboarding flow against a real database.
 * Enable with: RUN_DB_TESTS=1 npm test ( DATABASE_URL must point at a live DB )
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { getDb, disposeDb } from "@/lib/db";
import {
  registerCompany,
  verifyEmailToken,
  requestPasswordReset,
  resetPassword,
} from "@/server/services/onboarding.service";
import { hashToken, generateToken } from "@/server/auth/tokens";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("onboarding (integration)", () => {
  const prisma = getDb();
  const email = `test-${Date.now()}@onboarding.test`;
  let companyId = "";
  let userId = "";

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await disposeDb();
  });

  it("registers a company atomically with trial, membership and default plan", async () => {
    const result = await registerCompany({
      fullName: "Integration Tester",
      email,
      companyName: "Integration Test SARL",
      password: "Secure#Pass23",
    });
    userId = result.userId;
    companyId = result.companyId;

    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      include: { memberships: true, subscription: { include: { plan: true } } },
    });
    expect(company.status).toBe("TRIAL");
    expect(company.memberships).toHaveLength(1);
    expect(company.memberships[0]?.role).toBe("COMPANY_ADMIN");
    expect(company.subscription?.status).toBe("TRIALING");
    expect(company.subscription?.plan.code).toBe("starter");

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).not.toContain("Secure#Pass23");
    expect(user.emailVerifiedAt).toBeNull();
  });

  it("rejects duplicate email registration", async () => {
    await expect(
      registerCompany({
        fullName: "Dup",
        email,
        companyName: "Dup SARL",
        password: "Secure#Pass23",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("verifies email via a single-use hashed token", async () => {
    const tokenRow = await prisma.authToken.findFirstOrThrow({
      where: { userId, type: "EMAIL_VERIFICATION" },
    });
    expect(tokenRow.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    // The raw token was emailed; swap in a known one to exercise the verify path.
    const known = generateToken();
    await prisma.authToken.update({
      where: { id: tokenRow.id },
      data: { tokenHash: known.hash },
    });

    expect(await verifyEmailToken(known.raw)).toBe("verified");
    // second use of the same token is inert
    expect(await verifyEmailToken(known.raw)).toBe("already_verified");
    expect(hashToken(known.raw)).toBe(known.hash);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("supports a complete password reset cycle", async () => {
    await requestPasswordReset(email);
    const row = await prisma.authToken.findFirstOrThrow({
      where: { userId, type: "PASSWORD_RESET" },
      orderBy: { createdAt: "desc" },
    });
    const known = generateToken();
    await prisma.authToken.update({ where: { id: row.id }, data: { tokenHash: known.hash } });

    await resetPassword(known.raw, "NewPassword#99");
    await expect(resetPassword(known.raw, "Another#Pass1")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
