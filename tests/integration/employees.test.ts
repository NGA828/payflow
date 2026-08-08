/**
 * Integration test for employee management against a real DB: auto codes,
 * encrypted payment columns, masking, status lifecycle, directory filters,
 * and tenant isolation. Enable with: RUN_DB_TESTS=1 npm test
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { getDb, disposeDb } from "@/lib/db";
import { registerCompany } from "@/server/services/onboarding.service";
import { createDepartment, createPosition } from "@/server/services/org.service";
import {
  createEmployee,
  getEmployeeDetail,
  listEmployees,
  setEmployeeStatus,
  terminateEmployee,
  updateEmployee,
  updatePaymentDetails,
} from "@/server/services/employee.service";
import { decryptString } from "@/server/security/crypto";
import type { CompanyContext } from "@/server/tenant/context";
import type { EmployeeFormInput } from "@/validations/employee";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("employee management (integration)", () => {
  const prisma = getDb();
  const run = Date.now();
  const companyIds: string[] = [];
  const userIds: string[] = [];

  let companyId = "";
  let otherCompanyId = "";
  let adminCtx: CompanyContext;
  let departmentId = "";
  let positionId = "";
  let otherPositionId = "";

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await disposeDb();
  });

  async function ctx(targetCompanyId: string): Promise<CompanyContext> {
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

  function form(overrides: Partial<EmployeeFormInput> = {}): EmployeeFormInput {
    return {
      firstName: "Amina",
      lastName: "Ngo Bell",
      positionId,
      dateHired: "2026-07-01",
      employmentType: "FULL_TIME",
      basicSalary: "450000",
      ...overrides,
    };
  }

  it("sets up two companies with departments and positions", async () => {
    const reg = await registerCompany({
      fullName: "HR Admin",
      email: `emp-${run}-admin@payroll.test`,
      companyName: "Employees Test SARL",
      password: "Secure#Pass23",
    });
    companyId = reg.companyId;
    companyIds.push(companyId);
    userIds.push(reg.userId);

    const other = await registerCompany({
      fullName: "Other Admin",
      email: `emp-${run}-other@payroll.test`,
      companyName: "Other Corp",
      password: "Secure#Pass23",
    });
    otherCompanyId = other.companyId;
    companyIds.push(otherCompanyId);
    userIds.push(other.userId);

    adminCtx = await ctx(companyId);
    const otherCtx = await ctx(otherCompanyId);

    const dept = await createDepartment(adminCtx, { name: "Operations", description: undefined });
    departmentId = dept.id;
    const pos = await createPosition(adminCtx, departmentId, { title: "Field Officer" });
    positionId = pos.id;

    const otherDept = await createDepartment(otherCtx, { name: "Finance", description: undefined });
    const otherPos = await createPosition(otherCtx, otherDept.id, { title: "Analyst" });
    otherPositionId = otherPos.id;

    expect(positionId).toBeTruthy();
    expect(otherPositionId).toBeTruthy();
  });

  it("creates employees with sequential auto codes and derived department", async () => {
    const first = await createEmployee(adminCtx, form());
    const second = await createEmployee(adminCtx, form({ firstName: "Boris", lastName: "Etoundi" }));
    expect(first.employeeCode).toBe("PB-0001");
    expect(second.employeeCode).toBe("PB-0002");

    const stored = await prisma.employee.findUniqueOrThrow({ where: { id: first.id } });
    expect(stored.departmentId).toBe(departmentId); // derived from the position
    expect(stored.basicSalary.toString()).toBe("450000");
    expect(stored.status).toBe("ACTIVE");
  });

  it("rejects foreign or unknown positions without touching tenant data", async () => {
    await expect(createEmployee(adminCtx, form({ positionId: otherPositionId }))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(createEmployee(adminCtx, form({ positionId: "missing" }))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("encrypts payment columns, masks by default, reveals only for sensitive readers", async () => {
    const created = await createEmployee(adminCtx, form({ firstName: "Carine", lastName: "Fotso" }));

    await updatePaymentDetails(adminCtx, created.id, {
      paymentMethod: "BANK",
      bankName: "Afriland First Bank",
      bankAccountNumber: "1002 3345 6789 4521",
    });

    const raw = await prisma.employee.findUniqueOrThrow({ where: { id: created.id } });
    expect(raw.bankAccountNumberEnc).toMatch(/^v1\./);
    expect(raw.bankAccountNumberEnc).not.toContain("4521");
    expect(decryptString(raw.bankAccountNumberEnc!)).toBe("1002 3345 6789 4521");

    // default: masked only
    const masked = await getEmployeeDetail(companyId, created.id, false);
    expect(masked?.payment.bankAccountNumber.masked).toBe("•••• 4521");
    expect(masked?.payment.bankAccountNumber.revealed).toBeNull();
    expect(masked?.payment.bankName).toBe("Afriland First Bank");
    expect(masked?.payment.complete).toBe(true);

    // sensitive readers can reveal
    const revealed = await getEmployeeDetail(companyId, created.id, true);
    expect(revealed?.payment.bankAccountNumber.revealed).toBe("1002 3345 6789 4521");

    // audit stores masks only, never plaintext
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { companyId, action: "employee.payment_updated", entityId: created.id },
    });
    const metadata = JSON.stringify(entry.metadata);
    expect(metadata).toContain("4521");
    expect(metadata).not.toContain("1002 3345 6789");
  });

  it("keeps stored secrets when fields are left empty, rotates ciphertext on change", async () => {
    const created = await createEmployee(adminCtx, form({ firstName: "Dylan", lastName: "Mbappe" }));
    await updatePaymentDetails(adminCtx, created.id, {
      paymentMethod: "BANK",
      bankName: "Société Générale",
      bankAccountNumber: "0011 2233 4455",
    });
    const before = await prisma.employee.findUniqueOrThrow({ where: { id: created.id } });

    // empty fields = keep current
    await updatePaymentDetails(adminCtx, created.id, { paymentMethod: "BANK" });
    const kept = await prisma.employee.findUniqueOrThrow({ where: { id: created.id } });
    expect(decryptString(kept.bankAccountNumberEnc!)).toBe("0011 2233 4455");

    // changing rotates the ciphertext for the same plaintext class of value
    await updatePaymentDetails(adminCtx, created.id, {
      paymentMethod: "BANK",
      bankAccountNumber: "9988 7766 5544",
    });
    const rotated = await prisma.employee.findUniqueOrThrow({ where: { id: created.id } });
    expect(rotated.bankAccountNumberEnc).not.toBe(before.bankAccountNumberEnc);
    expect(decryptString(rotated.bankAccountNumberEnc!)).toBe("9988 7766 5544");
  });

  it("clears stale secrets when switching payment methods, CASH wipes everything", async () => {
    const created = await createEmployee(adminCtx, form({ firstName: "Elise", lastName: "Kamga" }));
    await updatePaymentDetails(adminCtx, created.id, {
      paymentMethod: "BANK",
      bankName: "BICEC",
      bankAccountNumber: "5555 6666 7777",
    });

    await updatePaymentDetails(adminCtx, created.id, {
      paymentMethod: "MOBILE_MONEY",
      mobileMoneyProvider: "MTN",
      mobileMoneyNumber: "+237680112233",
    });
    let row = await prisma.employee.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.bankNameEnc).toBeNull();
    expect(row.bankAccountNumberEnc).toBeNull();
    expect(decryptString(row.mobileMoneyNumberEnc!)).toBe("+237680112233");

    await updatePaymentDetails(adminCtx, created.id, { paymentMethod: "CASH" });
    row = await prisma.employee.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.mobileMoneyNumberEnc).toBeNull();
    expect(row.mobileMoneyProvider).toBeNull();

    const detail = await getEmployeeDetail(companyId, created.id, false);
    expect(detail?.payment.complete).toBe(true); // CASH needs nothing
  });

  it("validates resulting-state completeness per method", async () => {
    const created = await createEmployee(adminCtx, form({ firstName: "Frank", lastName: "Etoa" }));
    await expect(
      updatePaymentDetails(adminCtx, created.id, { paymentMethod: "BANK", bankName: "BICEC" }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { bankAccountNumber: expect.any(Array) },
    });
    await expect(
      updatePaymentDetails(adminCtx, created.id, {
        paymentMethod: "MOBILE_MONEY",
        mobileMoneyProvider: "ORANGE",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { mobileMoneyNumber: expect.any(Array) },
    });
  });

  it("updates records and audits change flags", async () => {
    const created = await createEmployee(adminCtx, form({ firstName: "Gael", lastName: "Nkomo" }));
    await updateEmployee(adminCtx, created.id, form({ firstName: "Gaël", basicSalary: "500000" }));

    const stored = await prisma.employee.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.firstName).toBe("Gaël");
    expect(stored.basicSalary.toString()).toBe("500000");

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { companyId, action: "employee.updated", entityId: created.id },
    });
    expect(JSON.stringify(entry.metadata)).toContain('"salary":true');
  });

  it("runs the status lifecycle with proper guards", async () => {
    const created = await createEmployee(adminCtx, form({ firstName: "Herve", lastName: "Onana" }));

    await setEmployeeStatus(adminCtx, created.id, "INACTIVE");
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      "INACTIVE",
    );
    await setEmployeeStatus(adminCtx, created.id, "ACTIVE");
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      "ACTIVE",
    );

    // termination guards
    await expect(terminateEmployee(adminCtx, created.id, "2026-06-01")).rejects.toMatchObject({
      code: "VALIDATION", // predates the 2026-07-01 hire date
    });
    await expect(terminateEmployee(adminCtx, created.id, "2999-01-01")).rejects.toMatchObject({
      code: "VALIDATION", // future-dated
    });

    await terminateEmployee(adminCtx, created.id, "2026-08-05");
    const stored = await prisma.employee.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.status).toBe("TERMINATED");
    expect(stored.terminationDate?.toISOString().slice(0, 10)).toBe("2026-08-05");

    // terminated is one-way
    await expect(setEmployeeStatus(adminCtx, created.id, "ACTIVE")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(terminateEmployee(adminCtx, created.id, "2026-08-06")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("filters, searches and gates the directory by sensitivity", async () => {
    const base = {
      search: undefined,
      departmentId: undefined,
      page: 1,
    };

    const active = await listEmployees(adminCtx, { ...base, status: "ACTIVE" }, false);
    expect(active.items.length).toBeGreaterThan(0);
    expect(active.items.every((item) => item.status === "ACTIVE")).toBe(true);
    // non-sensitive readers never see salaries
    expect(active.items.every((item) => item.basicSalary === null)).toBe(true);

    const sensitive = await listEmployees(adminCtx, { ...base, status: "ALL" }, true);
    expect(sensitive.items.some((item) => item.basicSalary !== null)).toBe(true);
    expect(sensitive.items.some((item) => item.status === "TERMINATED")).toBe(true);

    // search by code (case-insensitive), by name
    const byCode = await listEmployees(
      adminCtx,
      { ...base, status: "ALL", search: "pb-0001" },
      false,
    );
    expect(byCode.items).toHaveLength(1);
    expect(byCode.items[0]?.employeeCode).toBe("PB-0001");

    const byName = await listEmployees(adminCtx, { ...base, status: "ALL", search: "ngo bell" }, false);
    expect(byName.items.some((item) => item.employeeCode === "PB-0001")).toBe(true);

    const byDepartment = await listEmployees(
      adminCtx,
      { ...base, status: "ALL", departmentId },
      false,
    );
    expect(byDepartment.total).toBeGreaterThan(0);
  });

  it("paginates at 20 per page", async () => {
    const reg = await registerCompany({
      fullName: "Bulk Admin",
      email: `emp-${run}-bulk@payroll.test`,
      companyName: "Bulk People SARL",
      password: "Secure#Pass23",
    });
    companyIds.push(reg.companyId);
    userIds.push(reg.userId);
    const bulkCtx = await ctx(reg.companyId);
    const dept = await createDepartment(bulkCtx, { name: "Sales", description: undefined });
    const pos = await createPosition(bulkCtx, dept.id, { title: "Rep" });

    for (let index = 0; index < 21; index += 1) {
      await createEmployee(bulkCtx, {
        firstName: `Bulk${index}`,
        lastName: "Rep",
        positionId: pos.id,
        dateHired: "2026-07-01",
        employmentType: "CONTRACT",
        basicSalary: "200000",
      });
    }

    const page1 = await listEmployees(
      bulkCtx,
      { search: undefined, status: "ACTIVE", departmentId: undefined, page: 1 },
      false,
    );
    expect(page1.items).toHaveLength(20);
    expect(page1.total).toBe(21);
    expect(page1.totalPages).toBe(2);

    const page2 = await listEmployees(
      bulkCtx,
      { search: undefined, status: "ACTIVE", departmentId: undefined, page: 2 },
      false,
    );
    expect(page2.items).toHaveLength(1);

    // out-of-range pages clamp to the last page; codes kept sequencing 1..21
    // across both pages regardless of name-sort order.
    const page99 = await listEmployees(
      bulkCtx,
      { search: undefined, status: "ACTIVE", departmentId: undefined, page: 99 },
      false,
    );
    expect(page99.page).toBe(2);
    const allCodes = [...page1.items, ...page2.items].map((item) => item.employeeCode).sort();
    expect(allCodes).toEqual(
      Array.from({ length: 21 }, (_, index) => `PB-${String(index + 1).padStart(4, "0")}`),
    );
  });

  it("keeps tenant isolation on reads and mutations", async () => {
    const ours = await prisma.employee.findFirstOrThrow({
      where: { companyId },
      orderBy: { employeeCode: "asc" },
    });
    expect(await getEmployeeDetail(otherCompanyId, ours.id, true)).toBeNull();

    const otherCtx = await ctx(otherCompanyId);
    await expect(updateEmployee(otherCtx, ours.id, form())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(setEmployeeStatus(otherCtx, ours.id, "INACTIVE")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(terminateEmployee(otherCtx, ours.id, "2026-08-01")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      updatePaymentDetails(otherCtx, ours.id, { paymentMethod: "CASH" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
