import { describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { hasPermission, PERMISSIONS, requirePermission } from "@/server/rbac/permissions";

describe("RBAC permission matrix", () => {
  it("admin can approve payroll but neither HR nor accountant can", () => {
    expect(hasPermission("COMPANY_ADMIN", PERMISSIONS.PAYROLL_APPROVE)).toBe(true);
    expect(hasPermission("HR_MANAGER", PERMISSIONS.PAYROLL_APPROVE)).toBe(false);
    expect(hasPermission("ACCOUNTANT", PERMISSIONS.PAYROLL_APPROVE)).toBe(false);
    expect(hasPermission("EMPLOYEE", PERMISSIONS.PAYROLL_APPROVE)).toBe(false);
  });

  it("accountant can process and submit payroll; HR cannot", () => {
    expect(hasPermission("ACCOUNTANT", PERMISSIONS.PAYROLL_PROCESS)).toBe(true);
    expect(hasPermission("ACCOUNTANT", PERMISSIONS.PAYROLL_SUBMIT)).toBe(true);
    expect(hasPermission("HR_MANAGER", PERMISSIONS.PAYROLL_PROCESS)).toBe(false);
    expect(hasPermission("HR_MANAGER", PERMISSIONS.PAYROLL_ADJUST)).toBe(false);
  });

  it("HR manages org structure and employees but not settings or billing", () => {
    expect(hasPermission("HR_MANAGER", PERMISSIONS.ORG_MANAGE)).toBe(true);
    expect(hasPermission("HR_MANAGER", PERMISSIONS.EMPLOYEES_MANAGE)).toBe(true);
    expect(hasPermission("HR_MANAGER", PERMISSIONS.COMPANY_MANAGE_SETTINGS)).toBe(false);
    expect(hasPermission("HR_MANAGER", PERMISSIONS.BILLING_MANAGE)).toBe(false);
    expect(hasPermission("HR_MANAGER", PERMISSIONS.PAYMENTS_MANAGE)).toBe(false);
  });

  it("employee has no company permissions", () => {
    const every = Object.values(PERMISSIONS);
    expect(every.some((p) => hasPermission("EMPLOYEE", p))).toBe(false);
  });

  it("super admin has no company-level permissions (platform access is separate)", () => {
    expect(hasPermission("SUPER_ADMIN", PERMISSIONS.PAYROLL_APPROVE)).toBe(false);
    expect(hasPermission("SUPER_ADMIN", PERMISSIONS.COMPANY_MANAGE_SETTINGS)).toBe(false);
  });

  it("sensitive payment details are visible only to admin and accountant", () => {
    expect(hasPermission("COMPANY_ADMIN", PERMISSIONS.EMPLOYEES_VIEW_SENSITIVE)).toBe(true);
    expect(hasPermission("ACCOUNTANT", PERMISSIONS.EMPLOYEES_VIEW_SENSITIVE)).toBe(true);
    expect(hasPermission("HR_MANAGER", PERMISSIONS.EMPLOYEES_VIEW_SENSITIVE)).toBe(false);
  });

  it("requirePermission throws FORBIDDEN AppError", () => {
    expect(() => requirePermission("HR_MANAGER", PERMISSIONS.PAYROLL_APPROVE)).toThrowError(AppError);
    try {
      requirePermission("HR_MANAGER", PERMISSIONS.PAYROLL_APPROVE);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("FORBIDDEN");
    }
  });
});
