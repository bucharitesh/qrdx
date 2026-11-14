import path from "node:path";
import type { ViteUserConfig } from "vitest/config";

const root = import.meta.dirname;

// As in the main app (apps/app/vitest.config.ts): tests must not see the
// deployment's environment, so deployment and service variables are dropped
// before any test module loads, and `test.env` sets fixed fake ones.
const DEPLOYMENT_ENV =
  /^(VERCEL|ANALYZE|NEXT_OUTPUT|NEXT_RUNTIME|NEXT_PUBLIC_|MAIN_ZONE_URL|DOCS_|GITHUB_|R2_|CSP_|POSTHOG_|UMAMI_|QRDX_)/;
for (const key of Object.keys(process.env)) {
  if (DEPLOYMENT_ENV.test(key)) delete process.env[key];
}
// Next types NODE_ENV as read-only; it isn't at runtime.
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
const qrdx = path.resolve(root, "../../packages/qrdx");

const config: ViteUserConfig = {
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    alias: [
      // The registry sources import each other as @/registry/... (tsconfig
      // paths); they live in packages/docs-assets.
      {
        find: /^@\/registry\//,
        replacement: `${path.resolve(root, "../../packages/docs-assets/registry")}/`,
      },
      { find: /^@\//, replacement: `${root}/` },
      // Test the qrdx source, not its last build.
      { find: /^qrdx$/, replacement: `${qrdx}/src/index.tsx` },
      { find: /^qrdx\/types$/, replacement: `${qrdx}/types/index.ts` },
      // Server-only modules are imported directly by these tests.
      { find: /^server-only$/, replacement: `${root}/tests/support/empty.ts` },
      // The design system imports itself by package name (its tsconfig path),
      // which Bun doesn't link inside the package.
      {
        find: /^@repo\/design-system\//,
        replacement: `${path.resolve(root, "../../packages/design-system")}/`,
      },
    ],
  },
  test: {
    environment: "node",
    // Each package keeps its own module cache (the main app's config says why).
    fsModuleCachePath: `${import.meta.dirname}/node_modules/.vitest-cache`,
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 30_000,
    // Obviously fake values: env.ts validates on import.
    env: {
      NODE_ENV: "test",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
  },
};

export default config;
