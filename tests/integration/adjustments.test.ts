/**
 * Integration test for payroll adjustments: CRUD guards, eligibility scoping,
 * totals rollups, the READY/SUBMITTED lock window, tenant isolation.
 * Enable with: RUN_DB_TESTS=1 npm test
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { getDb, disposeDb } from "@/lib/db";
import { registerCompany } from "@/server/services/onboarding.service";
import { createDepartment, createPosition } from "@/server/services/org.service";
import { createEmployee } from "@/server/services/employee.service";
import { createPeriod } from "@/server/services/payroll-period.service";
import {
  createAdjustment,
  deleteAdjustment,
  listAdjustments,
  updateAdjustment,
} from "@/server/services/adjustment.service";
import type { CompanyContext } from "@/server/tenant/context";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("payroll adjustments (integration)", () => {
  const prisma = getDb();
  const run = Date.now();
  const companyIds: string[] = [];
  const userIds: string[] = [];

  let companyId = "";
  let otherCompanyId = "";
  let ctx: CompanyContext;
  let otherCtx: CompanyContext;
  let periodId = "";
  let eligibleEmployeeId = "";
  let ineligibleEmployeeId = "";
  let secondEmployeeId = "";

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

  it("sets up a company, an August period and two employees", async () => {
    const reg = await registerCompany({
      fullName: "Adj Admin",
      email: `adj-${run}-admin@payroll.test`,
      companyName: "Adjustments Test SARL",
      password: "Secure#Pass23",
    });
    companyId = reg.companyId;
    companyIds.push(companyId);
    userIds.push(reg.userId);

    const other = await registerCompany({
      fullName: "Other Admin",
      email: `adj-${run}-other@payroll.test`,
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

    const early = await createEmployee(ctx, {
      firstName: "Early",
      lastName: "Bird",
      positionId: pos.id,
      dateHired: "2026-01-10",
      employmentType: "FULL_TIME",
      basicSalary: "300000",
    });
    eligibleEmployeeId = early.id;
    const second = await createEmployee(ctx, {
      firstName: "Second",
      lastName: "Staff",
      positionId: pos.id,
      dateHired: "2026-01-10",
      employmentType: "FULL_TIME",
      basicSalary: "200000",
    });
    secondEmployeeId = second.id;
    const late = await createEmployee(ctx, {
      firstName: "Late",
      lastName: "Starter",
      positionId: pos.id,
      dateHired: "2026-09-10",
      employmentType: "FULL_TIME",
      basicSalary: "300000",
    });
    ineligibleEmployeeId = late.id;

    const period = await createPeriod(ctx, {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      payDate: "2026-09-05",
      notes: undefined,
    });
    periodId = period.id;
    expect(periodId).toBeTruthy();
  });

  it("creates earnings and deductions with the derived category", async () => {
    const bonus = await createAdjustment(ctx, periodId, {
      employeeId: eligibleEmployeeId,
      type: "BONUS",
      amount: "50000",
      note: "Retention",
    });
    await createAdjustment(ctx, periodId, {
      employeeId: eligibleEmployeeId,
      type: "OVERTIME",
      hours: "6.5",
    });
    const loan = await createAdjustment(ctx, periodId, {
      employeeId: secondEmployeeId,
      type: "LOAN",
      amount: "15000",
    });

    const rows = await prisma.payrollAdjustment.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((row) => row.category)).toEqual(["EARNING", "EARNING", "DEDUCTION"]);
    expect(rows[1]?.hours?.toString()).toBe("6.5");
    // Overtime amount computed: 300 000 / (40×52/12) × 6.5 × 1.2 = 13 500.
    expect(rows[1]?.amount.toString()).toBe("13500");

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { companyId, action: "payroll.adjustment_added", entityId: bonus.id },
    });
    expect(JSON.stringify(auditRow.metadata)).toContain('"amount":"50000"');

    const loanAudit = await prisma.auditLog.findFirstOrThrow({
      where: { companyId, action: "payroll.adjustment_added", entityId: loan.id },
    });
    expect(JSON.stringify(loanAudit.metadata)).toContain('"type":"LOAN"');
  });

  it("rejects adjustments for ineligible and foreign employees", async () => {
    await expect(
      createAdjustment(ctx, periodId, {
        employeeId: ineligibleEmployeeId,
        type: "BONUS",
        amount: "5000",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      createAdjustment(ctx, periodId, { employeeId: "missing", type: "BONUS", amount: "5000" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rolls totals up grand and per-employee", async () => {
    const board = await listAdjustments(companyId, periodId);
    expect(board.totals.earningCount).toBe(2);
    expect(board.totals.deductionCount).toBe(1);
    expect(board.totals.earningsTotal).toBe("63500"); // 50 000 bonus + 13 500 overtime
    expect(board.totals.deductionsTotal).toBe("15000");
    expect(board.totals.netImpact).toBe("48500");

    const byEmployee = new Map(board.totals.perEmployee.map((bucket) => [bucket.employeeId, bucket]));
    expect(byEmployee.get(eligibleEmployeeId)?.earningsTotal).toBe("63500");
    expect(byEmployee.get(eligibleEmployeeId)?.deductionsTotal).toBe("0");
    expect(byEmployee.get(secondEmployeeId)?.deductionsTotal).toBe("15000");
  });

  it("updates rows and audits old + new values", async () => {
    const first = await prisma.payrollAdjustment.findFirstOrThrow({
      where: { companyId, type: "BONUS" },
    });
    await updateAdjustment(ctx, first.id, {
      employeeId: eligibleEmployeeId,
      type: "TRANSPORT",
      amount: "20000",
      note: "Swap to transport",
    });

    const stored = await prisma.payrollAdjustment.findUniqueOrThrow({ where: { id: first.id } });
    expect(stored.type).toBe("TRANSPORT");
    expect(stored.amount.toString()).toBe("20000");

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { companyId, action: "payroll.adjustment_updated", entityId: first.id },
    });
    expect(JSON.stringify(auditRow.metadata)).toContain('"previousAmount":"50000"');
    expect(JSON.stringify(auditRow.metadata)).toContain('"previousType":"BONUS"');

    const board = await listAdjustments(companyId, periodId);
    expect(board.totals.earningsTotal).toBe("33500"); // 13 500 overtime + 20 000 transport
  });

  it("deletes rows with an audit trail", async () => {
    const target = await prisma.payrollAdjustment.findFirstOrThrow({
      where: { companyId, type: "LOAN" },
    });
    await deleteAdjustment(ctx, target.id);
    expect(await prisma.payrollAdjustment.findUnique({ where: { id: target.id } })).toBeNull();

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { companyId, action: "payroll.adjustment_deleted", entityId: target.id },
    });
    expect(JSON.stringify(auditRow.metadata)).toContain('"amount":"15000"');

    const board = await listAdjustments(companyId, periodId);
    expect(board.totals.deductionCount).toBe(0);
  });

  it("locks on SUBMITTED, reopens when back to READY", async () => {
    await prisma.payrollPeriod.update({ where: { id: periodId }, data: { status: "READY" } });
    // READY is editable — add then remove
    const temp = await createAdjustment(ctx, periodId, {
      employeeId: eligibleEmployeeId,
      type: "MEAL",
      amount: "10000",
    });
    await deleteAdjustment(ctx, temp.id);

    await prisma.payrollPeriod.update({ where: { id: periodId }, data: { status: "SUBMITTED" } });
    await expect(
      createAdjustment(ctx, periodId, {
        employeeId: eligibleEmployeeId,
        type: "BONUS",
        amount: "5000",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("locked") });

    const anyRow = await prisma.payrollAdjustment.findFirstOrThrow({ where: { companyId } });
    await expect(
      updateAdjustment(ctx, anyRow.id, {
        employeeId: eligibleEmployeeId,
        type: "PENALTY",
        amount: "1000",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(deleteAdjustment(ctx, anyRow.id)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await prisma.payrollPeriod.update({ where: { id: periodId }, data: { status: "DRAFT" } });
  });

  it("keeps tenant isolation on every mutation", async () => {
    const anyRow = await prisma.payrollAdjustment.findFirstOrThrow({ where: { companyId } });
    await expect(
      createAdjustment(otherCtx, periodId, {
        employeeId: secondEmployeeId,
        type: "BONUS",
        amount: "5000",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateAdjustment(otherCtx, anyRow.id, {
        employeeId: secondEmployeeId,
        type: "BONUS",
        amount: "1000",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteAdjustment(otherCtx, anyRow.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const board = await listAdjustments(otherCompanyId, periodId);
    expect(board.rows).toHaveLength(0);
  });
});
