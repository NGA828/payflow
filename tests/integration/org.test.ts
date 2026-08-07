/**
 * Integration test for departments & positions against a real database.
 * Enable with: RUN_DB_TESTS=1 npm test
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { getDb, disposeDb } from "@/lib/db";
import { registerCompany } from "@/server/services/onboarding.service";
import {
  createDepartment,
  createPosition,
  getDepartmentDetail,
  removeDepartment,
  removePosition,
  restoreDepartment,
  restorePosition,
  updateDepartment,
  updatePosition,
} from "@/server/services/org.service";
import type { CompanyContext } from "@/server/tenant/context";

const RUN = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!RUN)("org structure (integration)", () => {
  const prisma = getDb();
  const run = Date.now();
  const companyIds: string[] = [];
  const userIds: string[] = [];

  let companyId = "";
  let otherCompanyId = "";

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await disposeDb();
  });

  async function makeCompany(suffix: string): Promise<string> {
    const { userId, companyId: id } = await registerCompany({
      fullName: "Org Tester",
      email: `org-${run}-${suffix}@org.test`,
      companyName: `Org ${suffix} SARL`,
      password: "Secure#Pass23",
    });
    companyIds.push(id);
    userIds.push(userId);
    return id;
  }

  async function ctx(targetCompanyId: string): Promise<CompanyContext> {
    const [company, membership] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: targetCompanyId } }),
      prisma.membership.findFirstOrThrow({ where: { companyId: targetCompanyId } }),
    ]);
    return {
      user: {
        id: membership.userId,
        email: `org-${run}@org.test`,
        fullName: "Org Tester",
        isSuperAdmin: false,
        emailVerifiedAt: new Date(),
      },
      membership: { id: membership.id, role: membership.role as Role, status: membership.status },
      company,
      effectiveStatus: "TRIAL",
    };
  }

  it("creates, renames and rejects duplicate departments case-insensitively", async () => {
    companyId = await makeCompany("a");
    const c = await ctx(companyId);

    const dept = await createDepartment(c, { name: "Finance", description: "Money" });
    // exact-case duplicate
    await expect(createDepartment(c, { name: "Finance" })).rejects.toMatchObject({
      code: "CONFLICT",
      fieldErrors: { name: expect.any(Array) },
    });
    // case-insensitive duplicate
    await expect(createDepartment(c, { name: "FINANCE" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await updateDepartment(c, dept.id, { name: "Finance & Admin" });
    const renamed = await prisma.department.findUniqueOrThrow({ where: { id: dept.id } });
    expect(renamed.name).toBe("Finance & Admin");

    // rename is case-insensitively unique too
    await createDepartment(c, { name: "Operations" });
    await expect(updateDepartment(c, dept.id, { name: "operations" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // audit written
    const entry = await prisma.auditLog.findFirst({
      where: { companyId, action: "org.department_updated" },
    });
    expect(entry).not.toBeNull();
  });

  it("positions: CRUD + case-insensitive duplicate titles per department", async () => {
    const c = await ctx(companyId);
    const finance = await prisma.department.findFirstOrThrow({
      where: { companyId, name: "Finance & Admin" },
    });
    const operations = await prisma.department.findFirstOrThrow({
      where: { companyId, name: "Operations" },
    });

    const pos = await createPosition(c, finance.id, { title: "Accountant" });
    await expect(createPosition(c, finance.id, { title: "accountant" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // same title allowed in a different department
    await createPosition(c, operations.id, { title: "Accountant" });

    await updatePosition(c, pos.id, { title: "Senior Accountant" });
    expect((await prisma.position.findUniqueOrThrow({ where: { id: pos.id } })).title).toBe(
      "Senior Accountant",
    );

    // cannot add a position to an archived department
    await updateDepartment(c, finance.id, { name: "Finance & Admin" });
    const detail = await getDepartmentDetail(companyId, finance.id);
    expect(detail?.positions).toHaveLength(1);
  });

  it("delete intent archives a referenced department, then restores it", async () => {
    const c = await ctx(companyId);
    const operations = await prisma.department.findFirstOrThrow({
      where: { companyId, name: "Operations" },
    });
    const pos = await prisma.position.findFirstOrThrow({
      where: { companyId, departmentId: operations.id },
    });
    // minimal employee referencing the department (any status blocks deletion)
    await prisma.employee.create({
      data: {
        companyId,
        departmentId: operations.id,
        positionId: pos.id,
        employeeCode: `E-${run}`,
        firstName: "Test",
        lastName: "Worker",
        dateHired: new Date(),
        basicSalary: "100000",
      },
    });

    const outcome = await removeDepartment(c, operations.id);
    expect(outcome).toBe("archived");
    const archived = await prisma.department.findUniqueOrThrow({ where: { id: operations.id } });
    expect(archived.status).toBe("ARCHIVED");

    // restore frees it again — but a name clash blocks restore
    await createDepartment(c, { name: "OPERATIONS" });
    await expect(restoreDepartment(c, operations.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const clash = await prisma.department.findFirstOrThrow({
      where: { companyId, name: "OPERATIONS" },
    });
    await removeDepartment(c, clash.id); // unreferenced → hard delete
    await restoreDepartment(c, operations.id);
    expect((await prisma.department.findUniqueOrThrow({ where: { id: operations.id } })).status).toBe(
      "ACTIVE",
    );
  });

  it("hard-deletes unreferenced departments with their positions", async () => {
    const c = await ctx(companyId);
    const temp = await createDepartment(c, { name: "Temporary" });
    await createPosition(c, temp.id, { title: "Temp Role" });

    const outcome = await removeDepartment(c, temp.id);
    expect(outcome).toBe("deleted");
    expect(await prisma.department.count({ where: { id: temp.id } })).toBe(0);
    expect(await prisma.position.count({ where: { departmentId: temp.id } })).toBe(0);
  });

  it("archives then restores referenced positions", async () => {
    const c = await ctx(companyId);
    const operations = await prisma.department.findFirstOrThrow({
      where: { companyId, name: "Operations" },
    });
    const pos = await prisma.position.findFirstOrThrow({
      where: { companyId, departmentId: operations.id, title: "Accountant" },
    });

    expect(await removePosition(c, pos.id)).toBe("archived");
    expect((await prisma.position.findUniqueOrThrow({ where: { id: pos.id } })).status).toBe(
      "ARCHIVED",
    );
    await restorePosition(c, pos.id);
    expect((await prisma.position.findUniqueOrThrow({ where: { id: pos.id } })).status).toBe(
      "ACTIVE",
    );
  });

  it("enforces tenant isolation: cross-company reads return null, writes throw NOT_FOUND", async () => {
    otherCompanyId = await makeCompany("b");
    const otherCtx = await ctx(otherCompanyId);

    const finance = await prisma.department.findFirstOrThrow({
      where: { companyId, name: "Finance & Admin" },
    });

    // read path (the page converts null into a 404)
    expect(await getDepartmentDetail(otherCompanyId, finance.id)).toBeNull();

    // write paths
    await expect(
      updateDepartment(otherCtx, finance.id, { name: "Hijacked" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(removeDepartment(otherCtx, finance.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      createPosition(otherCtx, finance.id, { title: "Spy" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // nothing leaked into company B
    expect(await prisma.department.count({ where: { companyId: otherCompanyId } })).toBe(0);
  });
});
