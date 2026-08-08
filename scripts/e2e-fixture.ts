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
import { createInitialDepartments, createPosition } from "@/server/services/org.service";
import { completeSetup } from "@/server/services/setup.service";
import { createEmployee, setEmployeeStatus, updatePaymentDetails } from "@/server/services/employee.service";
import { acceptInvitationAsNewUser, inviteTeamMembers } from "@/server/services/invitation.service";
import { generateToken } from "@/server/auth/tokens";
import type { CompanyContext } from "@/server/tenant/context";

export const E2E_USER = {
  email: "e2e@check.test",
  password: "E2ePass#2026",
  fullName: "E2E Verifier",
  companyName: "E2E Check SARL",
};

/** Accountant member — payroll periods/processing are accountant-only. */
export const E2E_ACCOUNTANT = {
  email: "acc@e2e.test",
  password: "AccPass#2026!",
  fullName: "Adam Accountant",
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
    console.log("Fixture account already set up — ensuring demo employees.");
  } else {
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
  }

  // Demo employees for manual E2E — idempotent (skipped once any exist).
  const employeeCount = await db.employee.count({ where: { companyId } });
  if (employeeCount === 0) {
  const departments = await db.department.findMany({
    where: { companyId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
  const byName = new Map(departments.map((d) => [d.name, d.id]));

  async function ensurePosition(departmentName: string, title: string): Promise<string> {
    const departmentId = byName.get(departmentName);
    if (!departmentId) throw new Error(`Fixture department missing: ${departmentName}`);
    const existing = await db.position.findFirst({
      where: { companyId, departmentId, title },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await createPosition(ctx, departmentId, { title });
    return created.id;
  }

  const positions = {
    opsManager: await ensurePosition("Operations", "Operations Manager"),
    fieldOfficer: await ensurePosition("Operations", "Field Officer"),
    accountant: await ensurePosition("Finance", "Senior Accountant"),
    engineer: await ensurePosition("Engineering", "Software Engineer"),
  };

  const amina = await createEmployee(ctx, {
    firstName: "Amina",
    lastName: "Ngo Bell",
    email: "amina.ngobell@example.cm",
    phone: "+237 690 11 22 33",
    positionId: positions.opsManager,
    dateHired: "2024-02-01",
    employmentType: "FULL_TIME",
    basicSalary: "850000",
  });
  await updatePaymentDetails(ctx, amina.id, {
    paymentMethod: "BANK",
    bankName: "Afriland First Bank",
    bankAccountNumber: "1002 3345 6789 4521",
  });

  await createEmployee(ctx, {
    firstName: "Boris",
    lastName: "Etoundi",
    email: "boris.etoundi@example.cm",
    positionId: positions.engineer,
    dateHired: "2025-05-12",
    employmentType: "FULL_TIME",
    basicSalary: "1200000",
  });
  const boris = await db.employee.findFirstOrThrow({
    where: { companyId, firstName: "Boris", lastName: "Etoundi" },
  });
  await updatePaymentDetails(ctx, boris.id, {
    paymentMethod: "MOBILE_MONEY",
    mobileMoneyProvider: "MTN",
    mobileMoneyNumber: "+237680334455",
  });

  const carine = await createEmployee(ctx, {
    firstName: "Carine",
    lastName: "Fotso",
    positionId: positions.accountant,
    dateHired: "2026-06-15",
    employmentType: "CONTRACT",
    basicSalary: "620000",
  });
  await setEmployeeStatus(ctx, carine.id, "INACTIVE");

  await createEmployee(ctx, {
    firstName: "Dylan",
    lastName: "Mbappe",
    positionId: positions.fieldOfficer,
    dateHired: "2026-07-01",
    employmentType: "INTERN",
    basicSalary: "150000",
  });

  console.log("Demo employees created (PB-0001..PB-0004: bank, momo, inactive, missing payment).");

  }

  // Demo accountant (idempotent) — needed because only ACCOUNTANTs manage
  // payroll periods, and the admin can't process payroll themselves.
  const accUser = await db.user.findUnique({ where: { email: E2E_ACCOUNTANT.email } });
  if (!accUser) {
    await inviteTeamMembers(ctx, [E2E_ACCOUNTANT.email], "ACCOUNTANT");
    const invite = await db.invitation.findFirstOrThrow({
      where: { companyId, email: E2E_ACCOUNTANT.email, acceptedAt: null, revokedAt: null },
    });
    const known = generateToken();
    await db.invitation.update({ where: { id: invite.id }, data: { tokenHash: known.hash } });
    const accepted = await acceptInvitationAsNewUser(
      known.raw,
      E2E_ACCOUNTANT.fullName,
      E2E_ACCOUNTANT.password,
    );
    await db.user.update({ where: { id: accepted.userId }, data: { emailVerifiedAt: new Date() } });
    console.log(`Demo accountant created: ${E2E_ACCOUNTANT.email} / ${E2E_ACCOUNTANT.password}`);
  }

  // Demo payroll period + adjustments (idempotent) — input for payroll E2E.
  const { createPeriod } = await import("@/server/services/payroll-period.service");
  const { createAdjustment } = await import("@/server/services/adjustment.service");

  let period = await db.payrollPeriod.findFirst({
    where: { companyId, name: "August 2026" },
  });
  if (!period) {
    const created = await createPeriod(ctx, {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      payDate: "2026-09-05",
      notes: undefined,
    });
    period = await db.payrollPeriod.findUniqueOrThrow({ where: { id: created.id } });
    console.log("Demo period created: August 2026 (DRAFT)");
  }

  const adjustmentCount = await db.payrollAdjustment.count({
    where: { companyId, payrollPeriodId: period.id },
  });
  if (adjustmentCount === 0) {
    const byCode = new Map(
      (
        await db.employee.findMany({
          where: { companyId },
          select: { id: true, employeeCode: true },
        })
      ).map((employee) => [employee.employeeCode, employee.id]),
    );
    const aminaId = byCode.get("PB-0001");
    const borisId = byCode.get("PB-0002");
    const dylanId = byCode.get("PB-0004");
    if (aminaId && borisId && dylanId && period.status === "DRAFT") {
      await createAdjustment(ctx, period.id, {
        employeeId: aminaId,
        type: "BONUS",
        amount: "50000",
        note: "Retention bonus",
      });
      await createAdjustment(ctx, period.id, {
        employeeId: borisId,
        type: "OVERTIME",
        amount: "64904",
        hours: "7.5",
        note: "Release weekend",
      });
      await createAdjustment(ctx, period.id, {
        employeeId: dylanId,
        type: "ADVANCE",
        amount: "20000",
        note: "Salary advance",
      });
      console.log("Demo adjustments created (bonus, overtime, advance).");
    }
  }

  console.log(`Fixture ready: ${E2E_USER.email} / ${E2E_USER.password} (${E2E_USER.companyName})`);
  await disposeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
