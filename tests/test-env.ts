/**
 * Shared test environment constants. Embedded PGlite is a single-writer
 * snapshot database: tests MUST run against their own data directory so a
 * running dev server (or any second process) can never collide with them.
 */

/** Dedicated PGlite data dir for the test suite. Never the dev dir. */
export const TEST_PGLITE_DATA = `${process.env.HOME ?? "/home/user"}/opt/pglite-test`;

/** False when tests run in a real-Postgres environment (CI/Docker). */
export const usingPGlite = (process.env.DB_DRIVER ?? "pg") === "pglite";
