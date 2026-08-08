import type { Role } from "@prisma/client";
import { getDb } from "@/lib/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/security/audit";
import type { CompanyContext } from "@/server/tenant/context";

/**
 * Setup wizard: 5 linear steps, resumable. `Company.setupStep` is the highest
 * step reached (1..5); users cannot jump ahead of it but can always go back
 * to edit. Finishing requires having reached step 5 and is idempotent.
 */
export const SETUP_STEPS = [
  { n: 1, slug: "company", title: "Company information", optional: false },
  { n: 2, slug: "payroll", title: "Payroll settings", optional: false },
  { n: 3, slug: "organization", title: "Organization basics", optional: true },
  { n: 4, slug: "team", title: "Invite your team", optional: true },
  { n: 5, slug: "finish", title: "Review & finish", optional: false },
] as const;

export const FINAL_STEP = SETUP_STEPS.length;

export type SetupStepSlug = (typeof SETUP_STEPS)[number]["slug"];

/** Clamps any numeric-ish input into the valid 1..5 step range. Pure. */
export function clampStep(value: unknown): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.trunc(n), 1), FINAL_STEP);
}

/**
 * Resolves which step to render given the URL request and stored progress.
 * Returns the redirect target (null when the requested step is fine).
 * Pure — the page performs the redirect.
 */
export function resolveRequestedStep(
  requested: string | undefined,
  highestReached: number,
): { step: number; redirectTo: number | null } {
  if (requested === undefined) {
    return { step: clampStep(highestReached), redirectTo: clampStep(highestReached) };
  }
  const step = clampStep(requested);
  if (step > highestReached) return { step: highestReached, redirectTo: highestReached };
  if (String(step) !== requested) return { step, redirectTo: step };
  return { step, redirectTo: null };
}

/** Marks a step as completed; advances stored progress to the next step. */
export async function advanceSetupStep(ctx: CompanyContext, completedStep: number): Promise<void> {
  const next = Math.min(clampStep(completedStep) + 1, FINAL_STEP);
  if (next > ctx.company.setupStep) {
    await getDb().company.update({
      where: { id: ctx.company.id },
      data: { setupStep: next },
    });
  }
}

export interface SetupSnapshot {
  departments: { id: string; name: string }[];
  teamMembers: number;
  pendingInvitations: { id: string; email: string; role: Role }[];
}

/** Live data for the review step (never cached — reflects skips/edits). */
export async function getSetupSnapshot(companyId: string): Promise<SetupSnapshot> {
  const db = getDb();
  const [departments, teamMembers, pendingInvitations] = await Promise.all([
    db.department.findMany({
      where: { companyId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.membership.count({ where: { companyId, status: "ACTIVE" } }),
    db.invitation.findMany({
      where: { companyId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { departments, teamMembers, pendingInvitations };
}

/**
 * Completes the wizard. Requires having reached the final step; the first
 * completion stamps `setupCompletedAt` and is audited — repeats are no-ops.
 */
export async function completeSetup(
  ctx: CompanyContext,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  if (ctx.company.setupStep < FINAL_STEP) {
    throw new AppError(
      "BAD_REQUEST",
      "Go through each step of the setup guide before finishing.",
    );
  }
  if (ctx.company.setupCompletedAt) return; // idempotent

  await getDb().company.update({
    where: { id: ctx.company.id },
    data: { setupCompletedAt: new Date() },
  });
  await audit({
    companyId: ctx.company.id,
    userId: ctx.user.id,
    action: "company.setup_completed",
    entityType: "Company",
    entityId: ctx.company.id,
    ...meta,
  });
}
