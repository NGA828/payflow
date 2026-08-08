/**
 * Integration test for payroll processing: engine run, payslip upserts,
 * payslip-number sequencing, idempotent reprocess, APPROVED-payslip
 * sanctity, state-machine guards, audit trail, tenant isolation.
 * Enable with: RUN_DB_TESTS=1 npm test
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { getDb, disposeDb } from "@/lib/db";
import { registerCompany } from "@/server/services/onboarding.service";
import { createDepartment, createPosition } from "@/server/services/org.service";
import {
  createEmployee,
  updateEmployee,
  updatePaymentDetails,
} from "@/server/services/employee.service";
import { updatePayrollSettings } from "@/server/services/company.service";
import { createPeriod } from "@/server/services/payroll-period.service";
import { createAdjustment } from "@/server/services/adjustment.service";
import {
  listPayslipsForPeriod,
  processPayroll,
} from "@/server/services/payroll-processing.service";
import type { CompanyContext } from "@/server/tenant/context";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("payroll processing (integration)", () => {
  const prisma = getDb();
  const run = Date.now();
  const companyIds: string[] = [];
  const userIds: string[] = [];

  let ctx: CompanyContext;
  let otherCtx: CompanyContext;
  let periodId = "";
  let positionId = "";
  let aminaId = "";
  let borisId = "";

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

  it("sets up a company with two eligible employees and one future hire", async () => {
    const reg = await registerCompany({
      fullName: "Processing Admin",
      email: `pc-${run}-admin@payroll.test`,
      companyName: "Processing Test SARL",
      password: "Secure#Pass23",
    });
    companyIds.push(reg.companyId);
    userIds.push(reg.userId);
    ctx = await buildCtx(reg.companyId);

    await updatePayrollSettings(ctx, {
      payrollFrequency: "MONTHLY",
      standardHoursPerWeek: 40,
      overtimeMultiplier: 1.25,
      taxRatePercent: 4.5,
    });
    ctx = await buildCtx(reg.companyId); // settings are read from ctx.company

    const other = await registerCompany({
      fullName: "Foreign Admin",
      email: `pc-${run}-foreign@payroll.test`,
      companyName: "Foreign Co",
      password: "Secure#Pass23",
    });
    companyIds.push(other.companyId);
    userIds.push(other.userId);
    otherCtx = await buildCtx(other.companyId);

    const dept = await createDepartment(ctx, { name: "Field Ops", description: undefined });
    positionId = (await createPosition(ctx, dept.id, { title: "Officer" })).id;

    aminaId = (
      await createEmployee(ctx, {
        firstName: "Amina",
        lastName: "Engine",
        positionId,
        dateHired: "2026-01-10",
        employmentType: "FULL_TIME",
        basicSalary: "850000",
      })
    ).id;
    await updatePaymentDetails(ctx, aminaId, {
      paymentMethod: "BANK",
      bankName: "Afriland First Bank",
      bankAccountNumber: "1002 3345 6789 4521",
    });

    borisId = (
      await createEmployee(ctx, {
        firstName: "Boris",
        lastName: "Engine",
        positionId,
        dateHired: "2026-01-10",
        employmentType: "FULL_TIME",
        basicSalary: "1200000",
      })
    ).id; // payment details intentionally missing

    await createEmployee(ctx, {
      firstName: "Future",
      lastName: "Starter",
      positionId,
      dateHired: "2026-09-10", // hired after the August period
      employmentType: "FULL_TIME",
      basicSalary: "300000",
    });
    expect(aminaId).not.toBe(borisId);
  });

  it("creates the August period with adjustments", async () => {
    periodId = (
      await createPeriod(ctx, {
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        payDate: "2026-09-05",
        notes: undefined,
      })
    ).id;
    await createAdjustment(ctx, periodId, {
      employeeId: aminaId,
      type: "OVERTIME",
      hours: "7.5",
      amount: undefined,
      note: undefined,
    });
    await createAdjustment(ctx, periodId, {
      employeeId: aminaId,
      type: "BONUS",
      amount: "50000",
      hours: undefined,
      note: undefined,
    });
    await createAdjustment(ctx, periodId, {
      employeeId: borisId,
      type: "LOAN",
      amount: "15000",
      hours: undefined,
      note: undefined,
    });
    expect(periodId).toBeTruthy();
  });

  it("processes DRAFT → READY with exact golden amounts", async () => {
    const result = await processPayroll(ctx, periodId);

    expect(result.periodStatus).toBe("READY");
    expect(result.totalEmployees).toBe(2);
    // Amina: OT = 850000/(40×52/12)×7.5×1.25 = 45974 → gross 945974,
    // tax = round(945974×4.5%) = 42569 → net 903405.
    // Boris: gross 1200000, tax 54000, loan 15000 → deductions 69000, net 1131000.
    expect(result.totalGross).toBe("2145974");
    expect(result.totalDeductions).toBe("111569");
    expect(result.totalNet).toBe("2034405");
    expect(result.missingPaymentCount).toBe(1); // Boris
    expect(result.skippedApprovedPayslips).toBe(0);

    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: periodId } });
    expect(period.status).toBe("READY");
    expect(period.totalEmployees).toBe(2);
    expect(period.totalGross?.toString()).toBe("2145974");
    expect(period.totalNet?.toString()).toBe("2034405");

    const payslips = await prisma.payslip.findMany({
      where: { companyId: ctx.company.id, payrollPeriodId: periodId },
    });
    expect(payslips).toHaveLength(2);
    expect(new Set(payslips.map((row) => row.status))).toEqual(new Set(["DRAFT"]));
    expect(new Set(payslips.map((row) => row.payslipNumber))).toEqual(
      new Set(["PS-2026-00001", "PS-2026-00002"]),
    );

    const amina = payslips.find((row) => row.employeeId === aminaId);
    expect(amina?.basicSalary.toString()).toBe("850000");
    expect(amina?.overtimePay.toString()).toBe("45974");
    expect(amina?.bonuses.toString()).toBe("50000");
    expect(amina?.grossSalary.toString()).toBe("945974");
    expect(amina?.tax.toString()).toBe("42569");
    expect(amina?.deductions.toString()).toBe("42569");
    expect(amina?.netSalary.toString()).toBe("903405");

    const boris = payslips.find((row) => row.employeeId === borisId);
    expect(boris?.basicSalary.toString()).toBe("1200000");
    expect(boris?.overtimePay.toString()).toBe("0");
    expect(boris?.grossSalary.toString()).toBe("1200000");
    expect(boris?.tax.toString()).toBe("54000");
    expect(boris?.deductions.toString()).toBe("69000");
    expect(boris?.netSalary.toString()).toBe("1131000");

    const runRow = await prisma.payrollRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(runRow.status).toBe("COMPLETED");
    expect(runRow.totalEmployees).toBe(2);
    expect(runRow.processedEmployees).toBe(2);
    expect(runRow.completedAt).not.toBeNull();

    const auditActions = await prisma.auditLog.findMany({
      where: { entityId: result.runId, entityType: "PayrollRun" },
      select: { action: true },
    });
    expect(auditActions.map((row) => row.action).sort()).toEqual([
      "payroll.process_completed",
      "payroll.process_started",
    ]);
  });

  it("reprocesses idempotently: salary change recomputes, rows and numbers stay stable", async () => {
    const before = await prisma.payslip.findMany({
      where: { companyId: ctx.company.id, payrollPeriodId: periodId },
    });
    const aminaBefore = before.find((row) => row.employeeId === aminaId);
    const borisBefore = before.find((row) => row.employeeId === borisId);

    await updateEmployee(ctx, aminaId, {
      firstName: "Amina",
      lastName: "Engine",
      positionId,
      dateHired: "2026-01-10",
      employmentType: "FULL_TIME",
      basicSalary: "900000", // mid-draft salary correction
    });

    const result = await processPayroll(ctx, periodId);
    expect(result.periodStatus).toBe("READY");

    // Amina @900000: OT = 900000/(40×52/12)×7.5×1.25 = 48678 → gross 998678,
    // tax = round(998678×4.5%) = round(44940.51) = 44941 → net 953737.
    expect(result.totalGross).toBe("2198678"); // 998678 + 1200000
    expect(result.totalDeductions).toBe("113941"); // 44941 + 69000
    expect(result.totalNet).toBe("2084737"); // 953737 + 1131000

    const after = await prisma.payslip.findMany({
      where: { companyId: ctx.company.id, payrollPeriodId: periodId },
    });
    expect(after).toHaveLength(2); // no duplicates

    const aminaAfter = after.find((row) => row.employeeId === aminaId);
    expect(aminaAfter?.id).toBe(aminaBefore?.id); // updated in place
    expect(aminaAfter?.payslipNumber).toBe(aminaBefore?.payslipNumber);
    expect(aminaAfter?.basicSalary.toString()).toBe("900000");
    expect(aminaAfter?.overtimePay.toString()).toBe("48678"); // recomputed from hours
    expect(aminaAfter?.grossSalary.toString()).toBe("998678");
    expect(aminaAfter?.tax.toString()).toBe("44941");
    expect(aminaAfter?.netSalary.toString()).toBe("953737");

    const borisAfter = after.find((row) => row.employeeId === borisId);
    expect(borisAfter?.id).toBe(borisBefore?.id);
    expect(borisAfter?.payslipNumber).toBe(borisBefore?.payslipNumber);
    expect(borisAfter?.netSalary.toString()).toBe("1131000"); // untouched
  });

  it("allocates the next payslip number to a late-added employee", async () => {
    const late = await createEmployee(ctx, {
      firstName: "Dylan",
      lastName: "Late",
      positionId,
      dateHired: "2026-01-10",
      employmentType: "FULL_TIME",
      basicSalary: "300000",
    });

    const result = await processPayroll(ctx, periodId);
    expect(result.totalEmployees).toBe(3);

    const dylanSlip = await prisma.payslip.findFirstOrThrow({
      where: { payrollPeriodId: periodId, employeeId: late.id },
    });
    expect(dylanSlip.payslipNumber).toBe("PS-2026-00003");
    expect(dylanSlip.grossSalary.toString()).toBe("300000");
    expect(dylanSlip.tax.toString()).toBe("13500");
    expect(dylanSlip.netSalary.toString()).toBe("286500");

    expect(result.totalGross).toBe("2498678"); // 2198678 + 300000
    expect(result.totalDeductions).toBe("127441"); // 113941 + 13500
    expect(result.totalNet).toBe("2371237"); // 2084737 + 286500
  });

  it("never recomputes APPROVED payslips on reprocess", async () => {
    const aminaSlip = await prisma.payslip.findFirstOrThrow({
      where: { payrollPeriodId: periodId, employeeId: aminaId },
    });
    await prisma.payslip.update({
      where: { id: aminaSlip.id },
      data: { status: "APPROVED" },
    });
    await updateEmployee(ctx, aminaId, {
      firstName: "Amina",
      lastName: "Engine",
      positionId,
      dateHired: "2026-01-10",
      employmentType: "FULL_TIME",
      basicSalary: "950000", // would change the amounts — must NOT be applied
    });

    const result = await processPayroll(ctx, periodId);
    expect(result.skippedApprovedPayslips).toBe(1);

    const after = await prisma.payslip.findUniqueOrThrow({ where: { id: aminaSlip.id } });
    expect(after.status).toBe("APPROVED");
    expect(after.basicSalary.toString()).toBe("900000"); // frozen at approval time
    expect(after.netSalary.toString()).toBe("953737");

    // Totals aggregate the stored set — unchanged because amounts are frozen.
    expect(result.totalGross).toBe("2498678");
    expect(result.totalNet).toBe("2371237");
  });

  it("refuses to process a SUBMITTED period", async () => {
    await prisma.payrollPeriod.update({ where: { id: periodId }, data: { status: "SUBMITTED" } });
    await expect(processPayroll(ctx, periodId)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await prisma.payrollPeriod.update({ where: { id: periodId }, data: { status: "READY" } });
  });

  it("keeps tenants isolated", async () => {
    await expect(processPayroll(otherCtx, periodId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const rows = await listPayslipsForPeriod(otherCtx.company.id, periodId);
    expect(rows).toHaveLength(0);
  });
});
