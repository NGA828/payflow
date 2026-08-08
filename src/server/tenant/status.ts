import type { CompanyStatus } from "@prisma/client";

/**
 * Pure tenant status logic (no imports — safe for unit tests).
 * Trial expiry degrades the workspace to READ_ONLY without touching the row.
 */
export function computeEffectiveStatus(
  company: { status: CompanyStatus; trialEndsAt: Date | null },
  now: Date = new Date(),
): CompanyStatus {
  if (company.status === "SUSPENDED") return "SUSPENDED";
  if (company.status === "READ_ONLY") return "READ_ONLY";
  if (
    company.status === "TRIAL" &&
    company.trialEndsAt &&
    company.trialEndsAt.getTime() < now.getTime()
  ) {
    return "READ_ONLY";
  }
  return company.status;
}
