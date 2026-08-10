/**
 * Applies a .sql file to the database.
 * Used for sandbox schema application where Prisma's schema-engine binary is
 * unavailable; on normal machines use `npm run db:migrate` instead.
 *
 * Usage: DB_DRIVER=pglite npx tsx scripts/db-execute.ts <file.sql>
 *        (default: connects over DATABASE_URL via node-postgres)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: npx tsx scripts/db-execute.ts <file.sql>");
    process.exit(1);
  }
  const sql = readFileSync(file, "utf8");

  if (process.env.DB_DRIVER === "pglite") {
    const dataDir = resolve(process.env.PGLITE_DATA ?? ".pglite-data");
    const client = new PGlite(dataDir);
    await client.waitReady;
    await client.exec(sql);
    await client.close();
    console.log(`Applied ${file} (pglite embedded at ${dataDir})`);
    return;
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`Applied ${file}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
