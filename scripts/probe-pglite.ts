/**
 * Probe: can the dev PGlite data dir be opened? Exits 0 when healthy.
 * Used by bootstrap-dev.sh to auto-rebuild a corrupted dir (a PGlite abort
 * during a two-process open leaves the dir unopenable).
 */
import { PGlite } from "@electric-sql/pglite";

const dataDir = process.argv[2];
if (!dataDir) {
  console.error("usage: tsx scripts/probe-pglite.ts <dataDir>");
  process.exit(2);
}

const db = new PGlite(dataDir);
try {
  await db.query("SELECT 1");
  await db.close();
  console.log("healthy");
  process.exit(0);
} catch {
  console.log("corrupt");
  process.exit(1);
}
