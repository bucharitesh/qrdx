// SAML sign-in started at the identity provider (a tile in its app
// dashboard; packages/auth/ee/sso.ts), end to end against a running dev
// server, the local mock identity provider and a THROWAWAY local database,
// over the Chrome DevTools Protocol. It writes to the database (test users, a
// Business subscription, an SSO connection), so it refuses to run unless
// DATABASE_URL in .env.local points at localhost.
//
// Needs, all local (the same set-up as e2e/sso.e2e.mts; pick your ports):
//   node e2e/sso/dns-stub.mjs <records.json> <dns port>
//   MOCK_IDP_SP_ORIGIN=http://localhost:<port> node e2e/sso/mock-idp.mjs <idp port>
//   NODE_OPTIONS="--require $PWD/e2e/sso/dns-preload.cjs" \
//   QRDX_TEST_DNS_SERVER=127.0.0.1:<dns port> \
//   BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:<idp port> \
//     pnpm exec next dev -p <port> > <dev.log>
//
//   SSO_IDP_E2E_BASE_URL=http://localhost:<port> \
//   SSO_IDP_E2E_IDP=http://localhost:<idp port> \
//   SSO_IDP_E2E_DEV_LOG=<dev.log> SSO_IDP_E2E_DNS_FILE=<records.json> \
//   SSO_IDP_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   SSO_IDP_E2E_SHOTS=<dir> pnpm exec tsx e2e/sso-idp-initiated.e2e.mts
//
// SSO_IDP_E2E_MOBILE=1: a 390 x 844 phone, screenshots in <shots>/mobile,
// with a horizontal-scroll check on each.
//
// Covers: a SAML connection set up and verified as an owner would; the
// tile (posted from the IdP's own site, so cross-site like a real one) signs
// a new person in and lands on the dashboard in the SSO workspace; a
// RelayState path lands on that page; one that isn't a page of the app
// (another site, //host, the sign-in page) lands on the dashboard; the same
// response posted twice is refused the second time; a response without an
// expiry, signed with SHA-1, or unsigned is refused with nobody signed in;
// two-step verification is asked after the tile, then the RelayState page;
// off Business it's refused; a sign-in started on QRdx still works; the help
// section.
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const BASE = (process.env.SSO_IDP_E2E_BASE_URL ?? "").replace(/\/$/, "");
const IDP = (process.env.SSO_IDP_E2E_IDP ?? "http://localhost:4455").replace(
  /\/$/,
  "",
);
// The IdP's pages from another site than the app's (127.0.0.1, not
// localhost), so its form post to the ACS is cross-site, as a real IdP's.
const IDP_CROSS_SITE = (() => {
  const url = new URL(IDP);
  url.hostname = "127.0.0.1";
  return url.origin;
})();
const DEV_LOG = process.env.SSO_IDP_E2E_DEV_LOG ?? "";
const DNS_FILE = process.env.SSO_IDP_E2E_DNS_FILE ?? "";
const PSQL = process.env.SSO_IDP_E2E_PSQL ?? "";
const SHOTS = process.env.SSO_IDP_E2E_SHOTS ?? "";
const MOBILE = process.env.SSO_IDP_E2E_MOBILE === "1";
const RUN = Date.now().toString(36);
const DOMAIN = `tile-${RUN}.test`;

for (const [name, value] of Object.entries({ BASE, DEV_LOG, DNS_FILE, PSQL })) {
  if (!value) {
    throw new Error(`Set SSO_IDP_E2E_${name === "BASE" ? "BASE_URL" : name}`);
  }
}
// Throwaway databases only.
const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf8");
const dbUrl = envFile.match(/^DATABASE_URL=(.*)$/m)?.[1] ?? "";
if (
  !/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) ||
  !/-h localhost/.test(PSQL)
) {
  throw new Error("Refusing to run: the database is not local");
}
console.log("Database: local");

