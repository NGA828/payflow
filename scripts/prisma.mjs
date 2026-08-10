#!/usr/bin/env node
/**
 * Cross-platform Prisma CLI wrapper (replaces `bash scripts/prisma.sh`).
 *
 * The build sandbox cannot reach binaries.prisma.sh, so Prisma's native engine
 * download fails there. A stub directory (~/.prisma-bin) marks that sandbox;
 * when present, we point Prisma at stub binaries (the app runtime uses the
 * WASM query compiler + driver adapters, so native engines are never executed).
 *
 * Everywhere else (Windows/macOS/Linux dev machines, CI) this is a transparent
 * pass-through to the locally installed Prisma CLI — no bash required.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const env = { ...process.env };
const stubDir = join(homedir(), ".prisma-bin");
if (existsSync(stubDir)) {
  env.PRISMA_SCHEMA_ENGINE_BINARY = join(stubDir, "schema-engine");
  env.PRISMA_QUERY_ENGINE_LIBRARY = join(stubDir, "libquery_engine.so.node");
}

const args = process.argv.slice(2);

// Prefer the locally installed CLI entry: no npx resolution, works offline.
let cliEntry = null;
try {
  cliEntry = fileURLToPath(import.meta.resolve("prisma/build/index.js"));
} catch {
  cliEntry = null;
}

const result = cliEntry
  ? spawnSync(process.execPath, [cliEntry, ...args], { stdio: "inherit", env })
  : spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", ...args], {
      stdio: "inherit",
      env,
    });

if (result.error) {
  console.error("[prisma] failed to launch the Prisma CLI:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
