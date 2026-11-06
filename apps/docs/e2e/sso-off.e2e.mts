// Workspace SSO switched off: a dev server WITHOUT QRDX_EE_LICENSE must not
// serve or offer any of it (packages/auth/ee-license.ts). Checks, over HTTP
// and in headless Chrome (CDP, ./cdp.mjs):
//   - the SSO sign-in routes (/api/auth/sign-in/sso, /api/auth/sso/*) are
//     404 with no answer from the plugin;
//   - /sign-in has no "Sign in with SSO";
//   - a Business workspace's settings nav has no "Single sign-on" entry and
//     /dashboard/<workspace>/settings/sso is not found;
//   - the Team page's remove dialog doesn't warn that someone in a verified
//     SSO domain rejoins;
//   - /pricing and /pricing.md have no single sign-on row or line;
//   - the help page is out of the docs sidebar, sitemap.xml and llms.txt.
// SSO_OFF_E2E_EXPECT=on runs the same checks against a licensed server and
// expects the opposite, so none of them passes by accident.
//
// It writes to the database (a Business subscription, an SSO connection
// row, a member), so it refuses to run unless DATABASE_URL in .env.local
// points at localhost. Sign-in codes are read from the dev server's log:
//
//   SSO_OFF_E2E_BASE_URL=http://localhost:<port> SSO_OFF_E2E_DEV_LOG=<dev.log> \
//   SSO_OFF_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   SSO_OFF_E2E_SHOTS=<dir> pnpm exec tsx e2e/sso-off.e2e.mts
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const BASE = (process.env.SSO_OFF_E2E_BASE_URL ?? "").replace(/\/$/, "");
const DEV_LOG = process.env.SSO_OFF_E2E_DEV_LOG ?? "";
const PSQL = process.env.SSO_OFF_E2E_PSQL ?? "";
const SHOTS = process.env.SSO_OFF_E2E_SHOTS ?? "";
const EXPECT_ON = process.env.SSO_OFF_E2E_EXPECT === "on";
const RUN = Date.now().toString(36);
const DOMAIN = `off-${RUN}.test`;

for (const [name, value] of Object.entries({ BASE, DEV_LOG, PSQL })) {
  if (!value) {
    throw new Error(`Set SSO_OFF_E2E_${name === "BASE" ? "BASE_URL" : name}`);
  }
}
// Throwaway databases only.
const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf8");
const dbUrl = envFile.match(/^DATABASE_URL=(.*)$/m)?.[1] ?? "";
if (
  !/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) ||
  !/-h localhost/.test(PSQL)
) {
  throw new Error(
    `Refusing to run: the database is not local (${dbUrl.replace(/:[^:@/]*@/, ":***@")})`,
  );
}
console.log(`Database: local (${dbUrl.replace(/:[^:@/]*@/, ":***@")})`);
console.log(
  EXPECT_ON
    ? "Expecting SSO ON (licensed control run): every check below is inverted"
    : "Expecting SSO OFF",
);

const sql = (query: string) =>
  execSync(`${PSQL} -tA -F '|' -c ${JSON.stringify(query)}`, {
    encoding: "utf8",
  }).trim();
const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

let failures = 0;
let passes = 0;
/** `off` must hold without a licence; with SSO_OFF_E2E_EXPECT=on, `!off`. */
function expectOff(name: string, off: boolean, detail = "") {
  const ok = EXPECT_ON ? !off : off;
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---- HTTP: the plugin's routes don't exist ----
console.log("SSO routes");
const ROUTES: [string, string][] = [
  ["POST", "/api/auth/sign-in/sso"],
  ["GET", "/api/auth/sso/callback/sso-abcdefabcdef"],
  ["POST", "/api/auth/sso/saml2/sp/acs/sso-abcdefabcdef"],
  ["GET", "/api/auth/sso/saml2/sp/metadata?providerId=sso-abcdefabcdef"],
  ["POST", "/api/auth/sso/register"],
];
for (const [method, path] of ROUTES) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: { "content-type": "application/json", origin: BASE },
    body:
      method === "POST"
        ? JSON.stringify({ email: `a@${DOMAIN}`, callbackURL: "/dashboard" })
        : undefined,
  });
  const body = (await response.text()).trim();
  // Better Auth answers a route it doesn't have with an empty 404. A
  // licensed server answers from the plugin (JSON or a redirect), or "Not
  // Found" for its server-only paths (disabledPaths).
  const noRoute = response.status === 404 && body === "";
  expectOff(
    `${method} ${path.split("?")[0]}: 404, no SSO route`,
    noRoute,
    `${response.status} ${response.headers.get("location") ?? ""}${body.slice(0, 80)}`,
  );
}

