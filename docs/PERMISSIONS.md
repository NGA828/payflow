# Permissions

Matrix enforced server-side on every protected action — hiding UI is courtesy, never control. Defined in `src/server/rbac/permissions.ts`.

## Permissions
- company.manage_settings
- billing.manage
- team.view / team.invite / team.manage
- org.manage
- employees.view / employees.manage / employees.view_sensitive
- payroll.view / payroll.periods_manage / payroll.adjust / payroll.process / payroll.submit / payroll.approve / payroll.unlock
- payslips.view / payslips.download
- payments.view / payments.manage / payments.export
- reports.view / reports.export
- audit.view

## Roles

### COMPANY_ADMIN
All permissions: company, billing, team (view/invite/manage), org, employees (view/manage/view_sensitive), payroll (view/approve/unlock), payslips (view/download), payments (view/manage/export), reports (view/export), audit.

### HR_MANAGER
org.manage, employees.view/manage, payroll.view, payslips.view/download, reports.view
- Cannot view sensitive salary/payment plaintext (no view_sensitive), cannot manage payroll periods, process, submit, approve, unlock, cannot manage payments, cannot export reports, cannot view audit, cannot manage billing.

### ACCOUNTANT
employees.view + view_sensitive, payroll.view/periods_manage/adjust/process/submit, payslips.view/download, payments.view/manage/export, reports.view/export
- Cannot manage org (no org.manage), cannot manage team (no team.*), cannot approve/unlock (requires COMPANY_ADMIN), cannot view audit, cannot manage company settings.

### EMPLOYEE
No staff permissions (empty array). Portal only: dashboard, my payslips (APPROVED only), payment history, profile (masked). Bounced from company routes via `STAFF_ROLES` check in `(company)/layout.tsx` — shows portal CTA. Staff trying to access `/portal` sees gate with link to `/dashboard`.

### SUPER_ADMIN
Platform admin via `User.isSuperAdmin` boolean, not a membership. Checked via `requireSuperAdmin()` in `(super-admin)/layout.tsx`. Cannot have active company membership; company context throws FORBIDDEN → gate screen "Platform admin — no workspace". Route separation: admin at `/admin/*`, company at `/*`. Tests prove isolation.

## Enforcement
- Middleware coarse gating: checks JWT presence for staff/portal/admin prefixes, redirects to /login, blocks non-superadmin from /admin.
- Layouts: `(company)/layout.tsx` requires active membership + STAFF_ROLES + emailVerified + effectiveStatus (SUSPENDED → suspension screen, READ_ONLY → banner). `(employee)/layout.tsx` requires EMPLOYEE role + linked Employee profile.
- Services: `requireCompanyPermission(permission)` → `requireCompanyContext` (membership from DB, not client) → `hasPermission` → `assertCompanyWritable` (pure, from status.ts) — defense in depth. Every mutation service calls assertCompanyWritable; billing activation is sole exception (checks SUSPENDED only).
- Sensitive data: `employees.view_sensitive` required for salary and decrypted payment details; audit metadata carries last-4 only.

## Audit Actions
48 actions: auth.login, login_failed, logout, register, email_verified, password_reset_requested/completed, company.created/updated/setup_completed, team.invited/invite_resent/revoked/invite_accepted/role_changed/membership_status_changed, employee.created/updated/payment_updated/status_changed/terminated, org.department_created/updated/archived/deleted/restored, org.position_created/... etc, payroll.period_created/deleted/adjustment_added/updated/deleted/process_started/completed/failed/submitted/approved/rejected/unlocked/marked_paid/locked, payment.status_changed/exported, payslip.generated/downloaded, report.exported, subscription.state_changed, admin.company_suspended/reactivated.
