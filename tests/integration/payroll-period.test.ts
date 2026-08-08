/**
 * Integration test for payroll periods: creation guards (overlap, single
 * active prep, naming), delete rules, eligibility preview, tenant isolation.
 * Enable with: RUN_DB_TESTS=1 npm test
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { getDb, disposeDb } from "@/lib/db";
import { registerCompany } from "@/server/services/onboarding.service";
import { createDepartment, createPosition } from "@/server/services/org.service";
import { createEmployee } from "@/server/services/employee.service";
import {
  createPeriod,
  deletePeriod,
  getPeriodDetail,
  listPeriods,
} from "@/server/services/payroll-period.service";
import type { CompanyContext } from "@/server/tenant/context";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("payroll periods (integration)", () => {
  const prisma = getDb();
  const run = Date.now();
  const companyIds: string[] = [];
  const userIds: string[] = [];

  let companyId = "";
  let otherCompanyId = "";
  let ctx: CompanyContext;
  let otherCtx: CompanyContext;
  let positionId = "";

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await disposeDb();
  });

  async function buildCtx(targetCompanyId: string): Promise<CompanyContext> {
    const [company, membership] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: targetCompanyId } }),
      prisma.membership.findFirstOrThrow({ where: { companyId: targetCompanyId } }),
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

  it("sets up a company with employees in different lifecycle states", async () => {
    const reg = await registerCompany({
      fullName: "Payroll Admin",
      email: `pp-${run}-admin@payroll.test`,
      companyName: "Periods Test SARL",
      password: "Secure#Pass23",
    });
    companyId = reg.companyId;
    companyIds.push(companyId);
    userIds.push(reg.userId);

    const other = await registerCompany({
      fullName: "Other Admin",
      email: `pp-${run}-other@payroll.test`,
      companyName: "Other Co",
      password: "Secure#Pass23",
    });
    otherCompanyId = other.companyId;
    companyIds.push(otherCompanyId);
    userIds.push(other.userId);

    ctx = await buildCtx(companyId);
    otherCtx = await buildCtx(otherCompanyId);

    const dept = await createDepartment(ctx, { name: "Ops", description: undefined });
    const pos = await createPosition(ctx, dept.id, { title: "Officer" });
    positionId = pos.id;

    // Active, hired long before the August period
    await createEmployee(ctx, {
      firstName: "Early",
      lastName: "Bird",
      positionId,
      dateHired: "2026-01-10",
      employmentType: "FULL_TIME",
      basicSalary: "300000",
    });
    // Hired after the period ends
    await createEmployee(ctx, {
      firstName: "Late",
      lastName: "Starter",
      positionId,
      dateHired: "2026-09-10",
      employmentType: "FULL_TIME",
      basicSalary: "300000",
    });
    // Zero salary
    await createEmployee(ctx, {
      firstName: "Zero",
      lastName: "Pay",
      positionId,
      dateHired: "2026-01-10",
      employmentType: "FULL_TIME",
      basicSalary: "0",
    });
    expect(positionId).toBeTruthy();
  });

  it("creates a DRAFT period with the auto name and metadata", async () => {
    const created = await createPeriod(ctx, {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      payDate: "2026-09-05",
      notes: undefined,
    });
    expect(created.name).toBe("August 2026");

    const stored = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.status).toBe("DRAFT");
    expect(stored.startDate.toISOString().slice(0, 10)).toBe("2026-08-01");

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { companyId, action: "payroll.period_created", entityId: created.id },
    });
    expect(auditRow).toBeTruthy();

    const periods = await listPeriods(companyId);
    expect(periods).toHaveLength(1);
    expect(periods[0]?.name).toBe("August 2026");
  });

  it("rejects overlaps — including shared boundary days — with the clashing name", async () => {
    const attempt = (startDate: string, endDate: string) =>
      createPeriod(ctx, { startDate, endDate, payDate: "2026-10-05", notes: undefined });

    await expect(attempt("2026-08-01", "2026-08-31")).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("August 2026"),
    });
    await expect(attempt("2026-08-15", "2026-09-15")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(attempt("2026-08-31", "2026-09-30")).rejects.toMatchObject({ code: "CONFLICT" }); // shared day
    await expect(attempt("2026-07-01", "2026-08-01")).rejects.toMatchObject({ code: "CONFLICT" }); // shared day
  });

  it("enforces one active prep period even for disjoint dates", async () => {
    await expect(
      createPeriod(ctx, {
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        payDate: "2026-10-05",
        notes: undefined,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("August 2026") });
  });

  it("allows the next period once the previous leaves the prep window", async () => {
    await prisma.payrollPeriod.updateMany({
      where: { companyId, name: "August 2026" },
      data: { status: "SUBMITTED" },
    });
    const created = await createPeriod(ctx, {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      payDate: "2026-10-05",
      notes: "second period",
    });
    expect(created.name).toBe("September 2026");
    // clean up for the delete test below
    await prisma.payrollPeriod.delete({ where: { id: created.id } });
  });

  it("computes the eligibility preview with labelled exclusions", async () => {
    const period = await prisma.payrollPeriod.findFirstOrThrow({
      where: { companyId, name: "August 2026" },
    });

    const masked = await getPeriodDetail(companyId, period.id, false);
    expect(masked?.eligibleCount).toBe(1);
    expect(masked?.excludedCount).toBe(2);
    expect(masked?.eligibility.every((row) => row.basicSalary === null)).toBe(true);

    const sensitive = await getPeriodDetail(companyId, period.id, true);
    const byName = new Map(sensitive?.eligibility.map((row) => [row.fullName, row]));
    expect(byName.get("Early Bird")?.exclusion).toBeNull();
    expect(byName.get("Late Starter")?.exclusion).toBe("HIRED_AFTER_PERIOD");
    expect(byName.get("Zero Pay")?.exclusion).toBe("ZERO_SALARY");
    expect(byName.get("Early Bird")?.basicSalary).toBe("300000");
  });

  it("deletes only DRAFT periods", async () => {
    const august = await prisma.payrollPeriod.findFirstOrThrow({
      where: { companyId, name: "August 2026" },
    });

    // still SUBMITTED from the earlier test
    await expect(deletePeriod(ctx, august.id)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await prisma.payrollPeriod.update({ where: { id: august.id }, data: { status: "DRAFT" } });
    const deleted = await deletePeriod(ctx, august.id);
    expect(deleted.name).toBe("August 2026");
    expect(await prisma.payrollPeriod.findUnique({ where: { id: august.id } })).toBeNull();

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { companyId, action: "payroll.period_deleted", entityId: august.id },
    });
    expect(auditRow).toBeTruthy();
  });

  it("keeps tenant isolation", async () => {
    const foreign = await createPeriod(otherCtx, {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      payDate: "2026-09-05",
      notes: undefined,
    });

    expect(await getPeriodDetail(companyId, foreign.id, true)).toBeNull();
    await expect(deletePeriod(ctx, foreign.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await prisma.payrollPeriod.delete({ where: { id: foreign.id } });
  });
});
