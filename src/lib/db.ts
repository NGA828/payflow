import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import pg from "pg";

/**
 * Database access. Prisma runs with the WASM query compiler over a driver
 * adapter; the adapter is selected by DB_DRIVER:
 *
 * - "pg" (default, production/Docker) — node-postgres pool → real PostgreSQL.
 * - "pglite" (Docker-free dev/sandbox) — embedded PostgreSQL (PGlite WASM)
 *   persisted at PGLITE_DATA. No servers needed. In-process and single-user,
 *   so connection contention cannot occur.
 */

export type DbDriver = "pg" | "pglite";

export function getDbDriver(): DbDriver {
  return process.env.DB_DRIVER === "pglite" ? "pglite" : "pg";
}

interface DbGlobal {
  pgPool?: pg.Pool;
  pglite?: PGlite;
  prisma?: PrismaClient;
}

const globalForDb = globalThis as unknown as { payflowDb?: DbGlobal };

function store(): DbGlobal {
  if (!globalForDb.payflowDb) globalForDb.payflowDb = {};
  return globalForDb.payflowDb;
}

function getPgPool(): pg.Pool {
  const s = store();
  if (!s.pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const max = Number(process.env.DATABASE_POOL_MAX ?? 10);
    s.pgPool = new pg.Pool({
      connectionString,
      max: Number.isFinite(max) && max > 0 ? max : 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return s.pgPool;
}

export async function getPGlite(): Promise<PGlite> {
  const s = store();
  if (!s.pglite) {
    const dataDir = process.env.PGLITE_DATA ?? `${process.env.HOME}/opt/pglite-data`;
    const instance = new PGlite(dataDir);
    await instance.waitReady;
    s.pglite = instance;
  }
  return s.pglite;
}

export async function createServerPrismaClient(): Promise<PrismaClient> {
  if (getDbDriver() === "pglite") {
    const instance = await getPGlite();
    return new PrismaClient({ adapter: new PrismaPGlite(instance) });
  }
  return new PrismaClient({
    adapter: new PrismaPg(getPgPool()),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/** Synchronous accessor for the app singleton (created lazily). */
export function getDb(): PrismaClient {
  const s = store();
  if (!s.prisma) {
    if (getDbDriver() === "pglite") {
      // Embedded driver: PGlite is ready on first await internally.
      const dataDir = process.env.PGLITE_DATA ?? `${process.env.HOME}/opt/pglite-data`;
      s.pglite = new PGlite(dataDir);
      s.prisma = new PrismaClient({ adapter: new PrismaPGlite(s.pglite) });
    } else {
      s.prisma = new PrismaClient({
        adapter: new PrismaPg(getPgPool()),
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
      });
    }
  }
  return s.prisma;
}

export const db = getDb();

/** Gracefully close the client and underlying connections (scripts/tests). */
export async function disposeDb(): Promise<void> {
  const s = store();
  if (s.prisma) {
    await s.prisma.$disconnect();
    s.prisma = undefined;
  }
  if (s.pgPool) {
    await s.pgPool.end();
    s.pgPool = undefined;
  }
  if (s.pglite) {
    await s.pglite.close();
    s.pglite = undefined;
  }
}