// ---- a Business workspace with a verified SSO domain and a member in it ----
function latestCode(email: string): string {
  const log = readFileSync(DEV_LOG, "utf8");
  const matches = [...log.matchAll(/sign-in code for (\S+): (\d{6})/g)].filter(
    (m) => m[1] === email,
  );
  const code = matches.at(-1)?.[2];
  if (!code) throw new Error(`No code in the dev log for ${email}`);
  return code;
}

const userId = (email: string) =>
  sql(`select id from "user" where email=${q(email)}`);

const browser = await launch({ width: 1280, height: 900 });
const { cdp, evaluate, goto, waitFor } = browser;
// biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
const text = () => evaluate(() => document.body.innerText as string);

/** Email-code sign-in through the same endpoints the panel calls. */
async function emailSignIn(email: string) {
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  const sent = await evaluate(async (e: string) => {
    const r = await fetch("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: e, type: "sign-in" }),
    });
    return r.status;
  }, email);
  if (sent !== 200) throw new Error(`send code ${sent}`);
  await sleep(500);
  const status = await evaluate(
    async (e: string, otp: string) => {
      const r = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, otp }),
      });
      return r.status;
    },
    email,
    latestCode(email),
  );
  if (status !== 200) throw new Error(`sign in ${status}`);
}

async function shot(name: string) {
  if (!SHOTS) return;
  await evaluate(() => {
    const reject = window.__e2e.byRole("button", "Reject all", { exact: true });
    if (reject) window.__e2e.click(reject);
  });
  await sleep(300);
  mkdirSync(SHOTS, { recursive: true });
  for (const scheme of ["light", "dark"] as const) {
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: scheme },
        { name: "prefers-reduced-motion", value: "reduce" },
      ],
    });
    await evaluate((s: string) => {
      document.documentElement.classList.toggle("dark", s === "dark");
      document.documentElement.style.colorScheme = s;
    }, scheme);
    await sleep(300);
    // Headless Chrome sometimes never answers a capture: skip it, don't hang.
    const captured = (await Promise.race([
      cdp.send("Page.captureScreenshot", { format: "png" }),
      sleep(15_000).then(() => null),
    ])) as { data: string } | null;
    if (!captured) {
      console.log(`  (screenshot ${name}-${scheme} timed out)`);
      continue;
    }
    writeFileSync(
      join(SHOTS, `${name}-${scheme}.png`),
      Buffer.from(captured.data, "base64"),
    );
  }
  await evaluate(() => document.documentElement.classList.remove("dark"));
}

