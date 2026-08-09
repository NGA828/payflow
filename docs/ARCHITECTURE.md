# Architecture

## Stack
Next.js 15 App Router (RSC) + TypeScript strict + Tailwind v4 + Prisma 6 + PostgreSQL 16 (PGlite embedded fallback) + Auth.js v5 JWT + BullMQ/Redis inline fallback + @react-pdf/renderer + ExcelJS + archiver + Zod + Vitest + Playwright.

## Layers
- **App Router**: `(public)` landing, `(auth)` login/register/invite/verify/reset, `(company)` staff workspace (dashboard, org, employees, payroll, reports, billing, audit-log), `(employee)` portal, `(super-admin)` admin.
- **Components**: `components/ui` (shadcn) + `components/layout` (app-shell with role-filtered nav). Design tokens from `payflow-design-system.html` via `globals.css` `@theme`.
- **Features**: thin client wrappers (`features/*`) that call server actions. No business logic in features.
- **Server**:
  - `auth/` session helpers, password hashing, token generation (SHA-256 at rest).
  - `rbac/permissions.ts` permission matrix, `requirePermission`.
  - `tenant/context.ts` resolves active membership → company → effectiveStatus (trial expiry). `tenant/employee-context.ts` for portal. `tenant/status.ts` pure status logic (no DB, safe for unit tests).
  - `services/` business rules only place (repositories are Prisma calls inside services). No Prisma imports outside services/repositories.
  - `payroll/` pure engine (money.ts big.js, engine.ts calculate, eligibility.ts, anomalies.ts) — 100% testable, zero DB imports.
  - `jobs/` queue abstraction (BullMQ | inline) + worker.
  - `pdf/` payslip and report documents.
  - `security/` crypto (AES-256-GCM), rate-limit, audit.
- **Lib**: format (XAF, dates Africa/Douala), env (Zod-validated), roles, utils, payroll-ui.
- **Validations**: Zod schemas shared client/server, server re-validates always.
- **Prisma**: schema at `src/prisma/schema.prisma`, migrations, seed (plans + superadmin + e2e fixture).

## Data Flow
1. Middleware coarse gating (JWT presence, admin/portal prefix).
2. Layout `requireCompanyContext` / `requireEmployeeContext` / `requireSuperAdmin` — fine-grained tenant + role + effectiveStatus.
3. Server actions → services (assertCompanyWritable, permission, state-machine, overlap checks) → Prisma — audit log written.
4. Payroll: DRAFT → IN_PROGRESS (processPayroll writes PayrollRun progress, upserts payslips, allocates PS-YYYY-#####) → READY → SUBMITTED → APPROVED (materializes payments + notifies) → PAID (all payments SUCCESSFUL) → LOCKED.
5. Reports: read-only over finalized periods (APPROVED/PAID/LOCKED), aggregates payslips + adjustments in memory with Big.js, exports Excel/PDF.

## Security
- Row-level tenancy: every query filtered by companyId derived from membership, never client-supplied.
- AES-256-GCM at rest for bank/momo secrets (`v1.iv.tag.ct`), masked UI (`•••• 4521`), reveal explicit.
- Auth tokens hashed at rest (SHA-256), single-use, expiring.
- Rate limiting (in-memory or Redis) on auth endpoints.
- Audit log immutable, metadata last-4 only, never plaintext secrets.
- Super admin separation: `isSuperAdmin` boolean, no company membership, admin routes check `requireSuperAdmin`, company layout shows gate for superadmin.

## Deployment
- `docker-compose.yml` postgres, redis, mailhog.
- No Docker: `DB_DRIVER=pglite`, embedded DB at `PGLITE_DATA`, persisted outside repo (`~/opt/.payflow-secrets.json`, `/home/user/opt/pglite-data`).
- `scripts/bootstrap-dev.sh` idempotent rebuild: stubs → deps → .env → migrate+seed+fixture.
- `npm run build` traces fonts via `outputFileTracingIncludes`.

## Testing
- Vitest unit (pure engine, money, validations, RBAC, portal nav, reports constants, subscription status) + integration (org, employees, payroll periods, processing, approval, payments, payslips, team, invitations) with isolated PGlite test DB (`~/opt/pglite-test`) provisioned by global-setup.
- Playwright e2e (stretch) would verify EMPLOYEE bounced from company routes.
