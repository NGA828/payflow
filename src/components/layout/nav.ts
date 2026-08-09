import {
  Building2,
  CalendarCheck,
  CreditCard,
  FileText,
  LayoutDashboard,
  LineChart,
  ScrollText,
  Settings,
  SlidersHorizontal,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { PERMISSIONS, hasPermission, type Permission } from "@/server/rbac/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission required to see this item. null = any staff role. */
  permission: Permission | null;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: null },
      { href: "/setup", label: "Setup guide", icon: SlidersHorizontal, permission: PERMISSIONS.COMPANY_MANAGE_SETTINGS },
    ],
  },
  {
    label: "Organization",
    items: [
      { href: "/organization", label: "Departments", icon: Building2, permission: PERMISSIONS.ORG_MANAGE },
      { href: "/employees", label: "Employees", icon: Users, permission: PERMISSIONS.EMPLOYEES_VIEW },
      { href: "/team", label: "Team & invites", icon: UserPlus, permission: PERMISSIONS.TEAM_VIEW },
    ],
  },
  {
    label: "Payroll",
    items: [
      { href: "/payroll", label: "Payroll", icon: CalendarCheck, permission: PERMISSIONS.PAYROLL_VIEW },
      { href: "/payments", label: "Payments", icon: Wallet, permission: PERMISSIONS.PAYMENTS_VIEW },
      { href: "/payslips", label: "Payslips", icon: FileText, permission: PERMISSIONS.PAYSLIPS_VIEW },
      { href: "/reports", label: "Reports", icon: LineChart, permission: PERMISSIONS.REPORTS_VIEW },
    ],
  },
  {
    label: "Company",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, permission: PERMISSIONS.COMPANY_MANAGE_SETTINGS },
      { href: "/billing", label: "Billing", icon: CreditCard, permission: PERMISSIONS.BILLING_MANAGE },
      { href: "/audit-log", label: "Audit log", icon: ScrollText, permission: PERMISSIONS.AUDIT_VIEW },
    ],
  },
];

const PORTAL_NAV: NavGroup[] = [
  {
    label: "My Pay",
    items: [
      { href: "/portal", label: "Dashboard", icon: LayoutDashboard, permission: null },
      { href: "/portal/payslips", label: "My payslips", icon: FileText, permission: null },
      { href: "/portal/payments", label: "Payment history", icon: Wallet, permission: null },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/portal/profile", label: "My profile", icon: Settings, permission: null },
    ],
  },
];

export function navForRole(role: Role): NavGroup[] {
  if (role === "EMPLOYEE") return PORTAL_NAV;
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.permission === null || hasPermission(role, item.permission),
    ),
  })).filter((group) => group.items.length > 0);
}

export { roleLabel, roleBadgeVariant, type RoleBadgeVariant } from "@/lib/roles";