try {
  // ---- sign-in panel ----
  console.log("Sign-in panel");
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  await waitFor(() => Boolean(window.__e2e.byLabel("Email")), {
    timeout: 20_000,
  });
  const signInText = await text();
  const ssoButton = await evaluate(() =>
    Boolean(window.__e2e.byRole("button", "Sign in with SSO", { exact: true })),
  );
  expectOff(
    "/sign-in: no 'Sign in with SSO'",
    !(ssoButton || /sign in with sso/i.test(signInText)),
  );
  await shot("sign-in");

  // ---- people and data ----
  const owner = `owner-off-${RUN}@qrdx.test`;
  const member = `mia@${DOMAIN}`;
  await emailSignIn(member);
  const memberId = userId(member);
  await emailSignIn(owner);
  const ownerId = userId(owner);
  const slug = sql(
    `select o.slug from organization o join member m on m.organization_id=o.id where m.user_id=${q(ownerId)} and m.role='owner' limit 1`,
  );
  const orgId = sql(`select id from organization where slug=${q(slug)}`);
  sql(
    `insert into subscription (id, created_at, amount, currency, recurring_interval, status, current_period_start, current_period_end, started_at, customer_id, product_id, checkout_id, user_id) values ('sub-off-${RUN}', now(), 1500, 'usd', 'month', 'active', now(), now() + interval '30 days', now(), 'cus-off-${RUN}', 'local-business-monthly', 'chk-off-${RUN}', ${q(ownerId)})`,
  );
  // A verified connection for the domain, as a licensed server would have
  // left it: SSO would make Mia rejoin after a removal.
  sql(
    `insert into sso_provider (id, issuer, oidc_config, user_id, provider_id, organization_id, domain, domain_verified) values ('sp-off-${RUN}', 'http://localhost:4455', '{}', ${q(ownerId)}, 'sso-off${RUN}', ${q(orgId)}, ${q(DOMAIN)}, true)`,
  );
  sql(
    `insert into member (id, organization_id, user_id, role, created_at) values ('m-off-${RUN}', ${q(orgId)}, ${q(memberId)}, 'member', now())`,
  );

  // ---- settings nav and page ----
  console.log("Workspace settings");
  await goto(`${BASE}/dashboard/${slug}/settings/team`, { wait: 2500 });
  await waitFor(
    (e: string) =>
      // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
      document.body.innerText.includes(e),
    { args: [member] as never[], timeout: 30_000 },
  );
  const navHasSso = await evaluate(
    (s: string) =>
      [...document.querySelectorAll("a[href]")].some((a) =>
        a.getAttribute("href")?.startsWith(`/dashboard/${s}/settings/sso`),
      ),
    slug,
  );
  expectOff("Settings nav: no 'Single sign-on' entry", !navHasSso);

  // The Team page's remove dialog.
  await evaluate((e: string) => {
    const row = [...document.querySelectorAll("tr")].find((tr) =>
      tr.textContent?.includes(e),
    );
    const button = [...(row?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent?.trim() === "Remove",
    );
    if (button) window.__e2e.click(button);
  }, member);
  await waitFor(() => Boolean(document.querySelector('[role="alertdialog"]')));
  await sleep(400);
  const dialog = (await evaluate(
    () =>
      // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
      document.querySelector<HTMLElement>('[role="alertdialog"]')?.innerText ??
      "",
  )) as string;
  expectOff(
    "Team page: the remove dialog doesn't say an SSO member rejoins",
    !/single sign-on/i.test(dialog) && dialog.includes("lose access"),
    dialog.replace(/\s+/g, " ").slice(0, 160),
  );
  await shot("team-remove-dialog");

  // The workspace layout streams (its loading.tsx), so Next.js keeps a 200
  // and adds noindex when the page calls notFound(); what counts is that the
  // not-found page renders instead of anything about SSO.
  const pageHtml = (await evaluate(async (s: string) => {
    const r = await fetch(`/dashboard/${s}/settings/sso`);
    return `${r.status} ${await r.text()}`;
  }, slug)) as string;
  await goto(`${BASE}/dashboard/${slug}/settings/sso`, { wait: 2500 });
  const ssoPageText = await text();
  const crumb = (await evaluate(
    () =>
      document.querySelector('nav[aria-label="Breadcrumb"]')?.textContent ?? "",
  )) as string;
  expectOff(
    "/dashboard/<workspace>/settings/sso: not found, nothing about SSO",
    ssoPageText.includes("This page could not be found") &&
      !/identity provider|single sign-on/i.test(ssoPageText) &&
      /noindex/.test(pageHtml),
    `HTTP ${pageHtml.slice(0, 3)}, breadcrumb "${crumb.replace(/\s+/g, " ")}"`,
  );
  await shot("settings-sso");

  // ---- pricing ----
  console.log("Pricing");
  await goto(`${BASE}/pricing`, { wait: 2500 });
  const pricingText = await text();
  expectOff(
    "/pricing: no single sign-on row or plan-card line",
    !/single sign-on/i.test(pricingText),
  );
  const pricingMd = await (await fetch(`${BASE}/pricing.md`)).text();
  expectOff(
    "/pricing.md: no single sign-on",
    !/single sign-on/i.test(pricingMd),
  );

  // ---- docs ----
  console.log("Docs");
  const DOCS_PATH = "/docs/help/teams/single-sign-on";
  await goto(`${BASE}/docs/help/teams/seats`, { wait: 2500 });
  const sidebarLink = await evaluate(
    (p: string) =>
      [...document.querySelectorAll("a[href]")].some(
        (a) => a.getAttribute("href") === p,
      ),
    DOCS_PATH,
  );
  expectOff("Docs sidebar: no single sign-on page", !sidebarLink);
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  expectOff(
    "sitemap.xml: no single sign-on page",
    !sitemap.includes(DOCS_PATH),
  );
  const llms = await (await fetch(`${BASE}/llms.txt`)).text();
  expectOff("llms.txt: no single sign-on page", !llms.includes(DOCS_PATH));

  // Clean up what this run added (the people stay; @qrdx.test is fake).
  sql(`delete from sso_provider where id='sp-off-${RUN}'`);
} catch (error) {
  failures++;
  console.error("  ✗ run failed:", error);
} finally {
  await browser.close();
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
