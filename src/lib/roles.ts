import type { Role } from "@prisma/client";

/** Human labels and badge styling for workspace roles. */

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  COMPANY_ADMIN: "Company Admin",
  HR_MANAGER: "HR Manager",
  ACCOUNTANT: "Accountant",
  EMPLOYEE: "Employee",
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

export type RoleBadgeVariant = "indigo" | "blue" | "teal" | "grey" | "dark";

export function roleBadgeVariant(role: Role): RoleBadgeVariant {
  switch (role) {
    case "SUPER_ADMIN":
      return "dark";
    case "COMPANY_ADMIN":
      return "indigo";
    case "HR_MANAGER":
      return "blue";
    case "ACCOUNTANT":
      return "teal";
    default:
      return "grey";
  }
}
