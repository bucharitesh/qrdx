// Runs the node:test suites that live next to the code (*.test.ts/tsx outside
// tests/ and e2e/, which belong to Vitest). Files whose "Run:" header uses
// --conditions=react-server get that condition, as their headers document.
// Dummy env values satisfy env.ts; nothing connects to a database or any
// external service.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const SKIP = new Set([
  "node_modules",
  ".next",
  ".source",
  "tests",
  "e2e",
  "public",
]);

function find(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) find(path, out);
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

// Deployment and service variables never reach the suites: Vercel runs them
// inside `turbo build` with production values, which changed media URLs,
// keys and gating. Same list as vitest.config.ts.
const DEPLOYMENT_ENV =
  /^(VERCEL|ANALYZE|NEXT_OUTPUT|NEXT_RUNTIME|DOMAIN_CONNECT_|NEXT_PUBLIC_|KV_|UPSTASH_|REDIS_|POLAR_|RESEND_|EMAIL_|GOOGLE_|GITHUB_|R2_|DUB_|BITLY_|DROPBOX_|SLACK_|DISCORD_|HUBSPOT_|MAILCHIMP_|NOTION_|BOX_|MICROSOFT_|CALENDLY_|STRIPE_|SHOPIFY_|WEB_RISK_|GSC_|GROQ_|AI_|OPENAI_|YOUTUBE_|SPOTIFY_|TELEGRAM_|CSP_|CRON_|ADMIN_|INTEGRATION_|SCAN_HASH|TURNSTILE_|DOCS_|CONSOLE_|POSTHOG_|UMAMI_|DATABASE_|PG|POSTGRES_|NEON_|BETTER_AUTH_|QRDX_|SAFETY_|SHORT_LINK|BASE_URL)/;
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !DEPLOYMENT_ENV.test(key)),
);

// The values the suites' own "Run:" headers document (some assert on them).
const env = {
  ...baseEnv,
  NODE_ENV: "test",
  NEXT_PUBLIC_APP_URL: "https://qrdx.dev",
  DATABASE_URL: "postgres://test@127.0.0.1:1/test",
  BETTER_AUTH_SECRET: "test-secret-for-unsubscribe-tokens",
  VERCEL_API_TOKEN: "test-token",
  VERCEL_PROJECT_ID: "prj_test",
  VERCEL_TEAM_ID: "team_test",
  R2_ACCOUNT_ID: "test",
  R2_ACCESS_KEY_ID: "test",
  R2_SECRET_ACCESS_KEY: "test",
  R2_BUCKET: "test-bucket",
  RESEND_API_KEY: "",
};

const files = find(root);
const groups = { plain: [], reactServer: [] };
for (const file of files) {
  const header = readFileSync(file, "utf8").split("\n").slice(0, 12).join("\n");
  groups[
    header.includes("--conditions=react-server") ? "reactServer" : "plain"
  ].push(relative(root, file));
}

let failed = false;
for (const [name, list] of Object.entries(groups)) {
  if (list.length === 0) continue;
  // Brackets in paths like app/api/vcard/[slug] are glob syntax to node --test;
  // backslashes are its escape character, so they're escaped too.
  const args = [
    ...(name === "reactServer" ? ["--conditions=react-server"] : []),
    "--test",
    "--test-reporter=dot",
    ...list.map((file) => file.replace(/[\\[\]]/g, "\\$&")),
  ];
  console.log(`\nnode:test (${name}): ${list.length} files`);
  const result = spawnSync("tsx", args, { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
