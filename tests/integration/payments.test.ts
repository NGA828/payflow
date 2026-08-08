/**
 * Integration test for payments: materialization at approval, CSV export with
 * server-side decrypt, status updates (fail/retry/succeed), auto APPROVED→PAID
 * transition, lock, delete-on-unlock + rematerialization, tenant isolation.
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
import { approvePeriod, submitPeriod, unlockPeriod } from "@/server/services/payroll-approval.service";
import {
  buildPaymentsExport,
  ensurePayments,
  listPayments,
  lockPeriod,
  updatePaymentStatus,
} from "@/server/services/payment.service";
import type { CompanyContext } from "@/server/tenant/context";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("payments (integration)", () => {
  const prisma = getDb();
  const run = Date.now();
  const companyIds: string[] = [];
  const userIds: string[] = [];

  let ctx: CompanyContext;
  let otherCtx: CompanyContext;
  let positionId = "";
  let aminaId = "";
  let borisId = "";
  let dylanId = "";
  let augustId = "";
  let aminaPaymentId = "";
  let borisPaymentId = "";
  let dylanPaymentId = "";

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

  it("sets up a company and approves August", async () => {
    const reg = await registerCompany({
      fullName: "Payments Admin",
      email: `pm-${run}-admin@payroll.test`,
      companyName: "Payments Test SARL",
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

    const other = await registerCompany({
      fullName: "Foreign Admin",
      email: `pm-${run}-foreign@payroll.test`,
      companyName: "Foreign Co",
      password: "Secure#Pass23",
    });
    companyIds.push(other.companyId);
    userIds.push(other.userId);
    otherCtx = await buildCtx(other.companyId);

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
      bankAccountNumber: "1002 3345 6789 4521",
    });
    borisId = (
      await createEmployee(ctx, {
        firstName: "Boris",
        lastName: "Etoundi",
        positionId,
        dateHired: "2026-01-10",
        employmentType: "FULL_TIME",
        basicSalary: "1200000",
      })
    ).id;
    await updatePaymentDetails(ctx, borisId, {
      paymentMethod: "MOBILE_MONEY",
      mobileMoneyProvider: "MTN",
      mobileMoneyNumber: "+237680334455",
    });
    dylanId = (
      await createEmployee(ctx, {
        firstName: "Dylan",
        lastName: "Mbappe",
        positionId,
        dateHired: "2026-01-10",
        employmentType: "FULL_TIME",
        basicSalary: "150000",
      })
    ).id; // payment details missing

    augustId = (
      await createPeriod(ctx, {
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        payDate: "2026-09-05",
        notes: undefined,
      })
    ).id;
    await createAdjustment(ctx, augustId, {
      employeeId: dylanId,
      type: "ADVANCE",
      amount: "20000",
      hours: undefined,
      note: "Salary advance",
    });
    await processPayroll(ctx, augustId);
    await submitPeriod(ctx, augustId);
    await approvePeriod(ctx, augustId);
    expect(aminaId).not.toBe(borisId);
  });

  it("materialized one PENDING payment per payslip at approval", async () => {
    const payments = await prisma.payment.findMany({
      where: { payrollPeriodId: augustId },
      include: { employee: { select: { employeeCode: true } } },
    });
    expect(payments).toHaveLength(3);
    expect(new Set(payments.map((row) => row.status))).toEqual(new Set(["PENDING"]));
    const byCode = new Map(payments.map((row) => [row.employee.employeeCode, row]));
    expect(byCode.get("PB-0001")?.amount.toString()).toBe("811750");
    expect(byCode.get("PB-0001")?.method).toBe("BANK");
    expect(byCode.get("PB-0002")?.amount.toString()).toBe("1146000");
    expect(byCode.get("PB-0002")?.method).toBe("MOBILE_MONEY");
    expect(byCode.get("PB-0003")?.amount.toString()).toBe("123250");
    aminaPaymentId = byCode.get("PB-0001")!.id;
    borisPaymentId = byCode.get("PB-0002")!.id;
    dylanPaymentId = byCode.get("PB-0003")!.id;

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "payroll.approved", entityId: augustId },
    });
    expect(auditRow.metadata).toMatchObject({ paymentsCreated: 3 });

    // Idempotent backfill is a no-op
    await expect(ensurePayments(ctx.company.id, augustId)).resolves.toBe(0);

    const board = await listPayments(ctx.company.id, augustId);
    expect(board.totals.pending).toEqual({ count: 3, amount: "2081000" });
    expect(board.totals.successful).toEqual({ count: 0, amount: "0" });
  });

  it("exports the exact instruction CSV with decrypted destinations", async () => {
    const exported = await buildPaymentsExport(ctx, augustId);
    expect(exported.filename).toBe("payflow-payments-august-2026.csv");
    expect(exported.rowCount).toBe(3);
    expect(exported.csv).toBe(
      [
        "reference,employee_code,employee_name,method,bank_or_provider,account_or_msisdn,amount,pay_date,period",
        "PAY-2026-08-PB-0001,PB-0001,Amina Clean,BANK,Afriland,1002 3345 6789 4521,811750,2026-09-05,August 2026",
        "PAY-2026-08-PB-0002,PB-0002,Boris Etoundi,MOBILE_MONEY,MTN,+237680334455,1146000,2026-09-05,August 2026",
        "PAY-2026-08-PB-0003,PB-0003,Dylan Mbappe,BANK,,,123250,2026-09-05,August 2026",
        "",
      ].join("\r\n"),
    );
    expect(exported.csv).not.toContain("v1."); // never leaks ciphertext

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "payment.exported", entityId: augustId },
    });
    expect(auditRow.metadata).toMatchObject({ rows: 3 });
  });

  it("records a failure (reason required), keeps the period APPROVED", async () => {
    await expect(
      updatePaymentStatus(ctx, dylanPaymentId, { outcome: "FAILED", failureReason: "no" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const result = await updatePaymentStatus(ctx, dylanPaymentId, {
      outcome: "FAILED",
      failureReason: "Mobile money number unreachable",
    });
    expect(result.periodNowPaid).toBe(false);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: dylanPaymentId } });
    expect(payment.status).toBe("FAILED");
    expect(payment.failureReason).toBe("Mobile money number unreachable");
    expect(payment.paidAt).toBeNull();

    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: augustId } });
    expect(period.status).toBe("APPROVED");
  });

  it("marks payments successful; the last one flips the period to PAID", async () => {
    const paid = await updatePaymentStatus(ctx, aminaPaymentId, {
      outcome: "SUCCESSFUL",
      reference: "AFR-884221",
    });
    expect(paid.periodNowPaid).toBe(false);
    const amina = await prisma.payment.findUniqueOrThrow({ where: { id: aminaPaymentId } });
    expect(amina.status).toBe("SUCCESSFUL");
    expect(amina.reference).toBe("AFR-884221");
    expect(amina.paidAt).not.toBeNull();
    expect(amina.recordedById).toBe(ctx.user.id);

    // Successful is final
    await expect(
      updatePaymentStatus(ctx, aminaPaymentId, { outcome: "FAILED", failureReason: "Trying" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await updatePaymentStatus(ctx, borisPaymentId, { outcome: "SUCCESSFUL" });
    const last = await updatePaymentStatus(ctx, dylanPaymentId, {
      outcome: "SUCCESSFUL",
      reference: "RETRY-01", // retry after failure — failureReason is cleared
    });
    expect(last.periodNowPaid).toBe(true);

    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: augustId } });
    expect(period.status).toBe("PAID");
    const dylan = await prisma.payment.findUniqueOrThrow({ where: { id: dylanPaymentId } });
    expect(dylan.status).toBe("SUCCESSFUL");
    expect(dylan.failureReason).toBeNull();

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "payroll.marked_paid", entityId: augustId },
    });
    expect(auditRow.metadata).toMatchObject({ payments: 3 });

    const board = await listPayments(ctx.company.id, augustId);
    expect(board.totals.successful).toEqual({ count: 3, amount: "2081000" });

    // Nothing left to instruct
    const exported = await buildPaymentsExport(ctx, augustId);
    expect(exported.rowCount).toBe(0);
  });

  it("locks the PAID period forever", async () => {
    // Updates are frozen once PAID (period no longer APPROVED)
    await expect(
      updatePaymentStatus(ctx, borisPaymentId, { outcome: "SUCCESSFUL" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const { name } = await lockPeriod(ctx, augustId);
    expect(name).toBe("August 2026");
    const period = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: augustId } });
    expect(period.status).toBe("LOCKED");
    expect(period.lockedAt).not.toBeNull();

    await expect(lockPeriod(ctx, augustId)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "payroll.locked", entityId: augustId },
    });
    expect(auditRow.userId).toBe(ctx.user.id);
  });

  it("unlock deletes un-paid payments and re-approval rematerializes them", async () => {
    const septemberId = (
      await createPeriod(ctx, {
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        payDate: "2026-10-05",
        notes: undefined,
      })
    ).id;
    await processPayroll(ctx, septemberId);
    await submitPeriod(ctx, septemberId);
    await approvePeriod(ctx, septemberId);
    const created = await prisma.payment.count({ where: { payrollPeriodId: septemberId } });
    expect(created).toBe(3);

    await unlockPeriod(ctx, septemberId, "Amina's September bonus is missing.");
    expect(await prisma.payment.count({ where: { payrollPeriodId: septemberId } })).toBe(0);

    await submitPeriod(ctx, septemberId);
    await approvePeriod(ctx, septemberId);
    const rematerialized = await prisma.payment.count({
      where: { payrollPeriodId: septemberId, status: "PENDING" },
    });
    expect(rematerialized).toBe(3);
  });

  it("keeps tenants isolated", async () => {
    await expect(buildPaymentsExport(otherCtx, augustId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      updatePaymentStatus(otherCtx, aminaPaymentId, { outcome: "SUCCESSFUL" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listPayments(otherCtx.company.id, augustId)).rows).toHaveLength(0);
    expect(await ensurePayments(otherCtx.company.id, augustId)).toBe(0);
  });
});
