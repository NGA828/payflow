# PayFlow

Multi-tenant payroll SaaS for SMBs in Africa (launch market: Cameroon, XAF).
Replaces spreadsheet payroll with a secure, role-aware platform: employees →
payroll periods → processing → approval → payments → branded PDF payslips.

## Stack

Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Prisma ·
PostgreSQL · Auth.js v5 · BullMQ + Redis (inline fallback) · @react-pdf/renderer ·
ExcelJS · Zod · Vitest · Playwright

## Quick start (local machine)

```bash
cp .env.example .env          # then set AUTH_SECRET and ENCRYPTION_KEY
npm install
docker compose up -d          # postgres, redis, mailhog (http://localhost:8025)
npm run db:migrate
npm run db:seed
npm run dev                   # http://localhost:3000
```

Generate secrets:

```bash
openssl rand -base64 32       # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
```

### No Docker?

Run with the embedded database driver (PostgreSQL compiled to WASM, persisted
in `./.pglite-data`):

```bash
# in .env
DB_DRIVER="pglite"
PGLITE_DATA="./.pglite-data"
```

then apply `src/prisma/migrations/*/migration.sql` with
`npx tsx scripts/db-execute.ts <file>` and seed as usual. `npm run db:up`
remains available if you want a PostgreSQL wire server on `127.0.0.1:5432` for
external SQL tools (stop it before starting the app — one process per data
dir). Without Redis, the inline queue driver runs background jobs in-process.

### Sandbox rebuilds

Volatile sandboxes that wipe `node_modules`/`.env` between sessions can
rebuild everything in one idempotent command:

```bash
bash scripts/bootstrap-dev.sh   # stubs → deps → .env → migrate+seed+fixture
```

Secrets are generated once and persisted outside the repo
(`~/opt/.payflow-secrets.json`); the dev DB lives at `/home/user/opt/pglite-data`
and tests use an isolated dir (`~/opt/pglite-test`) provisioned by vitest's
global setup. Embedded PGlite is single-writer: never attach scripts to the
dev data dir while `next dev` is running (tests are exempt by construction).

## Scripts

| command | purpose |
|---|---|
| `npm run dev` | dev server |
| `npm run build` / `start` | production build / serve |
| `npm run lint` / `typecheck` / `format` | static checks |
| `npm run test` / `test:e2e` | Vitest / Playwright |
| `npm run db:migrate` / `db:seed` / `db:reset` | Prisma lifecycle |
| `npm run db:up` | PGlite Postgres (Docker-free) |
| `npm run worker` | BullMQ worker process |
| `/api/health` | env, database and queue status |

## Docs

- `docs/PLAN.md` — engineering plan, full schema, phases, decisions
- `DESIGN.md` — design-language research
- `payflow-designs/payflow-design-system.html` — visual source of truth

## Demo credentials

The full demo workspace (Prime Builders Ltd — 5 users, 35 employees, paid payroll history) lands with the Phase 8 seed. Until then, the seed creates the platform super-admin:

| Role | Email | Password |
|---|---|---|
| Super admin | `superadmin@payflow.test` | `PayFlow-Admin#1` |

Override the super-admin password via `SEED_ADMIN_PASSWORD` before seeding. **Never use this account in production.**