const sql = (query: string) =>
  execSync(`${PSQL} -tA -F '|' -c ${JSON.stringify(query)}`, {
    encoding: "utf8",
  }).trim();
const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await launch(
  MOBILE ? { width: 390, height: 844 } : { width: 1280, height: 900 },
);
const { cdp, evaluate, goto, waitFor } = browser;
if (MOBILE) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
}

// ─── Page helpers ──────────────────────────────────────────────────────────

async function dismissCookieBanner() {
  await evaluate(() => {
    if (document.querySelector('[role="dialog"]')) return;
    const reject = window.__e2e.byRole("button", "Reject all", { exact: true });
    if (reject) window.__e2e.click(reject);
  });
  await sleep(300);
}

async function shot(name: string) {
  if (!SHOTS) return;
  await dismissCookieBanner();
  const dir = MOBILE ? join(SHOTS, "mobile") : SHOTS;
  mkdirSync(dir, { recursive: true });
  if (MOBILE) {
    const overflow = (await evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )) as number;
    check(`${name}: no horizontal scroll at 390 px`, overflow <= 0);
  }
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
    const captured = (await Promise.race([
      cdp.send("Page.captureScreenshot", { format: "png" }),
      sleep(15_000).then(() => null),
    ])) as { data: string } | null;
    if (!captured) {
      console.log(`  (screenshot ${name}-${scheme} timed out)`);
      continue;
    }
    writeFileSync(
      join(dir, `${name}-${scheme}.png`),
      Buffer.from(captured.data, "base64"),
    );
  }
  await evaluate(() => document.documentElement.classList.remove("dark"));
}

// biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
const text = () => evaluate(() => document.body.innerText as string);
const href = () => evaluate(() => location.href as string);

async function waitText(needle: string, timeout = 20_000) {
  // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
  return waitFor((n: string) => document.body.innerText.includes(n), {
    args: [needle] as never[],
    timeout,
  });
}

/** Waits until the page's path starts with `prefix`; false on timeout. */
const waitPath = (prefix: string, timeout = 20_000) =>
  waitFor((p: string) => location.pathname.startsWith(p), {
    args: [prefix] as never[],
    timeout,
  }).then(
    () => true,
    () => false,
  );

const clickButton = (label: string) =>
  evaluate((l: string) => {
    const button = window.__e2e.byRole("button", l, { exact: true });
    if (button) window.__e2e.click(button);
    return Boolean(button);
  }, label);

const logSize = () => statSync(DEV_LOG).size;
/** The newest line matching `pattern` in the dev log after `since`. */
async function logged(pattern: RegExp, since: number): Promise<string> {
  for (let i = 0; i < 80; i++) {
    const log = readFileSync(DEV_LOG).subarray(since).toString("utf8");
    const match = [...log.matchAll(new RegExp(pattern, "g"))].at(-1);
    if (match) return match[1] ?? match[0];
    await sleep(250);
  }
  throw new Error(`Nothing in the dev log matching ${pattern}`);
}
const escapeRe = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Email-code sign-in through the endpoints the panel calls (set-up only). */
async function apiSignIn(email: string) {
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  const since = logSize();
  const sent = await evaluate(async (e: string) => {
    const r = await fetch("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: e, type: "sign-in" }),
    });
    return r.status;
  }, email);
  if (sent !== 200) throw new Error(`send code ${sent}`);
  const otp = await logged(
    new RegExp(`sign-in code for ${escapeRe(email)}: (\\d{6})`),
    since,
  );
  const status = await evaluate(
    async (e: string, code: string) => {
      const r = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, otp: code }),
      });
      return r.status;
    },
    email,
    otp,
  );
  if (status !== 200) throw new Error(`sign in ${status}`);
}

/** The browser's session email, or null when signed out. */
const sessionEmail = () =>
  evaluate(async () => {
    const r = await fetch("/api/auth/get-session");
    const data = await r.json().catch(() => null);
    return (data?.user?.email as string | undefined) ?? null;
  }) as Promise<string | null>;

