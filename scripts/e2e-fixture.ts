/**
 * Dev fixture: a verified company workspace for manual E2E testing,
 * without going through the email verification dance.
 *
 *   npx tsx scripts/e2e-fixture.ts
 *
 * Idempotent — skips creation when the account already exists.
 * Run only while the dev server is stopped (embedded PGlite is single-writer).
 */
import "dotenv/config";
import { getDb, disposeDb } from "@/lib/db";
import { registerCompany } from "@/server/services/onboarding.service";
import { updateCompanyInfo, updatePayrollSettings } from "@/server/services/company.service";
import { createInitialDepartments } from "@/server/services/org.service";
import { completeSetup } from "@/server/services/setup.service";
import type { CompanyContext } from "@/server/tenant/context";

export const E2E_USER = {
  email: "e2e@check.test",
  password: "E2ePass#2026",
  fullName: "E2E Verifier",
  companyName: "E2E Check SARL",
};

async function main() {
  const db = getDb();

  let userId: string;
  let companyId: string;
  const existing = await db.user.findUnique({
    where: { email: E2E_USER.email },
    include: { memberships: true },
  });
  if (existing) {
    userId = existing.id;
    const membership = existing.memberships.find((m) => m.role === "COMPANY_ADMIN");
    if (!membership) throw new Error("Fixture user exists without an admin membership");
    companyId = membership.companyId;
    console.log("Fixture account exists — completing any missing setup steps.");
  } else {
    const created = await registerCompany({
      email: E2E_USER.email,
      password: E2E_USER.password,
      fullName: E2E_USER.fullName,
      companyName: E2E_USER.companyName,
    });
    userId = created.userId;
    companyId = created.companyId;
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  }

  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const membership = await db.membership.findFirstOrThrow({ where: { companyId } });
  const ctx: CompanyContext = {
    user: {
      id: userId,
      email: E2E_USER.email,
      fullName: E2E_USER.fullName,
      isSuperAdmin: false,
      emailVerifiedAt: new Date(),
    },
    membership: { id: membership.id, role: membership.role, status: membership.status },
    company,
    effectiveStatus: "TRIAL",
  };

  if (company.setupCompletedAt) {
    console.log(`Fixture already complete: ${E2E_USER.email}`);
    await disposeDb();
    return;
  }

  await updateCompanyInfo(ctx, {
    name: E2E_USER.companyName,
    country: "CM",
    address: "Akwa, Douala",
    taxId: "M021234567890Z",
  });
  await updatePayrollSettings(ctx, {
    payrollFrequency: "MONTHLY",
    standardHoursPerWeek: 40,
    overtimeMultiplier: 1.25,
    taxRatePercent: 4.5,
  });
  await createInitialDepartments(ctx, ["Operations", "Finance", "Engineering"]);
  await db.company.update({ where: { id: companyId }, data: { setupStep: 5 } });
  await completeSetup({
    ...ctx,
    company: await db.company.findUniqueOrThrow({ where: { id: companyId } }),
  });

  console.log(`Fixture ready: ${E2E_USER.email} / ${E2E_USER.password} (${E2E_USER.companyName})`);
  await disposeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
