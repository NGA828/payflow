/**
 * Local database runner for environments where Docker is unavailable.
 * Serves a real PostgreSQL wire protocol on 127.0.0.1:5432 backed by PGlite
 * (PostgreSQL compiled to WASM). When docker-compose is available, prefer it.
 *
 * Usage: npm run db:up
 */
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

async function main() {
  const dataDir = resolve(process.env.PGLITE_DATA ?? ".pglite-data");
  const port = Number(process.env.PGLITE_PORT ?? 5432);

  const db = new PGlite(dataDir);
  await db.waitReady;

  // Note: the app primarily uses the embedded driver (DB_DRIVER=pglite).
  // This socket server is for external SQL tooling only — stop it before
  // starting the app (PGlite allows one process per data directory).
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
  await server.start();

  console.log(`[dev-db] PostgreSQL wire server on 127.0.0.1:${port}`);
  console.log(`[dev-db] data directory: ${dataDir}`);
  console.log(`[dev-db] connection:     postgresql://postgres:postgres@127.0.0.1:${port}/postgres`);

  async function shutdown() {
    await server.stop();
    await db.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
