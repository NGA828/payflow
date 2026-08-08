#!/usr/bin/env bash
# Prisma CLI wrapper.
#
# The build sandbox cannot reach binaries.prisma.sh, so Prisma's native engine
# download fails there. A stub directory (~/.prisma-bin) marks that sandbox;
# when present, we point Prisma at stub binaries (runtime uses the WASM query
# compiler + driver adapter, so native engines are never executed in sandbox).
#
# On normal machines the stubs don't exist and this is a transparent pass-through.
set -euo pipefail

STUB_DIR="${HOME}/.prisma-bin"
if [ -d "$STUB_DIR" ]; then
  export PRISMA_SCHEMA_ENGINE_BINARY="$STUB_DIR/schema-engine"
  export PRISMA_QUERY_ENGINE_LIBRARY="$STUB_DIR/libquery_engine.so.node"
fi

exec npx prisma "$@"
