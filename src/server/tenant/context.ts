import type { Company, CompanyStatus, Role } from "@prisma/client";
import { getDb } from "@/lib/db";
import { auth } from "@/server/auth";
import { AppError } from "@/server/errors";
import { requirePermission, type Permission } from "@/server/rbac/permissions";
import { computeEffectiveStatus, assertCompanyWritable } from "@/server/tenant/status";

export { computeEffectiveStatus, assertCompanyWritable };

/**
 * Tenant resolution. The company context is ALWAYS derived from the
 * authenticated user's membership — never from a client-supplied companyId.
 */

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  emailVerifiedAt: Date | null;
}

export interface CompanyContext {
  user: SessionUser;
  membership: {
    id: string;
    role: Role;
    status: "ACTIVE" | "INVITED" | "DISABLED";
  };
  company: Company;
  /** Computed status including lazy trial expiry. Use this, not company.status. */
  effectiveStatus: CompanyStatus;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await getDb().user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isSuperAdmin: user.isSuperAdmin,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "You must be signed in to continue.");
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin) {
    throw new AppError("FORBIDDEN", "Platform administration requires super admin access.");
  }
  return user;
}

/**
 * Resolves the caller's active company context. Throws UNAUTHENTICATED when
 * signed out, FORBIDDEN when the user has no active company membership.
 */
export async function requireCompanyContext(): Promise<CompanyContext> {
  const user = await requireUser();

  const membership = await getDb().membership.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { company: true },
  });
  if (!membership) {
    throw new AppError("FORBIDDEN", "You do not belong to an active company workspace.");
  }

  return {
    user,
    membership: { id: membership.id, role: membership.role, status: membership.status },
    company: membership.company,
    effectiveStatus: computeEffectiveStatus(membership.company),
  };
}

export async function requireCompanyPermission(permission: Permission): Promise<CompanyContext> {
  const ctx = await requireCompanyContext();
  requirePermission(ctx.membership.role, permission);
  return ctx;
}

