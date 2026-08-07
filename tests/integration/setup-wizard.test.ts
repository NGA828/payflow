/**
 * Integration test for the Phase 2 setup wizard services.
 * Enable with: RUN_DB_TESTS=1 npm test
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { getDb, disposeDb } from "@/lib/db";
import { registerCompany } from "@/server/services/onboarding.service";
import { updateCompanyInfo, updatePayrollSettings } from "@/server/services/company.service";
import { createInitialDepartments } from "@/server/services/org.service";
import {
  advanceSetupStep,
  completeSetup,
  getSetupSnapshot,
} from "@/server/services/setup.service";
import type { CompanyContext } from "@/server/tenant/context";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("setup wizard (integration)", () => {
  const prisma = getDb();
  const email = `wizard-${Date.now()}@setup.test`;
  let userId = "";
  let companyId = "";

  async function buildCtx(role: Role = "COMPANY_ADMIN"): Promise<CompanyContext> {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const membership = await prisma.membership.findFirstOrThrow({
      where: { companyId, role },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isSuperAdmin: user.isSuperAdmin,
        emailVerifiedAt: user.emailVerifiedAt,
      },
      membership: { id: membership.id, role: membership.role, status: membership.status },
      company,
      effectiveStatus: "TRIAL",
    };
  }

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await disposeDb();
  });

  it("saves company info with an audit entry", async () => {
    const result = await registerCompany({
      fullName: "Wizard Owner",
      email,
      companyName: "Wizard Test SARL",
      password: "Secure#Pass23",
    });
    userId = result.userId;
    companyId = result.companyId;

    const ctx = await buildCtx();
    expect(ctx.company.setupStep).toBe(1);

    await updateCompanyInfo(ctx, {
      name: "Wizard Test SARL",
      country: "CM",
      address: "Akwa, Douala",
      taxId: "M021234567890A",
    });
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.address).toBe("Akwa, Douala");
    expect(company.taxId).toBe("M021234567890A");

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { companyId, action: "company.updated", metadata: { path: ["section"], equals: "profile" } },
    });
    expect(entry.userId).toBe(userId);
  });

  it("saves payroll settings and stores the tax rate as a fraction", async () => {
    const ctx = await buildCtx();
    await updatePayrollSettings(ctx, {
      payrollFrequency: "MONTHLY",
      standardHoursPerWeek: 40,
      overtimeMultiplier: 1.25,
      taxRatePercent: 4.5,
    });
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(Number(company.standardHoursPerWeek)).toBe(40);
    expect(Number(company.overtimeMultiplier)).toBe(1.25);
    expect(Number(company.taxRate)).toBeCloseTo(0.045, 6);
  });

  it("creates departments case-insensitively deduped and skips existing", async () => {
    const ctx = await buildCtx();
    const created = await createInitialDepartments(ctx, ["Finance", "finance", "Ops "]);
    expect(created).toEqual(["Finance", "Ops"]);
    const again = await createInitialDepartments(ctx, ["FINANCE"]);
    expect(again).toEqual([]);

    const count = await prisma.department.count({ where: { companyId } });
    expect(count).toBe(2);
  });

  it("gates completion on reaching the final step, then completes idempotently", async () => {
    let ctx = await buildCtx();
    await expect(completeSetup(ctx)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await advanceSetupStep(ctx, 1);
    await advanceSetupStep(ctx, 2);
    await advanceSetupStep(ctx, 3);
    await advanceSetupStep(ctx, 4);
    ctx = await buildCtx();
    expect(ctx.company.setupStep).toBe(5);

    await completeSetup(ctx);
    const once = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(once.setupCompletedAt).not.toBeNull();

    // Idempotent — no error, no second audit entry.
    await completeSetup(await buildCtx());
    const audits = await prisma.auditLog.count({
      where: { companyId, action: "company.setup_completed" },
    });
    expect(audits).toBe(1);
  });

  it("reports a live snapshot for the review step", async () => {
    const snapshot = await getSetupSnapshot(companyId);
    expect(snapshot.departments.map((d) => d.name).sort()).toEqual(["Finance", "Ops"].sort());
    expect(snapshot.teamMembers).toBe(1);
    expect(snapshot.pendingInvitations).toEqual([]);
  });
});
