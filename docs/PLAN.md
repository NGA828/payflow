# PayFlow — Master Engineering Plan

Status: **Approved** — building. Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · Phase 4 ✅ · Phase 5 ✅ · Phase 6 ✅ (2026-08-08).
Date: 2026-08-07 · Branch: `arena/019fdb7f-payflow`

Companion docs: `DESIGN.md` (Dribbble-derived visual research),
`payflow-designs/payflow-design-system.html` (visual source of truth).

---

## 1. Final stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router, RSC) | Node.js runtime for all server logic (Prisma/crypto) |
| Language | TypeScript 5.x, `strict: true` | `noUncheckedIndexedAccess` on |
| UI | Tailwind CSS v4 + shadcn/ui (Radix) + lucide-react | tokens from the design-system HTML |
| Charts | Recharts | lazy-loaded client islands |
| ORM/DB | Prisma 6 + PostgreSQL 16 | docker-compose for dev |
| Auth | Auth.js v5 (`next-auth@beta`), credentials + JWT sessions | bcryptjs password hashing; no Prisma adapter (JWT sessions) |
| Money | Prisma `Decimal(14,2)` columns + `big.js` `Money` value object | bank-safe; round **half-up to whole XAF** at finalize |
| Encryption | `node:crypto` AES-256-GCM | `ENCRYPTION_KEY` env (32-byte hex) |
| Jobs | BullMQ v5 + Redis 7 | `QUEUE_DRIVER=inline` auto-fallback when Redis is absent (see Decisions) |
| PDF | @react-pdf/renderer | payslips + report PDFs, generated in Node jobs/route handlers |
| ZIP | archiver | bulk payslip download |
| Excel/CSV | ExcelJS + hand-rolled CSV | server-side exports only |
| Validation | Zod 4 | shared schemas between client forms and server actions |
| Forms | react-hook-form + @hookform/resolvers | client comfort only; server re-validates always |
| Toasts/Feedback | sonner | plus custom banners/dialogs |
| Tests | Vitest 3 (unit/integration) + Testing Library; Playwright (e2e) | test DB via `DATABASE_URL_TEST` |
| Logging | pino | server-side only |
| Email | provider abstraction: console (dev) → SMTP/Resend | Mailhog service in docker-compose for dev preview |
| i18n | typed dictionary module (`src/i18n/en.ts`, `fr` later) | Intl for dates/numbers; `Africa/Douala` display TZ |
| Rate limiting | small util: in-memory by default, Redis-backed when available | auth endpoints 5 attempts / 15 min |
| Session transport | secure, httpOnly JWT cookie | middleware does *coarse* gating only; services enforce |

Ports & processes: `npm run dev` (Next.js), `npm run worker` (BullMQ worker, `tsx watch`).

---

## 2. Full Prisma schema

Will live at `src/prisma/schema.prisma` (exactly as the requested structure).

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── Enums ──────────────────────────────────────────────────────────
enum CompanyStatus { TRIAL ACTIVE SUSPENDED READ_ONLY }
enum PayrollFrequency { MONTHLY }                       // MVP: monthly only
enum Role { SUPER_ADMIN COMPANY_ADMIN HR_MANAGER ACCOUNTANT EMPLOYEE }
enum MembershipStatus { ACTIVE INVITED DISABLED }
enum OrgEntityStatus { ACTIVE ARCHIVED }
enum EmploymentType { FULL_TIME PART_TIME CONTRACT INTERN }
enum EmployeeStatus { ACTIVE INACTIVE TERMINATED }
enum PayrollPeriodStatus { DRAFT IN_PROGRESS READY SUBMITTED APPROVED PAID LOCKED }
enum AdjustmentType { OVERTIME BONUS TRANSPORT MEAL LOAN ADVANCE PENALTY OTHER_DEDUCTION TAX }
enum AdjustmentCategory { EARNING DEDUCTION }
enum PayrollRunStatus { QUEUED RUNNING COMPLETED FAILED }
enum PayslipStatus { DRAFT APPROVED VOID }
enum PaymentMethodType { BANK MOBILE_MONEY CASH }
enum PaymentStatus { PENDING SUCCESSFUL FAILED }
enum SubscriptionStatus { TRIALING ACTIVE PAST_DUE EXPIRED CANCELED }
enum AuthTokenType { EMAIL_VERIFICATION PASSWORD_RESET }