const CONFIRM = "Confirm it's you";

/**
 * "Confirm it's you" with an emailed code, when it's asked: a sign-in that
 * just finished counts as a confirmation (packages/auth/new-sign-in.ts), so
 * it may not be.
 */
async function confirmIfAsked(email: string) {
  const asked = await waitFor(
    (t: string) => Boolean(window.__e2e.byRole("dialog", t)),
    { args: [CONFIRM] as never[], timeout: 5000 },
  ).then(
    () => true,
    () => false,
  );
  if (!asked) return;
  const since = logSize();
  await waitFor(
    (t: string) => {
      const dialog = window.__e2e.byRole("dialog", t);
      const button = dialog
        ? window.__e2e.byRole("button", "Send code", {
            exact: true,
            root: dialog,
          })
        : null;
      if (!button || (button as HTMLButtonElement).disabled) return false;
      window.__e2e.click(button);
      return true;
    },
    { args: [CONFIRM] as never[] },
  );
  const code = await logged(
    new RegExp(`confirmation code for ${escapeRe(email)}: (\\d{6})`),
    since,
  );
  await waitFor(
    (t: string, value: string) => {
      const input = window.__e2e
        .byRole("dialog", t)
        ?.querySelector("[data-input-otp]") as HTMLInputElement | null;
      if (!input || input.disabled) return false;
      input.focus();
      window.__e2e.setValue(input, value);
      return true;
    },
    { args: [CONFIRM, code] as never[] },
  );
  await waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
    args: [CONFIRM] as never[],
  });
}

const userId = (email: string) =>
  sql(`select id from "user" where email=${q(email)}`);
const userCount = (email: string) =>
  Number(sql(`select count(*) from "user" where email=${q(email)}`));
const liveSessions = (email: string) =>
  Number(
    sql(
      `select count(*) from session s join "user" u on u.id=s.user_id where u.email=${q(email)} and s.expires_at > now()`,
    ),
  );

// ─── The authenticator app (RFC 6238, like e2e/sso.e2e.mts) ────────────────

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/[\s=]+/g, "").toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
const step = () => Math.floor(Date.now() / 30_000);
function totpAt(secret: string, counterValue: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(counterValue));
  const hash = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = (hash.at(-1) ?? 0) & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(
    6,
    "0",
  );
}
let lastStep = 0;
async function freshTotp(secret: string): Promise<string> {
  while (step() <= lastStep) await sleep(1000);
  lastStep = step();
  return totpAt(secret, lastStep);
}

/** Turns on two-step verification in Settings as a person does; the secret. */
async function turnOnTwoFactor(email: string): Promise<string> {
  await apiSignIn(email);
  await goto(`${BASE}/settings/account#two-factor`, { wait: 3000 });
  await waitText("Two-step verification");
  await evaluate(() => {
    const e = window.__e2e;
    const button =
      e.byRole("button", "Turn on", { exact: true }) ??
      e.byRole("button", "Turn on");
    if (button) e.click(button);
  });
  await confirmIfAsked(email);
  await waitFor(() => {
    const radio = document.querySelector(
      '[role="dialog"] [role="radio"][value="app"]',
    ) as HTMLElement | null;
    if (!radio) return false;
    window.__e2e.click(radio);
    return radio.getAttribute("aria-checked") === "true";
  });
  await evaluate(() => {
    const dialog = window.__e2e.byRole(
      "dialog",
      "Turn on two-step verification",
    );
    const button = dialog
      ? window.__e2e.byRole("button", "Continue", { exact: true, root: dialog })
      : null;
    if (button) window.__e2e.click(button);
  });
  await waitText("Set up your authenticator app");
  await waitFor(() => Boolean(document.querySelector('[role="dialog"] code')));
  const secret = (
    (await evaluate(
      () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
    )) as string
  ).replace(/\s+/g, "");
  const code = await freshTotp(secret);
  await evaluate((c: string) => {
    const field = window.__e2e.byLabel("Code from your authenticator app");
    if (field) {
      field.focus();
      window.__e2e.setValue(field, c);
    }
  }, code);
  await waitText("Save your backup codes");
  await evaluate(() => {
    const box = window.__e2e.byLabel("I've saved my backup codes");
    if (box) window.__e2e.click(box);
  });
  await sleep(300);
  await evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const done = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent?.trim() === "Done",
    );
    if (done) window.__e2e.click(done);
  });
  await waitText("10 of 10 left");
  return secret;
}

