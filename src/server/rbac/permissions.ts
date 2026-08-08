import type { Role } from "@prisma/client";
import { AppError } from "@/server/errors";

/**
 * Permission matrix. Enforced server-side on every protected action —
 * hiding UI is only a courtesy, never a control.
 */
export const PERMISSIONS = {
  COMPANY_MANAGE_SETTINGS: "company.manage_settings",
  BILLING_MANAGE: "billing.manage",
  TEAM_VIEW: "team.view",
  TEAM_INVITE: "team.invite",
  TEAM_MANAGE: "team.manage",
  ORG_MANAGE: "org.manage",
  EMPLOYEES_VIEW: "employees.view",
  EMPLOYEES_MANAGE: "employees.manage",
  EMPLOYEES_VIEW_SENSITIVE: "employees.view_sensitive",
  PAYROLL_VIEW: "payroll.view",
  PAYROLL_PERIODS_MANAGE: "payroll.periods_manage",
  PAYROLL_ADJUST: "payroll.adjust",
  PAYROLL_PROCESS: "payroll.process",
  PAYROLL_SUBMIT: "payroll.submit",
  PAYROLL_APPROVE: "payroll.approve",
  PAYROLL_UNLOCK: "payroll.unlock",
  PAYSLIPS_VIEW: "payslips.view",
  PAYSLIPS_DOWNLOAD: "payslips.download",
  PAYMENTS_VIEW: "payments.view",
  PAYMENTS_MANAGE: "payments.manage",
  PAYMENTS_EXPORT: "payments.export",
  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",
  AUDIT_VIEW: "audit.view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const COMPANY_ADMIN: readonly Permission[] = [
  PERMISSIONS.COMPANY_MANAGE_SETTINGS,
  PERMISSIONS.BILLING_MANAGE,
  PERMISSIONS.TEAM_VIEW,
  PERMISSIONS.TEAM_INVITE,
  PERMISSIONS.TEAM_MANAGE,
  PERMISSIONS.ORG_MANAGE,
  PERMISSIONS.EMPLOYEES_VIEW,
  PERMISSIONS.EMPLOYEES_MANAGE,
  PERMISSIONS.EMPLOYEES_VIEW_SENSITIVE,
  PERMISSIONS.PAYROLL_VIEW,
  PERMISSIONS.PAYROLL_APPROVE,
  PERMISSIONS.PAYROLL_UNLOCK,
  PERMISSIONS.PAYSLIPS_VIEW,
  PERMISSIONS.PAYSLIPS_DOWNLOAD,
  PERMISSIONS.PAYMENTS_VIEW,
  PERMISSIONS.PAYMENTS_MANAGE,
  PERMISSIONS.PAYMENTS_EXPORT,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.REPORTS_EXPORT,
  PERMISSIONS.AUDIT_VIEW,
];

const HR_MANAGER: readonly Permission[] = [
  PERMISSIONS.ORG_MANAGE,
  PERMISSIONS.EMPLOYEES_VIEW,
  PERMISSIONS.EMPLOYEES_MANAGE,
  PERMISSIONS.PAYROLL_VIEW,
  PERMISSIONS.PAYSLIPS_VIEW,
  PERMISSIONS.PAYSLIPS_DOWNLOAD,
  PERMISSIONS.REPORTS_VIEW,
];

const ACCOUNTANT: readonly Permission[] = [
  PERMISSIONS.EMPLOYEES_VIEW,
  PERMISSIONS.EMPLOYEES_VIEW_SENSITIVE,
  PERMISSIONS.PAYROLL_VIEW,
  PERMISSIONS.PAYROLL_PERIODS_MANAGE,
  PERMISSIONS.PAYROLL_ADJUST,
  PERMISSIONS.PAYROLL_PROCESS,
  PERMISSIONS.PAYROLL_SUBMIT,
  PERMISSIONS.PAYSLIPS_VIEW,
  PERMISSIONS.PAYSLIPS_DOWNLOAD,
  PERMISSIONS.PAYMENTS_VIEW,
  PERMISSIONS.PAYMENTS_MANAGE,
  PERMISSIONS.PAYMENTS_EXPORT,
  PERMISSIONS.REPORTS_VIEW,
  PERMISSIONS.REPORTS_EXPORT,
];

const EMPLOYEE: readonly Permission[] = [];

/** Platform administration is handled separately via User.isSuperAdmin. */
const ROLE_MATRIX: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: [],
  COMPANY_ADMIN,
  HR_MANAGER,
  ACCOUNTANT,
  EMPLOYEE,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_MATRIX[role].includes(permission);
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new AppError(
      "FORBIDDEN",
      "You do not have permission to perform this action.",
    );
  }
}

/** Roles that may access the company (staff) area at all. */
export const STAFF_ROLES: readonly Role[] = [
  "COMPANY_ADMIN",
  "HR_MANAGER",
  "ACCOUNTANT",
];
