/**
 * Vitest global setup: prepares the isolated test database.
 *
 * When DB_DRIVER=pglite and RUN_DB_TESTS=1, the suite runs against an
 * embedded Postgres rooted at TEST_PGLITE_DATA (never the dev data dir).
 * This applies any migrations the test database has not seen yet; applied
 * files are remembered in a marker JSON inside the data dir.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEST_PGLITE_DATA } from "./test-env";

const MIGRATIONS_DIR = join(__dirname, "..", "src", "prisma", "migrations");
const MARKER = join(TEST_PGLITE_DATA, ".applied-migrations.json");

interface Marker {
  applied: string[];
  seeded?: boolean;
}

function readMarker(): Marker {
  try {
    return JSON.parse(readFileSync(MARKER, "utf8")) as Marker;
  } catch {
    return { applied: [] };
  }
}

export default function setup(): void {
  if (process.env.RUN_DB_TESTS !== "1") return;
  if ((process.env.DB_DRIVER ?? "pg") !== "pglite") return; // real Postgres: CI manages migrations

  mkdirSync(TEST_PGLITE_DATA, { recursive: true });

  const files = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
    .map((entry) => join(entry.name, "migration.sql"))
    .sort();

  const marker = readMarker();
  const pending = files.filter((file) => !marker.applied.includes(file));
  for (const file of pending) {
    execFileSync(
      "npx",
      ["tsx", "scripts/db-execute.ts", join(MIGRATIONS_DIR, file)],
      {
        env: { ...process.env, PGLITE_DATA: TEST_PGLITE_DATA },
        stdio: "inherit",
      },
    );
    marker.applied.push(file);
    marker.seeded = false; // schema reset — re-seed below
  }

  if (!marker.seeded) {
    execFileSync("npx", ["tsx", "src/prisma/seed.ts"], {
      env: { ...process.env, PGLITE_DATA: TEST_PGLITE_DATA },
      stdio: "inherit",
    });
    marker.seeded = true;
  }

  if (pending.length > 0 || !existsSync(MARKER)) {
    writeFileSync(MARKER, JSON.stringify(marker, null, 2));
  }
}
