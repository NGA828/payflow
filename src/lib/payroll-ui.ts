import type { PayrollPeriodStatus } from "@prisma/client";

/** Shared Badge variant for a payroll period status (client-safe). */
export function statusBadgeVariant(
  status: PayrollPeriodStatus,
): "grey" | "blue" | "indigo" | "amber" | "teal" | "green" | "dark" {
  const map: Record<
    PayrollPeriodStatus,
    "grey" | "blue" | "indigo" | "amber" | "teal" | "green" | "dark"
  > = {
    DRAFT: "grey",
    IN_PROGRESS: "blue",
    READY: "indigo",
    SUBMITTED: "amber",
    APPROVED: "teal",
    PAID: "green",
    LOCKED: "dark",
  };
  return map[status];
}

/** `IN_PROGRESS` → `In progress` for display. */
export function statusLabel(status: PayrollPeriodStatus): string {
  switch (status) {
    case "IN_PROGRESS":
      return "In progress";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase();
  }
}
