// Writes the REST API's OpenAPI document (lib/openapi/document.ts) to
// public/openapi.json, served at qrdx.dev/openapi.json and
// api.qrdx.dev/openapi.json, the API reference pages built from it
// (content/docs/developers/api) and the errors page (scripts/openapi/pages.ts).
// Run after changing a /v1 route, its schemas or lib/openapi:
//
//   pnpm openapi:generate
//
// tests/api/openapi.test.ts fails while the committed files are stale.
//
// Modules resolve as in the Vitest suites (scripts/openapi/tsconfig.json:
// "server-only" is a stub, qrdx is its source), with the suites' fake
// environment, so nothing connects to a database or any other service.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const OPENAPI_PATH = join(root, "public", "openapi.json");
const biomePath = join(root, "..", "..", "node_modules", ".bin", "biome");

// Same rule as vitest.config.ts: no deployment or service values.
const DEPLOYMENT_ENV =
  /^(VERCEL|NEXT_PUBLIC_|KV_|UPSTASH_|REDIS_|POLAR_|RESEND_|EMAIL_|GOOGLE_|GITHUB_|R2_|DUB_|DROPBOX_|SLACK_|HUBSPOT_|MAILCHIMP_|NOTION_|BOX_|MICROSOFT_|CALENDLY_|STRIPE_|SHOPIFY_|WEB_RISK_|GROQ_|CRON_|ADMIN_|INTEGRATION_|SCAN_HASH|TURNSTILE_|POSTHOG_|UMAMI_|DATABASE_|PG|POSTGRES_|NEON_|BETTER_AUTH_|QRDX_|SHORT_LINK|BASE_URL)/;

function applyFakeEnvironment() {
  const env = process.env as Record<string, string | undefined>;
  for (const key of Object.keys(env)) {
    if (DEPLOYMENT_ENV.test(key)) delete env[key];
  }
  Object.assign(env, {
    NODE_ENV: "test",
    // Port 1 refuses connections: nothing here may reach a database.
    DATABASE_URL: "postgres://test@127.0.0.1:1/test",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
    BETTER_AUTH_URL: "http://localhost:3000",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    VERCEL_API_TOKEN: "test-vercel-token",
    VERCEL_PROJECT_ID: "prj_test",
    VERCEL_TEAM_ID: "team_test",
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
    R2_BUCKET: "test-bucket",
    RESEND_API_KEY: "",
  });
}

async function main() {
  applyFakeEnvironment();
  const { buildOpenApiDocument } = await import("@/lib/openapi/document");
  const document = buildOpenApiDocument();
  writeFileSync(OPENAPI_PATH, `${JSON.stringify(document, null, 2)}\n`);

  // Keep the file as `biome check` formats it.
  const biome = spawnSync(biomePath, ["format", "--write", OPENAPI_PATH], {
    cwd: root,
    stdio: "inherit",
  });
  if (biome.status !== 0) {
    throw new Error("biome format failed on public/openapi.json");
  }

  // The pages render the file just written (lib/api-reference imports it).
  const { apiReference } = await import("@/lib/api-reference");
  const { errorsPage, writeReferencePages } = await import("./pages");
  const output = join(root, "content", "docs", "developers", "api");
  const operations = await writeReferencePages(document, apiReference, output);
  writeFileSync(
    join(root, "content", "docs", "developers", "errors.mdx"),
    errorsPage(),
  );
  const formatted = spawnSync(biomePath, ["format", "--write", output], {
    cwd: root,
    stdio: "inherit",
  });
  if (formatted.status !== 0) {
    throw new Error("biome format failed on content/docs/developers/api");
  }

  console.log(
    `Wrote public/openapi.json (${operations} operations, ${
      Object.keys(document.components?.schemas ?? {}).length
    } schemas), content/docs/developers/api and errors.mdx.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
