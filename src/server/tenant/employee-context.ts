import type { Role } from "@prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { requireCompanyContext, type CompanyContext } from "@/server/tenant/context";

/**
 * Employee portal context. Requires an active EMPLOYEE membership and a linked
 * Employee profile (Employee.userId). The company context is still resolved
 * from the membership — tenant isolation remains.
 */

export interface EmployeeContext extends CompanyContext {
  membership: {
    id: string;
    role: Role;
    status: "ACTIVE" | "INVITED" | "DISABLED";
  };
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    departmentId: string;
    departmentName: string;
    positionTitle: string;
    status: string;
  };
}

export async function requireEmployeeContext(): Promise<EmployeeContext> {
  const base = await requireCompanyContext();

  if (base.membership.role !== "EMPLOYEE") {
    throw new AppError(
      "FORBIDDEN",
      "Employee portal access requires an employee account. Company staff should use the workspace dashboard.",
    );
  }

  const db = getDb();
  const employee = await db.employee.findFirst({
    where: { companyId: base.company.id, userId: base.user.id },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      departmentId: true,
      department: { select: { name: true } },
      position: { select: { title: true } },
      status: true,
    },
  });

  if (!employee) {
    throw new AppError(
      "FORBIDDEN",
      "Your user account is not linked to an employee profile. Contact HR to link your portal access.",
    );
  }

  return {
    ...base,
    employee: {
      id: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      departmentId: employee.departmentId,
      departmentName: employee.department.name,
      positionTitle: employee.position.title,
      status: employee.status,
    },
  };
}

export async function requireStaffContext() {
  const ctx = await requireCompanyContext();
  const STAFF_ROLES: readonly Role[] = ["COMPANY_ADMIN", "HR_MANAGER", "ACCOUNTANT"];
  if (!STAFF_ROLES.includes(ctx.membership.role)) {
    throw new AppError(
      "FORBIDDEN",
      "This area is for company staff. Employee portal is at /portal.",
    );
  }
  return ctx;
}