// ─── The tile ──────────────────────────────────────────────────────────────

let providerId = "";

/** The tile's URL at the mock IdP (its own site), signing in as `email`. */
function tileUrl(email: string, extra: Record<string, string> = {}): string {
  const url = new URL(`${IDP_CROSS_SITE}/saml/tile`);
  url.searchParams.set("provider", providerId);
  url.searchParams.set("auto", email);
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Clicks the tile in a fresh browser; returns where it ended up. */
async function openTile(
  email: string,
  extra: Record<string, string> = {},
  { keepCookies = false } = {},
): Promise<string> {
  if (!keepCookies) await cdp.send("Network.clearBrowserCookies");
  await goto(tileUrl(email, extra), { wait: 4000 });
  return href();
}

interface PostedResponse {
  acs: string;
  SAMLResponse: string;
  RelayState: string;
}

/** Posts a response the IdP made earlier, from the IdP's site. */
async function postFromIdp(posted: PostedResponse) {
  await cdp.send("Network.clearBrowserCookies");
  // Any HTML page of the IdP's site: the tile's own "Sign in as" form.
  await goto(`${IDP_CROSS_SITE}/saml/tile?provider=${providerId}`, {
    wait: 300,
  });
  await evaluate((p: PostedResponse) => {
    const form = document.createElement("form");
    form.method = "post";
    form.action = p.acs;
    for (const [name, value] of Object.entries({
      SAMLResponse: p.SAMLResponse,
      RelayState: p.RelayState,
    })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.documentElement.append(form);
    form.submit();
  }, posted);
  await sleep(4000);
}

// ─── Run ───────────────────────────────────────────────────────────────────

try {
  const owner = `owner-${RUN}@qrdx.test`;
  const ana = `ana@${DOMAIN}`; // first sign-in is the tile
  const tara = `tara@${DOMAIN}`; // two-step verification on

  console.log("set-up: a verified SAML connection on Business");
  await apiSignIn(owner);
  const ownerId = userId(owner);
  const slug = sql(
    `select o.slug from organization o join member m on m.organization_id=o.id where m.user_id=${q(ownerId)} and m.role='owner' limit 1`,
  );
  const orgId = sql(`select id from organization where slug=${q(slug)}`);
  sql(
    `insert into subscription (id, created_at, amount, currency, recurring_interval, status, current_period_start, current_period_end, started_at, customer_id, product_id, checkout_id, user_id) values ('sub-${RUN}', now(), 1500, 'usd', 'month', 'active', now(), now() + interval '30 days', now(), 'cus-${RUN}', 'local-business-monthly', 'chk-${RUN}', ${q(ownerId)})`,
  );
  await goto(`${BASE}/dashboard/${slug}/settings/sso`, { wait: 3000 });
  const metadata = await (await fetch(`${IDP}/saml/metadata`)).text();
  await evaluate(() =>
    window.__e2e.click(window.__e2e.byRole("tab", "SAML 2.0") as HTMLElement),
  );
  await sleep(500);
  await evaluate(
    (domain: string, xml: string) => {
      const e = window.__e2e;
      e.setValue(e.byLabel("Email domain") as HTMLElement, domain);
      e.setValue(e.byLabel("Identity provider metadata") as HTMLElement, xml);
      e.click(
        e.byRole("button", "Save connection", { exact: true }) as HTMLElement,
      );
    },
    DOMAIN,
    metadata,
  );
  await confirmIfAsked(owner);
  await waitText(`Verify ${DOMAIN}`);
  providerId = sql(
    `select provider_id from sso_provider where organization_id=${q(orgId)}`,
  );
  const token = await evaluate(() => {
    const label = [...document.querySelectorAll("div")].find(
      (el) => el.textContent === "Value" && el.children.length === 0,
    );
    return label?.nextElementSibling?.querySelector("code")?.textContent ?? "";
  });
  writeFileSync(
    DNS_FILE,
    JSON.stringify({ [`_qrdx-${providerId}.${DOMAIN}`]: [token] }),
  );
  await clickButton("Verify");
  await waitText("Verified");
  const verified =
    sql(
      `select domain_verified from sso_provider where provider_id=${q(providerId)}`,
    ) === "t";
  check("A verified SAML connection on Business", verified, providerId);
  if (!verified) throw new Error("set-up failed");

  console.log("the tile, no RelayState");
  let at = await openTile(ana);
  await waitPath(`/dashboard/${slug}`);
  at = await href();
  check(
    "Signed in as a new person, on the dashboard in the SSO workspace",
    (await sessionEmail()) === ana &&
      at.startsWith(`${BASE}/dashboard/${slug}`),
    at,
  );
  check(
    "Joined the workspace (as a member)",
    sql(
      `select role from member where organization_id=${q(orgId)} and user_id=${q(userId(ana))}`,
    ) === "member",
  );
  await shot("01-tile-dashboard");

  console.log("the tile, RelayState a page of the app");
  at = await openTile(ana, { relay: "/settings/account" });
  await waitPath("/settings/account");
  at = await href();
  check(
    "Lands on the RelayState page, signed in",
    at === `${BASE}/settings/account` && (await sessionEmail()) === ana,
    at,
  );
  await shot("02-tile-relay-state");

  console.log("the tile, RelayState that isn't a page of the app");
  for (const relay of [
    "https://evil.example/phish",
    "//evil.example/x",
    "/sign-in?next=/settings/account",
  ]) {
    at = await openTile(ana, { relay });
    await waitPath(`/dashboard/${slug}`);
    at = await href();
    check(
      `${relay}: lands on the dashboard instead`,
      at.startsWith(`${BASE}/dashboard/${slug}`) &&
        (await sessionEmail()) === ana,
      at,
    );
  }

  console.log("the same response twice");
  const posted = (await (
    await fetch(
      tileUrl(ana, { relay: "/settings/account", format: "json" }).replace(
        IDP_CROSS_SITE,
        IDP,
      ),
    )
  ).json()) as PostedResponse;
  await postFromIdp(posted);
  check(
    "First time: signed in, on the RelayState page",
    (await href()) === `${BASE}/settings/account` &&
      (await sessionEmail()) === ana,
    await href(),
  );
  const before = liveSessions(ana);
  await postFromIdp(posted);
  at = await href();
  check(
    "Second time: refused, on the sign-in page with its next",
    at === `${BASE}/sign-in?next=%2Fsettings%2Faccount&error=replay_detected` &&
      (await sessionEmail()) === null &&
      liveSessions(ana) === before,
    `${at} sessions ${before} → ${liveSessions(ana)}`,
  );
  check(
    "…saying it was already used",
    (await text()).includes(
      "That sign-in has already been used. Sign in again.",
    ),
  );
  await shot("03-tile-replayed");

  console.log("responses QRdx refuses");
  const zed = `zed@${DOMAIN}`;
  at = await openTile(zed, { noexpiry: "1" });
  await waitPath("/sign-in");
  at = await href();
  check(
    "No expiry: refused, nobody signed in or created",
    at === `${BASE}/sign-in?error=unsolicited_response` &&
      (await sessionEmail()) === null &&
      userCount(zed) === 0,
    at,
  );
  check(
    "…with the message to start from QRdx's sign-in page",
    (await text()).includes(
      "QRdx couldn't accept this sign-in from your company's app list.",
    ),
  );
  await shot("04-tile-refused");
  at = await openTile(zed, { sha1: "1" });
  await waitPath("/sign-in");
  check(
    "SHA-1: refused",
    (await href()) === `${BASE}/sign-in?error=sso_weak_signature` &&
      userCount(zed) === 0,
    await href(),
  );
  at = await openTile(zed, { unsigned: "1", relay: "/settings/account" });
  await waitPath("/sign-in");
  at = await href();
  check(
    "Unsigned: refused, back to the sign-in page with its next",
    at.startsWith(`${BASE}/sign-in?next=%2Fsettings%2Faccount&error=`) &&
      (await sessionEmail()) === null &&
      userCount(zed) === 0,
    at,
  );

  console.log("two-step verification after the tile");
  const secret = await turnOnTwoFactor(tara);
  const taraSessions = liveSessions(tara);
  at = await openTile(tara, { relay: "/settings/account" });
  await waitPath("/sign-in/two-factor");
  at = await href();
  check(
    "Asked for the second step, returning to the RelayState page",
    at ===
      `${BASE}/sign-in/two-factor?next=${encodeURIComponent("/settings/account")}` &&
      (await sessionEmail()) === null &&
      liveSessions(tara) === taraSessions,
    at,
  );
  await waitText("Your account asks for a second step");
  await shot("05-tile-two-factor");
  const code = await freshTotp(secret);
  await evaluate((c: string) => {
    const field = window.__e2e.byLabel("Authenticator code");
    if (field) {
      field.focus();
      window.__e2e.setValue(field, c);
    }
  }, code);
  await waitPath("/settings/account");
  check(
    "After the code: signed in, on the RelayState page",
    (await href()) === `${BASE}/settings/account` &&
      (await sessionEmail()) === tara,
    await href(),
  );

  console.log("a sign-in started on QRdx still works");
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  await clickButton("Sign in with SSO");
  await waitFor(() => Boolean(window.__e2e.byLabel("Work email")));
  await evaluate((e: string) => {
    window.__e2e.setValue(window.__e2e.byLabel("Work email") as HTMLElement, e);
  }, ana);
  await clickButton("Continue");
  await sleep(2500);
  const idpPage = new URL(await href());
  check("Went to the IdP", idpPage.origin === IDP, idpPage.href);
  idpPage.searchParams.set("auto", ana);
  idpPage.hostname = "127.0.0.1";
  await goto(idpPage.toString(), { wait: 4000 });
  await waitPath(`/dashboard/${slug}`);
  check(
    "Signed in through the IdP, in the SSO workspace",
    (await sessionEmail()) === ana &&
      (await href()).startsWith(`${BASE}/dashboard/${slug}`),
    await href(),
  );

  console.log("off Business");
  sql(`update subscription set status='canceled' where id='sub-${RUN}'`);
  at = await openTile(ana);
  await waitPath("/sign-in");
  check(
    "Refused: SSO isn't available",
    (await href()) === `${BASE}/sign-in?error=sso_unavailable` &&
      (await sessionEmail()) === null,
    await href(),
  );
  sql(`update subscription set status='active' where id='sub-${RUN}'`);

  console.log("help");
  await cdp.send("Network.clearBrowserCookies");
  await goto(
    `${BASE}/docs/help/teams/single-sign-on#open-qrdx-from-your-identity-provider`,
    { wait: 3000 },
  );
  check(
    "The help section is there",
    (await text()).includes("Open QRdx from your identity provider") &&
      (await text()).includes("RelayState"),
  );
  await evaluate(() =>
    document
      .getElementById("open-qrdx-from-your-identity-provider")
      ?.scrollIntoView({ block: "start" }),
  );
  await sleep(500);
  await shot("06-help");
} catch (error) {
  failures++;
  console.error("  ✗ run stopped:", error);
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);