// ── Identity & tenancy ─────────────────────────────────────────────
model Company {
  id            String @id @default(cuid())
  name          String
  slug          String? @unique
  logoUrl       String?
  address       String?
  taxId         String?
  country       String @default("CM")
  currency      String @default("XAF")
  payrollFrequency PayrollFrequency @default(MONTHLY)
  standardHoursPerWeek Decimal @default(40) @db.Decimal(5, 2)
  overtimeMultiplier   Decimal @default(1.2) @db.Decimal(4, 2)
  taxRate              Decimal @default(0)   @db.Decimal(6, 4) // fractional, e.g. 0.0500
  status        CompanyStatus @default(TRIAL)
  trialEndsAt   DateTime?
  setupCompletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships    Membership[]
  invitations    Invitation[]
  departments    Department[]
  positions      Position[]
  employees      Employee[]
  payrollPeriods PayrollPeriod[]
  adjustments    PayrollAdjustment[]
  payrollRuns    PayrollRun[]
  payslips       Payslip[]
  payments       Payment[]
  subscription   Subscription?
  auditLogs      AuditLog[]
  notifications  Notification[]

  @@index([status])
}

model User {
  id           String @id @default(cuid())
  email        String @unique
  passwordHash String
  fullName     String
  phone        String?
  emailVerifiedAt DateTime?
  isActive     Boolean @default(true)
  isSuperAdmin Boolean @default(false) // platform admin; see DECISIONS
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships        Membership[]
  invitedMemberships Membership[]      @relation("InviteInviter")
  invitationsSent    Invitation[]
  authTokens         AuthToken[]
  submittedPeriods   PayrollPeriod[]   @relation("PeriodSubmittedBy")
  approvedPeriods    PayrollPeriod[]   @relation("PeriodApprovedBy")
  unlockedPeriods    PayrollPeriod[]   @relation("PeriodUnlockedBy")
  adjustmentsCreated PayrollAdjustment[]
  payrollRunsStarted PayrollRun[]
  paymentsRecorded   Payment[]
  employeeProfile    Employee?
  auditLogs          AuditLog[]
  notifications      Notification[]
}

model Membership {
  id        String @id @default(cuid())
  userId    String
  companyId String
  role      Role
  status    MembershipStatus @default(ACTIVE)
  invitedById String?
  invitedBy   User?    @relation("InviteInviter", fields: [invitedById], references: [id])
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  joinedAt  DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, companyId])
  @@index([companyId, status])
  @@index([userId])
}

model Invitation {
  id        String @id @default(cuid())
  companyId String
  email     String
  role      Role
  tokenHash String @unique // SHA-256 of the email link token; raw token never stored
  invitedById String
  invitedBy   User   @relation(fields: [invitedById], references: [id])
  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  acceptedAt DateTime?
  revokedAt  DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([companyId, email])
}

model AuthToken {
  id        String @id @default(cuid())
  userId    String
  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      AuthTokenType
  tokenHash String @unique // SHA-256; single-use, expiring
  expiresAt DateTime
  consumedAt DateTime?
  createdAt DateTime @default(now())

  @@index([userId, type])
}

