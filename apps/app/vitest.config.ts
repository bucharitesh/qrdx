import path from "node:path";
import type { ViteUserConfig } from "vitest/config";

const root = import.meta.dirname;

// Tests must not see the deployment's environment: Vercel runs them inside
// `turbo build` with production values (NODE_ENV=production, the real app
// URL, Redis, Polar, ...), which changed URLs, CSRF origins, rate limits and
// analytics gating. Drop deployment and service variables before any test
// module loads; `test.env` below then sets the fixed fake ones.
const DEPLOYMENT_ENV =
  /^(VERCEL|ANALYZE|NEXT_OUTPUT|NEXT_RUNTIME|DOMAIN_CONNECT_|NEXT_PUBLIC_|KV_|UPSTASH_|REDIS_|POLAR_|RESEND_|EMAIL_|GOOGLE_|GITHUB_|R2_|DUB_|BITLY_|DROPBOX_|SLACK_|DISCORD_|HUBSPOT_|MAILCHIMP_|NOTION_|BOX_|MICROSOFT_|CALENDLY_|STRIPE_|SHOPIFY_|WEB_RISK_|GSC_|GROQ_|AI_|OPENAI_|YOUTUBE_|SPOTIFY_|TELEGRAM_|CSP_|CRON_|ADMIN_|INTEGRATION_|SCAN_HASH|TURNSTILE_|DOCS_|CONSOLE_|SITE_|POSTHOG_|UMAMI_|DATABASE_|PG|POSTGRES_|NEON_|BETTER_AUTH_|QRDX_|SAFETY_|SHORT_LINK|BASE_URL)/;
// The official frame scan switches are test settings, not deployment ones
// (packages/qrdx/scripts/official-frames/sample.mjs): keep them.
const FRAME_SCAN_ENV = [
  "QRDX_FULL_FRAME_SCAN",
  "QRDX_FRAME_SCAN_DAY",
  "QRDX_FRAME_SCAN_PART",
].flatMap((key) =>
  process.env[key] === undefined ? [] : [[key, process.env[key]]],
);
for (const key of Object.keys(process.env)) {
  if (DEPLOYMENT_ENV.test(key)) delete process.env[key];
}
Object.assign(process.env, Object.fromEntries(FRAME_SCAN_ENV));
// Next types NODE_ENV as read-only; it isn't at runtime.
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
const qrdx = path.resolve(root, "../../packages/qrdx");

// Vitest suites live in tests/ (unit) and e2e/ (browser, run separately with
// `bun run test:e2e`). The older node:test files next to the code run through
// scripts/run-node-tests.mjs.
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
    // Vitest keeps its module cache in node_modules/.vitest-cache at the
    // workspace root, shared by every package by default. The pre-push hook
    // runs several packages' tests at once and they cleared it under each
    // other (ENOTEMPTY), so each package keeps its own.
    fsModuleCachePath: `${import.meta.dirname}/node_modules/.vitest-cache`,
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 30_000,
    server: {
      deps: {
        // Imports "next/server" without an extension, which Node's ESM
        // resolver refuses outside Next; through Vite it resolves (the
        // Polar webhook route's tests load it).
        inline: ["@polar-sh/nextjs"],
      },
    },
    // Obviously fake values: env.ts validates on import. Nothing here
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
      // Workspace SSO (ee/) is on, as on qrdx.dev; tests/auth/sso-off.test.ts
      // loads the auth server without it.
      QRDX_EE_LICENSE: "test-license",
    },
  },
};

export default config;
