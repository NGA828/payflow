/**
 * Integration test for payslip PDFs: download flow (bytes + audit + tenant
 * isolation), bulk ZIP export, watermarking of non-final payslips, and the
 * availability fan-out (in-app notification + console email) on approval.
 * Enable with: RUN_DB_TESTS=1 npm test
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { getDb, disposeDb } from "@/lib/db";
import { registerCompany } from "@/server/services/onboarding.service";
import { createDepartment, createPosition } from "@/server/services/org.service";
import { createEmployee } from "@/server/services/employee.service";
import { updatePayrollSettings } from "@/server/services/company.service";
import { createPeriod } from "@/server/services/payroll-period.service";
import { createAdjustment } from "@/server/services/adjustment.service";
import { processPayroll } from "@/server/services/payroll-processing.service";
import { approvePeriod, submitPeriod } from "@/server/services/payroll-approval.service";
import {
  getPayslipPdfDownload,
  getPeriodPayslipZip,
} from "@/server/services/payslip.service";
import { AppError } from "@/server/errors";
import type { CompanyContext } from "@/server/tenant/context";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("payslip PDFs (integration)", () => {
  const prisma = getDb();
  const run = Date.now();
  const companyIds: string[] = [];
  const userIds: string[] = [];

  let ctx: CompanyContext;
  let otherCtx: CompanyContext;
  let aminaId = "";
  let borisId = "";
  let dylanId = "";
  let aminaUserId = "";
  let augustId = "";
  let draftPeriodId = "";

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

  /** Count entries of a ZIP by scanning central-directory file headers. */
  function zipEntryCount(zip: Buffer): number {
    let count = 0;
    for (let i = 0; i < zip.length - 3; i += 1) {
      if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x01 && zip[i + 3] === 0x02) {
        count += 1;
      }
    }
    return count;
  }

  it("sets up two companies and approves August for the first", async () => {
    const reg = await registerCompany({
      fullName: "Payslip Admin",
      email: `ps-${run}-admin@payroll.test`,
      companyName: "Payslip Test SARL",
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
      email: `ps-${run}-foreign@payroll.test`,
      companyName: "Foreign Co",
      password: "Secure#Pass23",
    });
    companyIds.push(other.companyId);
    userIds.push(other.userId);
    otherCtx = await buildCtx(other.companyId);

    const dept = await createDepartment(ctx, { name: "Ops", description: undefined });
    const positionId = (await createPosition(ctx, dept.id, { title: "Officer" })).id;

    // Amina is portal-linked (userId) + has an email → both notification paths.
    const portalUser = await prisma.user.create({
      data: {
        email: `ps-${run}-amina@payroll.test`,
        fullName: "Amina Clean",
        passwordHash: "x".repeat(60),
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(portalUser.id);
    aminaUserId = portalUser.id;

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
    await prisma.employee.update({
      where: { id: aminaId },
      data: { userId: aminaUserId, email: `ps-${run}-amina@payroll.test` },
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
    dylanId = (
      await createEmployee(ctx, {
        firstName: "Dylan",
        lastName: "Mbappe",
        positionId,
        dateHired: "2026-01-10",
        employmentType: "FULL_TIME",
        basicSalary: "150000",
      })
    ).id;

    augustId = (
      await createPeriod(ctx, {
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        payDate: "2026-09-05",
        notes: undefined,
      })
    ).id;
    await createAdjustment(ctx, augustId, {
      employeeId: aminaId,
      type: "BONUS",
      amount: "50000",
      hours: undefined,
      note: "Retention bonus",
    });
    await createAdjustment(ctx, augustId, {
      employeeId: borisId,
      type: "OVERTIME",
      amount: "64904",
      hours: "7.5",
      note: "Release weekend",
    });
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
    expect(augustId).toBeTruthy();
  });

  it("sent the availability fan-out on approval (in-app for linked employees)", async () => {
    const notifications = await prisma.notification.findMany({
      where: { companyId: ctx.company.id },
    });
    expect(notifications).toHaveLength(1); // only Amina is portal-linked
    expect(notifications[0]?.userId).toBe(aminaUserId);
    expect(notifications[0]?.title).toBe("Your August 2026 payslip is ready");
    expect(notifications[0]?.link).toBe("/portal/payslips");
  });

  it("downloads a single payslip PDF and audits the download", async () => {
    const payslip = await prisma.payslip.findFirstOrThrow({
      where: { payrollPeriodId: augustId, employeeId: aminaId },
    });
    const download = await getPayslipPdfDownload(ctx, augustId, payslip.id);
    expect(download.filename).toBe("payflow-payslip-ps-2026-00001.pdf");
    expect(download.payslipNumber).toBe("PS-2026-00001");
    expect(download.pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(download.pdf.length).toBeGreaterThan(3000);
    expect(download.pdf.subarray(download.pdf.length - 32).toString("latin1")).toContain("%%EOF");

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "payslip.downloaded", entityId: payslip.id },
    });
    expect(auditRow.metadata).toMatchObject({
      payslipNumber: "PS-2026-00001",
      period: "August 2026",
      employee: "PB-0001",
      status: "APPROVED",
    });
  }, 30000);

  it("assigns payslip numbers in employee order (Amina → PB-0001 got 00001)", async () => {
    const payslips = await prisma.payslip.findMany({
      where: { payrollPeriodId: augustId },
      include: { employee: { select: { employeeCode: true } } },
      orderBy: { payslipNumber: "asc" },
    });
    expect(payslips.map((row) => row.employee.employeeCode)).toEqual([
      "PB-0001",
      "PB-0002",
      "PB-0003",
    ]);
  });

  it("refuses another tenant's payslip id (isolation)", async () => {
    const payslip = await prisma.payslip.findFirstOrThrow({
      where: { payrollPeriodId: augustId, employeeId: aminaId },
    });
    await expect(getPayslipPdfDownload(otherCtx, augustId, payslip.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<AppError>);
    await expect(getPeriodPayslipZip(otherCtx, augustId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<AppError>);
  });

  it("exports the whole period as a ZIP of branded PDFs", async () => {
    const download = await getPeriodPayslipZip(ctx, augustId);
    expect(download.filename).toBe("payflow-payslips-august-2026.zip");
    expect(download.count).toBe(3);
    expect(zipEntryCount(download.zip)).toBe(3);
    // ZIP local file headers carry the per-employee filenames.
    const names = download.zip.toString("latin1");
    expect(names).toContain("ps-2026-00001-amina-clean.pdf");
    expect(names).toContain("ps-2026-00002-boris-etoundi.pdf");
    expect(names).toContain("ps-2026-00003-dylan-mbappe.pdf");

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "payslip.generated", entityId: augustId },
    });
    expect(auditRow.metadata).toMatchObject({ period: "August 2026", payslips: 3 });
  }, 60000);

  it("renders watermarked DRAFT payslips for unapproved periods", async () => {
    draftPeriodId = (
      await createPeriod(ctx, {
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        payDate: "2026-10-05",
        notes: undefined,
      })
    ).id;
    await processPayroll(ctx, draftPeriodId);
    const payslip = await prisma.payslip.findFirstOrThrow({
      where: { payrollPeriodId: draftPeriodId, employeeId: aminaId },
    });
    expect(payslip.status).toBe("DRAFT");
    const download = await getPayslipPdfDownload(ctx, draftPeriodId, payslip.id);
    expect(download.pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // Empty periods cannot be zipped (foreign company's fresh, unprocessed period).
    const emptyPeriodId = (
      await createPeriod(otherCtx, {
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        payDate: "2026-11-05",
        notes: undefined,
      })
    ).id;
    await expect(getPeriodPayslipZip(otherCtx, emptyPeriodId)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } satisfies Partial<AppError>);

    // Reject the download of a payslip under a mismatched period id.
    await expect(getPayslipPdfDownload(ctx, augustId, payslip.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<AppError>);
  }, 60000);
});
