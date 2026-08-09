# Database

## Schema
Full schema in `src/prisma/schema.prisma`. Enums: CompanyStatus (TRIAL ACTIVE SUSPENDED READ_ONLY), PayrollFrequency MONTHLY (MVP), Role (SUPER_ADMIN COMPANY_ADMIN HR_MANAGER ACCOUNTANT EMPLOYEE), MembershipStatus, OrgEntityStatus, EmploymentType, EmployeeStatus, PayrollPeriodStatus (DRAFT IN_PROGRESS READY SUBMITTED APPROVED PAID LOCKED), AdjustmentType (OVERTIME BONUS TRANSPORT MEAL LOAN ADVANCE PENALTY OTHER_DEDUCTION TAX), AdjustmentCategory, PayrollRunStatus, PayslipStatus, PaymentMethodType, PaymentStatus, SubscriptionStatus, AuthTokenType.

## Tenancy & Identity
- Company 1—* Membership (user, company, role, status), Invitation (tokenHash SHA-256), User (isSuperAdmin, isActive, emailVerifiedAt), AuthToken (hashed, single-use).
- Membership @@unique([userId, companyId]), indexed company+status.

## Organization
- Department companyId+name unique (case-insensitive via org_ci_uniques migration), status ACTIVE/ARCHIVED.
- Position companyId+departmentId+title unique, status.
- Employee companyId+employeeCode unique, employeeCode PB-0001 per-company sequence allocated server-side, encrypted payment fields (bankNameEnc, bankAccountNumberEnc, mobileMoneyNumberEnc), paymentMethodPreference, departmentId, positionId, employmentType, basicSalary Decimal(12,2), status.

## Payroll
- PayrollPeriod companyId+startDate indexed, company+status indexed, name (August 2026 or range), start/end/payDate, status, submitted/approved/unlocked metadata + reasons, lockedAt, totals (totalEmployees, totalGross, totalDeductions, totalNet Decimal(14,2)), notes. Overlap exclusion enforced in service transaction (day-inclusive).
- PayrollAdjustment company+payrollPeriodId indexed, payrollPeriodId+employeeId indexed, type, category derived, amount Decimal(12,2) whole-XAF, hours Decimal(6,2) required for OVERTIME, note, createdById.
- PayrollRun company+payrollPeriodId+status indexed, status QUEUED/RUNNING/COMPLETED/FAILED, total/processedEmployees, errorMessage, startedById.
- Payslip @@unique(payrollPeriodId, employeeId) + @@unique(companyId, payslipNumber) per-company PS-YYYY-#####, 8 stored columns (basicSalary, overtimePay, bonuses, allowances, grossSalary, tax, deductions, netSalary) all Decimal(12,2), currency XAF, pdfUrl null (rendered on demand), status DRAFT/APPROVED/VOID.
- Payment @@unique(payrollPeriodId, employeeId), company+status indexed, method BANK/MOBILE_MONEY/CASH, amount Decimal(12,2), status PENDING/SUCCESSFUL/FAILED, reference, failureReason, paidAt, recordedById.

## Billing
- SubscriptionPlan code unique (starter/growth/business), maxEmployees, priceMonthly Decimal, trialDays, isActive.
- Subscription companyId unique, planId, status TRIALING/ACTIVE/PAST_DUE/EXPIRED/CANCELED, trialEndsAt, currentPeriodEnd, stripe fields optional.

## Platform
- AuditLog company+createdAt indexed, userId, action indexed (48 actions inc auth, company, team, org, payroll, payment, payslip, report.exported, subscription, admin), entityType, entityId, metadata Json, ip, userAgent.
- Notification companyId + userId+readAt indexed, title, body, link, readAt.

## Migrations
- `20260807100000_init` main schema.
- `20260807120000_company_setup_step` adds Company.setupStep Int default 1 (wizard progress).
- `20260807130000_org_ci_uniques` case-insensitive unique indexes for department name and position title per company via citext or lower() index (PGlite vs pg).

## Encryption
- Payment secrets AES-256-GCM: `v1.{iv base64}.{tag base64}.{cipher base64}` stored in bankNameEnc etc. Decrypted only at export boundary (payment CSV) or reveal flag for sensitive roles. Audit metadata last-4 only.

## Money
- All money columns Decimal, but app treats as whole XAF via `roundWholeXaf` (big.js half-up). Payslip footing invariant: leaf lines rounded first, then gross/deductions/net via integer addition.

## Seeding
- `src/prisma/seed.ts` upserts plans + superadmin (superadmin@payflow.test).
- `scripts/e2e-fixture.ts` creates E2E Check SARL: 4 employees (PB-0001 bank complete, PB-0002 momo, PB-0003 inactive, PB-0004 missing payment), July 2026 APPROVED period with payslips/payments, August 2026 DRAFT with adjustments (bonus, overtime, advance), accountant acc@e2e.test.
