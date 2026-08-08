import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.register"
  | "auth.email_verified"
  | "auth.password_reset_requested"
  | "auth.password_reset_completed"
  | "company.created"
  | "company.updated"
  | "company.setup_completed"
  | "team.invited"
  | "team.invite_resent"
  | "team.invite_revoked"
  | "team.invite_accepted"
  | "team.role_changed"
  | "team.membership_status_changed"
  | "employee.created"
  | "employee.updated"
  | "employee.payment_updated"
  | "employee.status_changed"
  | "employee.terminated"
  | "org.department_created"
  | "org.department_updated"
  | "org.department_archived"
  | "org.department_deleted"
  | "org.department_restored"
  | "org.position_created"
  | "org.position_updated"
  | "org.position_archived"
  | "org.position_deleted"
  | "org.position_restored"
  | "payroll.period_created"
  | "payroll.period_deleted"
  | "payroll.adjustment_added"
  | "payroll.adjustment_updated"
  | "payroll.adjustment_deleted"
  | "payroll.process_started"
  | "payroll.process_completed"
  | "payroll.process_failed"
  | "payroll.submitted"
  | "payroll.approved"
  | "payroll.rejected"
  | "payroll.unlocked"
  | "payment.status_changed"
  | "payment.exported"
  | "payslip.generated"
  | "payslip.downloaded"
  | "subscription.state_changed"
  | "admin.company_suspended"
  | "admin.company_reactivated";

export interface AuditInput {
  companyId?: string | null;
  userId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Writes an audit log entry. Audit failures must never break the business
 * operation, so errors are swallowed with a console warning.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await getDb().auditLog.create({
      data: {
        companyId: input.companyId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    console.warn("[audit] failed to write entry", input.action, error);
  }
}
