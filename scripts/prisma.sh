#!/usr/bin/env bash
# Compatibility shim — the canonical wrapper is now cross-platform:
# scripts/prisma.mjs (Node, no bash required, Windows-friendly).
set -euo pipefail
exec node "$(dirname "$0")/prisma.mjs" "$@"
