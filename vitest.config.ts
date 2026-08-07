import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { TEST_PGLITE_DATA } from "./tests/test-env";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globalSetup: ["./tests/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: false,
    /**
     * Integration tests get a dedicated embedded-Postgres data dir so they
     * never touch the dev server database (PGlite is single-writer).
     * Ignored when DB_DRIVER=pg.
     */
    env: {
      PGLITE_DATA: TEST_PGLITE_DATA,
    },
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
