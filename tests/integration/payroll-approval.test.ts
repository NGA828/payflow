/**
 * Integration test for review & approval: July finalized as history, August
 * processed, submit/reject/approve/unlock lifecycle, payslip-status flips,
 * the no-successful-payments unlock guard, review read-model + anomalies.
 * Enable with: RUN_DB_TESTS=1 npm test
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { getDb, disposeDb } from "@/lib/db";
import { registerCompany } from "@/server/services/onboarding.service";
import { createDepartment, createPosition } from "@/server/services/org.service";
import { createEmployee, updatePaymentDetails } from "@/server/services/employee.service";
import { updatePayrollSettings } from "@/server/services/company.service";
import { createPeriod } from "@/server/services/payroll-period.service";
import { createAdjustment } from "@/server/services/adjustment.service";
import { processPayroll } from "@/server/services/payroll-processing.service";
import {
  approvePeriod,
  rejectPeriod,
  submitPeriod,
  unlockPeriod,
} from "@/server/services/payroll-approval.service";
import { getReviewData } from "@/server/services/payroll-review.service";
import type { CompanyContext } from "@/server/tenant/context";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("payroll review & approval (integration)", () => {
  const prisma = getDb();
  const run = Date.now();
  const companyIds: string[] = [];
  const userIds: string[] = [];

  let ctx: CompanyContext;
  let positionId = "";
  let aminaId = "";
  let borisId = "";
  let dylanId = "";
  let julyId = "";
  let augustId = "";

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await disposeDb();
  });

  it("sets up a company, three employees, and finalizes July", async () => {
    const reg = await registerCompany({
      fullName: "Approval Admin",
      email: `ap-${run}-admin@payroll.test`,
      companyName: "Approval Test SARL",
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
    ctx = await buildCtx(reg.companyId);

    const dept = await createDepartment(ctx, { name: "Ops", description: undefined });
    positionId = (await createPosition(ctx, dept.id, { title: "Officer" })).id;

    aminaId = (
      await createEmployee(ctx, {
        firstName: "Amina",
        lastName: "Clean",
        positionId,
        dateHired: "2026-01-10",
        employmentType: "FULL_TIME",
        basicSalary: "850000",
      })
    ).id;
    await updatePaymentDetails(ctx, aminaId, {
      paymentMethod: "BANK",
      bankName: "Afriland",
      bankAccountNumber: "1111 2222 3333",
    });
    borisId = (
      await createEmployee(ctx, {
        firstName: "Boris",
        lastName: "Heavy",
        positionId,
        dateHired: "2026-01-10",
        employmentType: "FULL_TIME",
        basicSalary: "1200000",
      })
    ).id;
    await updatePaymentDetails(ctx, borisId, {
      paymentMethod: "BANK",
      bankName: "Afriland",
      bankAccountNumber: "4444 5555 6666",
    });
    dylanId = (
      await createEmployee(ctx, {
        firstName: "Dylan",
        lastName: "Advance",
        positionId,
        dateHired: "2026-01-10",
        employmentType: "FULL_TIME",
        basicSalary: "150000",
      })
    ).id; // no payment details on purpose

    // July: process → submit → approve (finalized history).
    julyId = (
      await createPeriod(ctx, {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        payDate: "2026-08-05",
        notes: undefined,
      })
    ).id;
    const julyRun = await processPayroll(ctx, julyId);
    // July nets: Amina 811750, Boris 1146000, Dylan 143250 → total 2101000
    expect(julyRun.totalNet).toBe("2101000");
    await submitPeriod(ctx, julyId);
    await approvePeriod(ctx, julyId);
    const july = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: julyId } });
    expect(july.status).toBe("APPROVED");
  });

  it("processes August with seeded outliers", async () => {
    augustId = (
      await createPeriod(ctx, {
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        payDate: "2026-09-05",
        notes: undefined,
      })
    ).id;
    // Amina: two identical bonuses (duplicate-entry anomaly), +2.35% net move.
    await createAdjustment(ctx, augustId, {
      employeeId: aminaId,
      type: "BONUS",
      amount: "10000",
      hours: undefined,
      note: "First entry",
    });
    await createAdjustment(ctx, augustId, {
      employeeId: aminaId,
      type: "BONUS",
      amount: "10000",
      hours: undefined,
      note: "Accidental double entry",
    });
    // Boris: 25 overtime hours (heavy-OT anomaly), +18.0% net move.
    await createAdjustment(ctx, augustId, {
      employeeId: borisId,
      type: "OVERTIME",
      hours: "25",
      amount: undefined,
      note: "Release crunch",
    });
    // Dylan: 20 000 advance (net −14.0%, missing payment details).
    await createAdjustment(ctx, augustId, {
      employeeId: dylanId,
      type: "ADVANCE",
      amount: "20000",
      hours: undefined,
      note: "Salary advance",
    });

    const result = await processPayroll(ctx, augustId);
    // Amina: gross 870000, tax 39150, net 830850
    // Boris: OT 216346 → gross 1416346, tax 63736, net 1352610
    // Dylan: gross 150000, deductions 26750, net 123250
    expect(result.totalGross).toBe("2436346");
    expect(result.totalDeductions).toBe("129636");
    expect(result.totalNet).toBe("2306710");
  });

  it("submits for approval with stamps and audit, refuses a second submit", async () => {
    const { name } = await submitPeriod(ctx, augustId);
    expect(name).toBe("August 2026");
    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: augustId } });
    expect(period.status).toBe("SUBMITTED");
    expect(period.submittedById).toBe(ctx.user.id);
    expect(period.submittedAt).not.toBeNull();

    await expect(submitPeriod(ctx, augustId)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Processing is frozen while submitted
    await expect(processPayroll(ctx, augustId)).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "payroll.submitted", entityId: augustId },
    });
    expect(auditRow.userId).toBe(ctx.user.id);
  });

  it("rejects back to READY only with a real note", async () => {
    await expect(rejectPeriod(ctx, augustId, "no")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const { name } = await rejectPeriod(
      ctx,
      augustId,
      "Transport allowance missing for Ops — please re-add.",
    );
    expect(name).toBe("August 2026");

    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: augustId } });
    expect(period.status).toBe("READY"); // back to review
    expect(period.submittedById).not.toBeNull(); // history of the submission kept

    const slips = await prisma.payslip.findMany({ where: { payrollPeriodId: augustId } });
    expect(new Set(slips.map((row) => row.status))).toEqual(new Set(["DRAFT"])); // untouched

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "payroll.rejected", entityId: augustId },
    });
    expect(auditRow.metadata).toMatchObject({ note: "Transport allowance missing for Ops — please re-add." });
  });

  it("approves, flips payslips to APPROVED and freezes everything", async () => {
    await submitPeriod(ctx, augustId);
    const { employees } = await approvePeriod(ctx, augustId);
    expect(employees).toBe(3);

    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: augustId } });
    expect(period.status).toBe("APPROVED");
    expect(period.approvedById).toBe(ctx.user.id);
    expect(period.approvedAt).not.toBeNull();

    const slips = await prisma.payslip.findMany({ where: { payrollPeriodId: augustId } });
    expect(new Set(slips.map((row) => row.status))).toEqual(new Set(["APPROVED"]));

    await expect(processPayroll(ctx, augustId)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(approvePeriod(ctx, augustId)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("review read-model reconciles and flags exactly the seeded outliers", async () => {
    const review = await getReviewData(ctx.company.id, augustId);
    expect(review).not.toBeNull();
    expect(review?.kpis.employees).toBe(3);
    expect(review?.kpis.gross).toBe("2436346");
    expect(review?.kpis.deductions).toBe("129636");
    expect(review?.kpis.net).toBe("2306710");
    expect(review?.kpis.previous?.name).toBe("July 2026");
    expect(review?.kpis.previous?.net).toBe("2101000");
    // 2306710 vs 2101000 → +9.8%
    expect(review?.kpis.netDeltaPct).toBe("+9.8%");

    expect(review?.trend.map((point) => [point.label, point.current])).toEqual([
      ["Jul 26", false],
      ["Aug 26", true],
    ]);
    expect(review?.deptCosts).toEqual([
      { departmentId: expect.any(String) as string, name: "Ops", employees: 3, gross: "2436346", net: "2306710" },
    ]);

    const byEmployee = new Map(
      review?.anomalies.map((row) => [`${row.employee?.id}:${row.code}`, row]) ?? [],
    );
    expect(review?.anomalies).toHaveLength(5);
    expect(byEmployee.get(`${aminaId}:DUPLICATE_ADJUSTMENT`)?.severity).toBe("warning");
    expect(byEmployee.get(`${borisId}:HIGH_OVERTIME`)?.message).toContain("25");
    expect(byEmployee.get(`${borisId}:NET_DELTA`)?.message).toContain("+18.0%");
    expect(byEmployee.get(`${dylanId}:NET_DELTA`)?.message).toContain("-14.0%");
    expect(byEmployee.get(`${dylanId}:MISSING_PAYMENT`)?.severity).toBe("warning");
    // Amina has NO net-delta flag (+2.35% only) and clean payment — important
    // non-false-positive: she is flagged ONLY for the duplicate bonus.
    expect(review?.anomalies.filter((row) => row.employee?.id === aminaId)).toHaveLength(1);
  });

  it("unlocks with a reasoned audit row, flips payslips back to DRAFT", async () => {
    await expect(unlockPeriod(ctx, augustId, "fix")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const { name } = await unlockPeriod(
      ctx,
      augustId,
      "Dylan's advance was 2 000 not 20 000 — correcting.",
    );
    expect(name).toBe("August 2026");

    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: augustId } });
    expect(period.status).toBe("READY");
    expect(period.unlockedById).toBe(ctx.user.id);
    expect(period.unlockReason).toBe("Dylan's advance was 2 000 not 20 000 — correcting.");

    const slips = await prisma.payslip.findMany({ where: { payrollPeriodId: augustId } });
    expect(new Set(slips.map((row) => row.status))).toEqual(new Set(["DRAFT"]));

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "payroll.unlocked", entityId: augustId },
    });
    expect(auditRow.metadata).toMatchObject({ reason: "Dylan's advance was 2 000 not 20 000 — correcting." });

    // And the engine may run again from READY
    const rerun = await processPayroll(ctx, augustId);
    expect(rerun.periodStatus).toBe("READY");
  });

  it("refuses to unlock once a payment succeeded (decision #9)", async () => {
    await submitPeriod(ctx, augustId);
    await approvePeriod(ctx, augustId);
    await prisma.payment.create({
      data: {
        companyId: ctx.company.id,
        payrollPeriodId: augustId,
        employeeId: aminaId,
        method: "BANK",
        amount: "830850",
        status: "SUCCESSFUL",
        paidAt: new Date(),
      },
    });
    await expect(unlockPeriod(ctx, augustId, "Trying anyway")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: augustId } });
    expect(period.status).toBe("APPROVED");
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
});
