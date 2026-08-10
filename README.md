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
cp .env.example .env          # Windows: copy .env.example .env
npm install                   # generates the Prisma client automatically
docker compose up -d          # postgres, redis, mailhog (http://localhost:8025)
npm run db:migrate
npm run db:seed
npm run dev                   # http://localhost:3000
```

Then edit `.env` and set `AUTH_SECRET` and `ENCRYPTION_KEY`:

```bash
openssl rand -base64 32       # AUTH_SECRET (any OS: Git Bash / WSL / macOS)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
```

### Windows (no Docker, no bash)

Everything runs natively in cmd/PowerShell — scripts are Node-based:

```bat
copy .env.example .env
:: edit .env — set AUTH_SECRET, ENCRYPTION_KEY, DB_DRIVER="pglite", PGLITE_DATA="./.pglite-data"
npm install
npm run db:setup
npm run dev
```

### No Docker?

Run with the embedded database driver (PostgreSQL compiled to WASM, persisted
in `./.pglite-data`) — set in `.env`:

```bash
DB_DRIVER="pglite"
PGLITE_DATA="./.pglite-data"
```

then one command applies pending migrations and seeds (idempotent, safe to
re-run): `npm run db:setup`. `npm run db:up` remains available if you want a
PostgreSQL wire server on `127.0.0.1:5432` for external SQL tools (stop it
before starting the app — one process per data dir). Without Redis, the
inline queue driver runs background jobs in-process.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `'bash' is not recognized` (Windows) | Fixed — all npm scripts call `node scripts/prisma.mjs`. Pull latest and `npm install` |
| `@prisma/client did not initialize yet` on /login or /register | `npm run db:generate`, then restart `npm run dev` |
| `WebAssembly.instantiate(): ... extends past end of the module` when seeding | Corrupted PGlite download. `rd /s /q node_modules\@electric-sql` (macOS/Linux: `rm -rf node_modules/@electric-sql`), then `npm cache clean --force && npm install`, then `npm run db:setup` |
| `docker` is not recognized | Optional — use the embedded driver above; no Docker needed |
| Data dir unopenable / two-process crash | Stop other processes using it and re-run `npm run db:setup` (it rebuilds automatically) |

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
| `npm run db:setup` | Embedded DB: migrate + seed in one idempotent step |
| `npm run db:up` | PGlite Postgres wire server (Docker-free) |
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
