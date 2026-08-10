/**
 * One-command embedded-database setup for Docker-free machines — Windows
 * included (no bash, no Docker, no Postgres server required):
 *
 *     npm run db:setup
 *
 * What it does (every step idempotent, safe to re-run):
 *   1. Probes the PGlite data dir in a child process; an unopenable dir is
 *      moved aside and rebuilt from scratch (the dev DB is disposable).
 *   2. Applies any pending src/prisma/migrations/<name>/migration.sql files,
 *      recording per-migration markers (.applied-<name>) inside the data dir —
 *      the same convention as scripts/bootstrap-dev.sh.
 *   3. Runs the idempotent seed (src/prisma/seed.ts) in a child process.
 *
 * Prerequisite: .env with DB_DRIVER="pglite" (see README → "No Docker?").
 */
import "dotenv/config";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";

const dataDir = resolve(process.env.PGLITE_DATA ?? ".pglite-data");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function pgliteInstallHint(): never {
  console.error(
    [
      "",
      "✖ PGlite's embedded PostgreSQL (WASM) failed to load — the package files",
      "  in node_modules are corrupted (an interrupted npm download). Fix:",
      "",
      "    Windows:  rd /s /q node_modules\\@electric-sql",
      "    macOS/Linux: rm -rf node_modules/@electric-sql",
      "    then:     npm cache clean --force && npm install",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

function isWasmCompileProblem(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "CompileError" ||
      /WebAssembly\./.test(String(error.message)) ||
      /extends past end of the module/.test(String(error.message)) ||
      /AbortError|aborted\(/i.test(String(error.message)))
  );
}

function runTsx(script: string, scriptArgs: string[]): number {
  const result = spawnSync(npx, ["tsx", script, ...scriptArgs], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    console.error(`✖ failed to launch ${script}:`, result.error.message);
    process.exit(1);
  }
  return result.status ?? 1;
}

async function main(): Promise<void> {
  if ((process.env.DB_DRIVER ?? "pg") !== "pglite") {
    console.error(
      "db:setup is for the embedded driver. Set DB_DRIVER=\"pglite\" in .env first,\n" +
        'or use "npm run db:migrate" against your own PostgreSQL (DATABASE_URL).',
    );
    process.exit(1);
  }

  // 1. Probe an existing data dir — a corrupted dir can hard-abort the WASM
  //    runtime, so the probe runs in a child process (mirrors bootstrap-dev.sh).
  if (existsSync(dataDir)) {
    if (runTsx("scripts/probe-pglite.ts", [dataDir]) !== 0) {
      const aside = `${dataDir}.corrupt-${Date.now()}`;
      try {
        renameSync(dataDir, aside);
      } catch {
        rmSync(dataDir, { recursive: true, force: true });
      }
      console.warn(`⚠ data dir was unopenable — moved aside (${aside}), rebuilding`);
    }
  }

  // 2. Pending migrations
  const migrationsDir = resolve("src/prisma/migrations");
  const pending = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .filter((name) => !existsSync(join(dataDir, `.applied-${name}`)));

  if (pending.length === 0) {
    console.log("✓ schema already up to date");
  } else {
    let db: PGlite;
    try {
      db = new PGlite(dataDir);
      await db.waitReady;
    } catch (error) {
      if (isWasmCompileProblem(error)) pgliteInstallHint();
      throw error;
    }
    try {
      for (const name of pending) {
        const file = join(migrationsDir, name, "migration.sql");
        await db.exec(readFileSync(file, "utf8"));
        mkdirSync(dataDir, { recursive: true });
        writeFileSync(join(dataDir, `.applied-${name}`), "");
        console.log(`✓ migration applied: ${name}`);
      }
    } catch (error) {
      if (isWasmCompileProblem(error)) {
        await db.close().catch(() => undefined);
        pgliteInstallHint();
      }
      console.error(
        `\n✖ migration failed. The embedded DB may be half-applied — wipe it and retry:\n` +
          `    rm -rf "${dataDir}" && npm run db:setup`,
      );
      throw error;
    } finally {
      await db.close().catch(() => undefined);
    }
  }

  // 3. Seed (child process — PGlite is single-writer, and the seed owns its
  //    own client). A corrupt WASM build also surfaces here as a crash.
  const seedStatus = runTsx("src/prisma/seed.ts", []);
  if (seedStatus !== 0) {
    console.error(
      "\n✖ seed failed. If the error mentions WebAssembly/CompileError, the PGlite",
      "\n  package is corrupted — reinstall it:",
      "\n    Windows:  rd /s /q node_modules\\@electric-sql",
      "\n    macOS/Linux: rm -rf node_modules/@electric-sql",
      "\n    then:     npm cache clean --force && npm install",
      "\n  Otherwise re-run: npm run db:seed",
    );
    process.exit(seedStatus);
  }

  console.log("✓ embedded database ready — start the app with: npm run dev");
  console.log(`  data dir: ${dataDir}`);
}

main().catch((error: unknown) => {
  if (isWasmCompileProblem(error)) pgliteInstallHint();
  console.error(error);
  process.exit(1);
});