// ── Organization ───────────────────────────────────────────────────
model Department {
  id        String @id @default(cuid())
  companyId String
  name      String
  description String?
  status    OrgEntityStatus @default(ACTIVE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  company   Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  positions Position[]
  employees Employee[]

  @@unique([companyId, name])
  @@index([companyId, status])
}

model Position {
  id        String @id @default(cuid())
  companyId String
  departmentId String
  title     String
  status    OrgEntityStatus @default(ACTIVE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  company   Company    @relation(fields: [companyId], references: [id], onDelete: Cascade)
  department Department @relation(fields: [departmentId], references: [id])
  employees Employee[]

  @@unique([companyId, departmentId, title])
  @@index([companyId])
  @@index([departmentId])
}

model Employee {
  id        String @id @default(cuid())
  companyId String
  userId    String? @unique // linked login for self-service (optional)
  user      User?   @relation(fields: [userId], references: [id])
  employeeCode String
  firstName String
  lastName  String
  dateOfBirth DateTime?
  nationalId  String?
  phone       String?
  email       String?
  departmentId String
  positionId   String
  dateHired      DateTime
  terminationDate DateTime?
  employmentType EmploymentType @default(FULL_TIME)
  basicSalary Decimal @db.Decimal(12, 2)
  paymentMethodPreference PaymentMethodType @default(BANK)
  bankNameEnc             String? // AES-256-GCM ciphertext (base64), never plaintext
  bankAccountNumberEnc    String?
  mobileMoneyProvider     String? // provider label is not sensitive
  mobileMoneyNumberEnc    String?
  status    EmployeeStatus @default(ACTIVE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  company     Company    @relation(fields: [companyId], references: [id], onDelete: Cascade)
  department  Department @relation(fields: [departmentId], references: [id])
  position    Position   @relation(fields: [positionId], references: [id])
  adjustments PayrollAdjustment[]
  payslips    Payslip[]
  payments    Payment[]

  @@unique([companyId, employeeCode])
  @@index([companyId, status])
  @@index([companyId, lastName, firstName])
  @@index([departmentId])
}

// ── Payroll ────────────────────────────────────────────────────────
model PayrollPeriod {
  id        String @id @default(cuid())
  companyId String
  name      String // e.g. "August 2026"
  startDate DateTime
  endDate   DateTime
  payDate   DateTime
  status    PayrollPeriodStatus @default(DRAFT)
  submittedAt DateTime?  submittedById String?
  submittedBy User?      @relation("PeriodSubmittedBy", fields: [submittedById], references: [id])
  approvedAt  DateTime?  approvedById  String?
  approvedBy  User?      @relation("PeriodApprovedBy", fields: [approvedById], references: [id])
  unlockedAt DateTime?   unlockedById  String?  unlockReason String?
  unlockedBy User?       @relation("PeriodUnlockedBy", fields: [unlockedById], references: [id])
  lockedAt   DateTime?
  totalEmployees  Int?
  totalGross      Decimal? @db.Decimal(14, 2)
  totalDeductions Decimal? @db.Decimal(14, 2)
  totalNet        Decimal? @db.Decimal(14, 2)
  notes      String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  company     Company             @relation(fields: [companyId], references: [id], onDelete: Cascade)
  adjustments PayrollAdjustment[]
  runs        PayrollRun[]
  payslips    Payslip[]
  payments    Payment[]

  @@index([companyId, startDate])
  @@index([companyId, status])
  // Overlap exclusion enforced in service-level transactions (Decision #7).
}

model PayrollAdjustment {
  id        String @id @default(cuid())
  companyId String
  payrollPeriodId String
  employeeId String
  type      AdjustmentType
  category  AdjustmentCategory
  amount    Decimal @db.Decimal(12, 2) // non-negative, whole-XAF rounded on save
  hours     Decimal? @db.Decimal(6, 2) // required iff type = OVERTIME
  note      String?
  createdById String
  createdBy   User   @relation(fields: [createdById], references: [id])
  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  payrollPeriod PayrollPeriod @relation(fields: [payrollPeriodId], references: [id], onDelete: Cascade)
  employee  Employee @relation(fields: [employeeId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([payrollPeriodId, employeeId])
  @@index([companyId, payrollPeriodId])
}

model PayrollRun {
  id        String @id @default(cuid())
  companyId String
  payrollPeriodId String
  status    PayrollRunStatus @default(QUEUED)
  totalEmployees     Int @default(0)
  processedEmployees Int @default(0)
  errorMessage String?
  startedById String
  startedBy   User @relation(fields: [startedById], references: [id])
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  company  Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  payrollPeriod PayrollPeriod @relation(fields: [payrollPeriodId], references: [id], onDelete: Cascade)

  @@index([payrollPeriodId, status])
  @@index([companyId])
}

model Payslip {
  id        String @id @default(cuid())
  companyId String
  payrollPeriodId String
  employeeId String
  payslipNumber String // PS-2026-00042 (per-company sequence)
  basicSalary Decimal @db.Decimal(12, 2)
  overtimePay Decimal @db.Decimal(12, 2)
  bonuses     Decimal @db.Decimal(12, 2)
  allowances  Decimal @db.Decimal(12, 2)
  grossSalary Decimal @db.Decimal(12, 2)
  tax         Decimal @db.Decimal(12, 2)
  deductions  Decimal @db.Decimal(12, 2) // ALL deductions incl. tax
  netSalary   Decimal @db.Decimal(12, 2)
  currency    String @default("XAF")
  pdfUrl      String?
  status      PayslipStatus @default(DRAFT)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  company  Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  payrollPeriod PayrollPeriod @relation(fields: [payrollPeriodId], references: [id], onDelete: Cascade)
  employee  Employee @relation(fields: [employeeId], references: [id])

  @@unique([payrollPeriodId, employeeId])
  @@unique([companyId, payslipNumber])
  @@index([companyId, status])
  @@index([employeeId])
}

model Payment {
  id        String @id @default(cuid())
  companyId String
  payrollPeriodId String
  employeeId String
  method    PaymentMethodType
  amount    Decimal @db.Decimal(12, 2)
  status    PaymentStatus @default(PENDING)
  reference String?
  failureReason String?
  paidAt    DateTime?
  recordedById String?
  recordedBy   User? @relation(fields: [recordedById], references: [id])
  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  payrollPeriod PayrollPeriod @relation(fields: [payrollPeriodId], references: [id], onDelete: Cascade)
  employee  Employee @relation(fields: [employeeId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([payrollPeriodId, employeeId])
  @@index([companyId, status])
}

// ── Billing ────────────────────────────────────────────────────────
model SubscriptionPlan {
  id        String @id @default(cuid())
  code      String @unique // starter | growth | business
  name      String
  maxEmployees Int
  priceMonthly Decimal @db.Decimal(12, 2)
  trialDays Int @default(14)
  isActive  Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  subscriptions Subscription[]
}

model Subscription {
  id        String @id @default(cuid())
  companyId String @unique
  planId    String
  plan      SubscriptionPlan @relation(fields: [planId], references: [id])
  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  status    SubscriptionStatus
  trialEndsAt DateTime?
  currentPeriodEnd DateTime?
  stripeCustomerId     String?
  stripeSubscriptionId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ── Platform ───────────────────────────────────────────────────────
model AuditLog {
  id        String @id @default(cuid())
  companyId String?
  userId    String?
  action    String // e.g. payroll.approve, payment.export, auth.login_failed
  entityType String?
  entityId  String?
  metadata  Json?
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  company Company? @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user    User?    @relation(fields: [userId], references: [id])

  @@index([companyId, createdAt])
  @@index([userId])
  @@index([action])
}

model Notification {
  id        String @id @default(cuid())
  companyId String
  userId    String
  title     String
  body      String
  link      String?
  readAt    DateTime?
  createdAt DateTime @default(now())
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt])
  @@index([companyId])
}
```

---

## 3. Folder structure

Follows the brief's tree; only files that add clarity are shown.

```text
payflow/
├── payflow-designs/payflow-design-system.html   # visual source of truth ✅ exists
├── docker-compose.yml                            # postgres:16, redis:7, mailhog
├── .env.example / .env
├── package.json / tsconfig.json / next.config.ts / tailwind.config.ts
├── vitest.config.ts / playwright.config.ts / eslint.config.mjs
├── src/
│   ├── middleware.ts                             # coarse route gating only
│   ├── app/
│   │   ├── layout.tsx / globals.css / not-found.tsx / error.tsx / loading.tsx
│   │   ├── api/health/route.ts                   # db + redis + worker health
│   │   ├── api/payslips/[id]/download/route.ts   # authorized streams
│   │   ├── api/payroll/[periodId]/export-zip/route.ts
│   │   ├── api/payments/[periodId]/export-csv/route.ts
│   │   ├── (public)/ page.tsx, pricing/page.tsx  # landing + pricing
│   │   ├── (auth)/  login | register | verify-email | accept-invite |
│   │   │            forgot-password | reset-password
│   │   ├── (company)/  layout.tsx (tenant guard + read-only banner)
│   │   │   ├── dashboard/  setup/  organization/ (departments+positions)
│   │   │   ├── employees/  employees/[id]/
│   │   │   ├── team/       payroll/  payroll/[periodId]/(adjust|review|approve)
│   │   │   ├── payments/   payslips/ reports/    settings/ billing/ audit-log/
│   │   │   └── read-only and forbidden state screens shared in (shared)
│   │   ├── (employee)/ layout.tsx (EMPLOYEE guard)
│   │   │   └── portal/ (dashboard, payslips, payments, profile)
│   │   └── (super-admin)/ layout.tsx (isSuperAdmin guard)
│   │       └── admin/ (dashboard, companies, companies/[id], plans)
│   ├── components/{ui,layout,shared}/            # shadcn + design-system primitives
│   ├── features/<domain>/{components,actions,schemas}.ts
│   │   ├── auth company employees payroll payslips payments reports
│   │   ├── team super-admin subscription organization
│   ├── server/
│   │   ├── auth/        # session helpers, password, tokens
│   │   ├── rbac/        # permission matrix, requirePermission
│   │   ├── tenant/      # requireCompanyContext, effectiveStatus
│   │   ├── services/    # payroll-period, employee, payment, report, … (the only
│   │   │                #  place business rules live)
│   │   ├── repositories/# prisma, tenant-scoped by construction
│   │   ├── payroll-engine/  # pure: money.ts, calculate.ts, eligibility.ts,
│   │   │                    # anomalies.ts (zero DB imports, 100% testable)
│   │   ├── jobs/        # queue.ts (bullmq|inline), worker.ts, job handlers
│   │   ├── pdf/         # payslip-document.tsx, report-document.tsx
│   │   ├── storage/     # local driver now; S3 interface reserved
│   │   ├── email/       # console | smtp | resend providers + templates
│   │   ├── security/    # crypto.ts (AES-GCM), rate-limit.ts, audit.ts
│   │   └── utils/
│   ├── lib/             # format.ts (money/date), constants, env.ts (zod-validated)
│   ├── hooks/ types/ validations/
│   ├── i18n/en.ts
│   └── prisma/{schema.prisma, migrations/, seed.ts, seed-data/}
├── storage/   # gitignored runtime files (payslips, exports, logos)
├── docs/      # ARCHITECTURE, DATABASE, PAYROLL-RULES, PERMISSIONS, DECISIONS, PLAN
└── tests/{unit,integration,e2e}
```

Conventions: server actions/APIs → `services/*` only; services → `repositories/*`;
payroll math → `payroll-engine/*` (pure). No Prisma imports outside `repositories` and `services`.

---

## 4. Environment variables

Required:

| Var | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://payflow:payflow@localhost:5432/payflow` | Prisma |
| `AUTH_SECRET` | `openssl rand -base64 32` | Auth.js JWT signing |
| `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | AES-256-GCM key (64 hex) |
| `APP_URL` | `http://localhost:3000` | absolute links in emails |

Optional (with dev defaults):

| Var | Default | Purpose |
|---|---|---|
| `REDIS_URL` | — (inline queue) | BullMQ; absence ⇒ `QUEUE_DRIVER=inline` |
| `QUEUE_DRIVER` | `auto` (`bullmq`\|`inline`) | explicit override |
| `EMAIL_PROVIDER` | `console` \| `smtp` \| `resend` | outbox strategy |
| `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM` | mailhog `1025`, `PayFlow <noreply@payflow.test>` | dev email preview at :8025 |
| `RESEND_API_KEY` | — | prod email |
| `BILLING_PROVIDER` | `mock` \| `stripe` | billing adapter |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | — | real billing later |
| `STORAGE_DRIVER` / `STORAGE_DIR` | `local` / `./storage` | payslip/logo/export storage |
| `RATE_LIMIT_DRIVER` | `memory` \| `redis` | auth rate limiting |
| `DATABASE_URL_TEST` | `…:5432/payflow_test` | integration tests |
| `LOG_LEVEL`, `NODE_ENV`, `SEED_ADMIN_PASSWORD` | `info` | ops |

All validated at boot by `src/lib/env.ts` (Zod) — the app fails fast with a readable list of invalid vars.

---

## 5. Phased delivery — task list with acceptance criteria

> Phase 0–15 from the brief; ACs are the gate before moving on. Tests ride with every phase.

**P0 · Foundation** — repo scaffold (Next 15+TS strict), Tailwind v4 + shadcn wired to design tokens, env.ts guard, Prisma client + first migration, docker-compose, base layouts, `error/not-found/loading` pages, `/api/health` (db/redis/queue).
*AC:* `npm run dev` boots clean; health endpoint reports; typecheck+lint green; `/api/health` shows DB ✓.

**P1 · Auth & tenant core** — register-company (atomic: user+company+membership+trial), verify-email, login/logout, password reset, JWT sessions, `requireCompanyContext/requireMembership/requirePermission`, permission matrix for the 5 roles, audit service, rate-limited auth.
*AC:* full register→verify→login round trip; wrong-company IDs rejected even if forged; role-matrix unit tests pass; audit rows written.

**P2 · Setup wizard** — 5 steps (info → payroll settings → org basics → invites → checklist), resumable, `setupCompletedAt` gate on dashboard.
*AC:* fresh company completes wizard; checklist updates live; settings editable later.

**P3 · Departments & positions** — CRUD, unique names per company, archive-when-referenced, empty/skeleton states.
*AC:* duplicate name 409; referenced delete → archive; cross-tenant fetch = 404.

**P4 · Team & invitations** — invite (hashed token, 7-day), resend/revoke, accept flow for new+existing users, role change + disable membership, admin policies.
*AC:* invite→accept full path; expired/revoked token dead-ends with friendly screen; audit entries exist.

**P5 · Employees** — directory (search/filter/paginate 20), create/edit, tabbed profile, AES-GCM payment fields masked in UI/API, terminate/deactivate, auto employee codes `PB-0001`.
*AC:* ciphertext at rest (verified in psql); list query has no N+1; terminated employee excluded by engine eligibility.

**P6 · Payroll periods** — create with validation (order, no overlap, single active prep), state machine module with allowed transitions, detail page + summary cards.
*AC:* overlap rejected; illegal transitions (e.g. DRAFT→APPROVED) throw; machine unit-tested.

**P7 · Adjustments** — earnings/deductions tabs, CRUD rows, overtime-requires-hours, non-negative amounts, per-employee + grand totals, locked after SUBMITTED.
*AC:* validation tests; totals reconcile; post-lock mutation 403s.

**P8 · Payroll engine + processing** — pure engine (money, formula, eligibility, rounding), async run with progress (BullMQ or inline), payslip upserts, period totals, READY transition, idempotent reprocess in DRAFT/READY.
*AC:* 35 seeded employees process with visible progress; engine unit suite incl. edge cases (zero salary/hours, overtime-only, deduction-heavy, rounding, terminated exclusion, duplicate-run protection) all green.

**P9 · Review & approval** — KPI cards, dept cost + trend charts (Recharts), anomaly detector (net Δ>10%, missing bank details, negative net, high OT, duplicate patterns), submit→approve/reject(with note); controlled unlock (admin, reasoned, audited, pre-payment only).
*AC:* anomalies flag seeded outliers; approve freezes edits; unlock audit row carries reason.

**P10 · Payments** — payment list for APPROVED period, bank CSV export (server-decrypt, audit-logged), single/bulk status updates with reasons/references.
*AC:* CSV headers/rows exact; employee role gets 403 on export; statuses drive PAID transitions.

**P11 · Payslips (PDF)** — branded PDF (all 20 spec fields), secured download route, bulk ZIP, employee-scoped access, availability notification + email.
*AC:* PDF text matches payslip numbers; Emma downloads only her own; downloads audit-logged; ZIP streams N files.

**P12 · Employee portal** — dashboard, my payslips, payment history, profile (limited edit), portal-only nav & layout.
*AC:* e2e proves EMPLOYEE is bounced from company routes; masked data only.

**P13 · Reports** — 7 reports (summary, by-dept, trend, overtime, bonuses, deductions, per-employee), filters, KPI+chart+table layout, Excel/PDF export, finalized-periods-only.
*AC:* report numbers reconcile with seeded periods; exports download; tenant-scoped integration tests.

**P14 · Subscription & super admin** — trial clock, READ_ONLY enforcement + banner, suspension screen, admin dashboard w/ platform stats, company list/detail + suspend/reactivate, plans CRUD, mock-billing activation.
*AC:* expiring trial flips company and blocks mutations while reads still work; super admin cannot hit any company service (route separation + tests).

**P15 · Hardening** — complete the test pyramid, keyboard/a11y pass, responsive QA, states polish, README + docs + DECISIONS, final demo-script QA.
*AC:* `npm run typecheck / lint / test / e2e` all green; seeded demo walkthrough completes without a dead end.

---

## 6. Assumptions & decisions (please veto any)

1. **Super admin identity** — modeled as `User.isSuperAdmin`, not a `Membership` (a platform admin has no tenant). `SUPER_ADMIN` stays in the `Role` enum for schema parity but memberships never carry it. *(spec allowed enhancement*).
2. **Money math** — `big.js` decimal arithmetic in a `Money` type; DB columns `Decimal`; **final amounts rounded half-up to whole XAF** at payslip finalize (XAF is zero-decimal). No floats anywhere.
3. **Tax** — single flat `company.taxRate` applied to gross (spec formula). Real Cameroonian progressive PIT + CNPS social contributions are out of MVP scope; engine has a clean `StatutoryRule` hook for them later.
4. **Termination eligibility (chosen & documented):** an employee is in-scope for a period iff `dateHired ≤ period.endDate` **and** (`status = ACTIVE` **or** (`status = TERMINATED` **and** `terminationDate ≥ period.startDate`)). I.e. someone who worked any part of the period is paid for it; people terminated before it are excluded. INACTIVE always excluded.
5. **Sessions** — Auth.js v5 JWT (7-day rolling) + credentials provider; bcryptjs (12 rounds). Middleware does coarse gating; **services re-verify** membership, role, tenant and effective company status on every call (defense in depth).
6. **One workspace at a time** — schema supports multi-membership; MVP UI auto-selects the first ACTIVE company membership (switcher = stretch goal).
7. **Period overlap** — enforced in a serializable transaction at service level (Prisma can’t express exclusion constraints; optional raw-SQL `EXCLUDE` constraint can be added later without app changes).
8. **Queue fallback** — with no Redis, `QUEUE_DRIVER=inline` runs jobs in-process (still writing the same `PayrollRun` progress rows, honestly executed — not mocked). BullMQ is used the moment `REDIS_URL` is present. Both paths share one `JobQueue` interface.
9. **Unlock rule** — `APPROVED → READY` only, by COMPANY_ADMIN, reason required, and only while no payment is `SUCCESSFUL`; `PAID/LOCKED` can never be unlocked in MVP.
10. **Payslip numbering** — per-company `PS-YYYY-#####` sequence. Payment reference `PAY-YYYY-MM-<employeeCode>`.
11. **Reprocess semantics** — re-processing in DRAFT/READY **replaces** DRAFT payslips in-place (upsert by `(period, employee)`) inside one transaction; APPROVED payslips are never touched (enforced by DB query filter + engine guard).
12. **Reports data scope** — APPROVED/PAID/LOCKED periods only (not DRAFT/READY), so reports reflect finalized money.
13. **Employee login link** — an `Employee.userId` may link to an EMPLOYEE-role membership; an employee without a user account simply has no portal access (HR can invite them later).
14. **Currency display** — `1 250 000 XAF` (space-grouped, no decimals, `XAF` suffix) via our own Intl-based formatter; `fr-CM`-ready dictionaries; dates via `Intl` with `Africa/Douala`.
15. **Auth tokens** (verify-email, password-reset, invites): 32-byte random, **SHA-256-hashed at rest**, single-use, expiring (24h verify, 1h reset, 7d invite).
16. **Rate limits** — login & password-reset: 5 attempts / 15 min per IP+email; memory driver default, Redis when available.
17. **Password policy** — min 10 chars with 3-of-4 character classes; documented zod schema.
18. **Stack additions beyond the brief's list** (all boring, all necessary): bcryptjs, big.js, archiver, pino, sonner, react-hook-form, date-fns (durations), `@tanstack/react-table` for the heavy grids.
19. **Verification reality in this sandbox** — docker isn’t available here, so I’ll install/run Postgres + Redis natively in the sandbox to verify phases; the docker-compose file remains the path for local machines.
20. **Demo data realism** — 35 employees (34 active + 1 terminated), Cameroonian names/phones, MTN/Orange Money + local banks, salaries 85 000–950 000 XAF, 2 historical APPROVED+PAID periods with payslips/payments, 1 live DRAFT period with adjustments.
21. **Employee codes** — `PB-0001` style, per-company sequence, never reused (terminated employees keep their code for payroll history). Allocated server-side with retry on the `(companyId, employeeCode)` unique index (no client-supplied codes, no P2002 leaks).
22. **Sensitive-employment gating (P5)** — salary + payment *plaintext* are gated behind `employees.view_sensitive` (Company Admin, Accountant); HR Managers manage records without seeing compensation. Payment secrets are AES-256-GCM encrypted at rest (`v1.iv.tag.ct`), returned **masked** (`•••• 4521`) by default; reveal is an explicit `?reveal=1` server render for sensitive roles only. Audit metadata carries last-4 only, never plaintext or ciphertext.
23. **Payment-edit semantics** — empty form fields mean "keep the stored secret" (merged server-side, then resulting-state completeness validated per method); switching methods clears the other method's encrypted columns so stale secrets never linger. CASH wipes everything.
24. **Termination rules** — one-way (`TERMINATED` can't be reactivated; rehire = new record), date must be ≥ hire date and never future-dated (payroll consumes historical truth; scheduled departures stay ACTIVE until the day). ACTIVE ⇄ INACTIVE is free-form. Departments are derived from the chosen position (single select; the two can never disagree).
25. **Period overlap semantics** — day-inclusive intersection (Aug 1–31 and Aug 31–Sep 30 DO overlap); creation rejects with the clashing period's name + dates (CONFLICT). Display name is automated: "August 2026" for whole-month ranges, else an explicit "15 Jun – 15 Sept 2026" range.
26. **Single active prep period** — a company may only have one period in DRAFT/IN_PROGRESS/READY at a time; the next period opens when the current one is SUBMITTED. Only DRAFT periods with zero payslips can be deleted.
