import type { CompanyStatus } from "@prisma/client";
import { AppError } from "@/server/errors";

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

/**
 * Mutations are blocked in SUSPENDED and READ_ONLY workspaces. Pure — does
 * not import auth or DB, safe for unit tests.
 */
export function assertCompanyWritable(ctx: { effectiveStatus: CompanyStatus }): void {
  if (ctx.effectiveStatus === "SUSPENDED") {
    throw new AppError(
      "SUSPENDED",
      "This workspace is suspended. Contact PayFlow support to reactivate it.",
    );
  }
  if (ctx.effectiveStatus === "READ_ONLY") {
    throw new AppError(
      "READ_ONLY",
      "This workspace is read-only because the trial or subscription has ended. Activate a plan to make changes.",
    );
  }
}
