import path from "node:path";
import type { ViteUserConfig } from "vitest/config";

const root = import.meta.dirname;

// Tests must not see the deployment's environment: Vercel runs them inside
// `turbo build` with production values (NODE_ENV=production, the real app
// URL, Redis, Polar, ...), which changed URLs, CSRF origins, rate limits and
// analytics gating. Drop deployment and service variables before any test
// module loads; `test.env` below then sets the fixed fake ones.
const DEPLOYMENT_ENV =
  /^(VERCEL|NEXT_PUBLIC_|KV_|UPSTASH_|REDIS_|POLAR_|RESEND_|EMAIL_|GOOGLE_|GITHUB_|R2_|DUB_|DROPBOX_|SLACK_|HUBSPOT_|MAILCHIMP_|NOTION_|BOX_|MICROSOFT_|CALENDLY_|STRIPE_|SHOPIFY_|WEB_RISK_|GROQ_|FAL_|CRON_|ADMIN_|INTEGRATION_|SCAN_HASH|TURNSTILE_|POSTHOG_|UMAMI_|DATABASE_|PG|POSTGRES_|NEON_|BETTER_AUTH_|QRDX_|SHORT_LINK|BASE_URL)/;
for (const key of Object.keys(process.env)) {
  if (DEPLOYMENT_ENV.test(key)) delete process.env[key];
}
// Next types NODE_ENV as read-only; it isn't at runtime.
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
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
      NODE_ENV: "test",
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
