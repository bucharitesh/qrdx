import path from "node:path";
import type { ViteUserConfig } from "vitest/config";

const root = import.meta.dirname;
const qrdx = path.resolve(root, "../../packages/qrdx");

// Vitest suites live in tests/ (unit) and e2e/ (browser, run separately with
// `pnpm test:e2e`). The older node:test files next to the code run through
// scripts/run-node-tests.mjs.
const config: ViteUserConfig = {
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${root}/` },
      // Test the qrdx source, not its last build.
      { find: /^qrdx$/, replacement: `${qrdx}/src/index.tsx` },
      { find: /^qrdx\/types$/, replacement: `${qrdx}/types/index.ts` },
      // Server-only modules are imported directly by these tests.
      { find: /^server-only$/, replacement: `${root}/tests/support/empty.ts` },
      // The design system imports itself by package name (its tsconfig path),
      // which pnpm doesn't link inside the package.
      {
        find: /^@repo\/design-system\//,
        replacement: `${path.resolve(root, "../../packages/design-system")}/`,
      },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 30_000,
    // Obviously fake values: lib/env validates on import. Nothing here
    // connects to a database or any external service.
    env: {
      DATABASE_URL: "postgres://user:pass@localhost:5432/test",
      BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      VERCEL_API_TOKEN: "test-vercel-token",
      VERCEL_PROJECT_ID: "prj_test",
      VERCEL_TEAM_ID: "team_test",
      R2_ACCOUNT_ID: "test-account",
      R2_ACCESS_KEY_ID: "test-access-key",
      R2_SECRET_ACCESS_KEY: "test-secret-key",
      R2_BUCKET: "test-bucket",
      RESEND_API_KEY: "",
      FAL_KEY: "",
    },
  },
};

export default config;
