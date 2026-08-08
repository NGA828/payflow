#!/usr/bin/env bash
# One-command sandbox/dev environment rebuild. Safe to re-run — every step is
# idempotent. Runs automatically at the start of each agent turn; run manually
# after a fresh clone too.
#
#   bash scripts/bootstrap-dev.sh
#
# Steps: Prisma CLI engine stubs (offline sandbox) -> npm ci -> .env ->
# embedded PGlite database (pending migrations + base seed + e2e fixture).
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. Prisma CLI engine stubs. binaries.prisma.sh is unreachable in the offline
#    sandbox; the CLI only probes these during `generate`/`migrate`. The app
#    runtime uses the WASM query compiler + driver adapters instead.
STUB_DIR="${HOME}/.prisma-bin"
if [ ! -d "$STUB_DIR" ]; then
  mkdir -p "$STUB_DIR"
  printf '#!/bin/sh\necho "schema-engine-cli c2990dca591cba766e3b7ef5d9e8a84796e47ab7"\nexit 0\n' > "$STUB_DIR/schema-engine"
  chmod +x "$STUB_DIR/schema-engine"
  : > "$STUB_DIR/libquery_engine.so.node"
  echo "✓ Prisma engine stubs created"
fi

# 2. Dependencies
if [ ! -d node_modules ] || [ ! -x node_modules/.bin/next ]; then
  npm ci --no-audit --no-fund
  echo "✓ Dependencies installed"
fi

# 3. Environment file (never clobbers an existing .env)
npx tsx scripts/bootstrap-env.ts

# 4. Embedded database: apply pending migrations (per-migration markers),
#    then idempotent base seed + e2e fixture. A dir that fails to open
#    (PGlite abort after a two-process open, interrupted write) is moved
#    aside and rebuilt from scratch — the dev DB is fully disposable.
DEV_DB="${PGLITE_DATA:-$HOME/opt/pglite-data}"
if [ -d "$DEV_DB" ] && ! npx tsx scripts/probe-pglite.ts "$DEV_DB" >/dev/null 2>&1; then
  mv "$DEV_DB" "${DEV_DB}.corrupt-$(date +%s)" || rm -rf "$DEV_DB"
  echo "⚠ PGlite data dir was unopenable — moved aside, rebuilding from scratch"
fi
for d in src/prisma/migrations/*/; do
  name="$(basename "$d")"
  [ -f "$DEV_DB/.applied-$name" ] && continue
  npx tsx scripts/db-execute.ts "$d/migration.sql"
  mkdir -p "$DEV_DB"
  touch "$DEV_DB/.applied-$name"
  echo "✓ Migration applied: $name"
done
npx tsx src/prisma/seed.ts
npx tsx scripts/e2e-fixture.ts

echo "✓ Dev environment ready"
