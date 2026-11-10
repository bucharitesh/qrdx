// The affiliate program (lib/affiliates), end to end against a running dev
// server and a THROWAWAY local database, driven over the Chrome DevTools
// Protocol (muted, headless, closed at the end: e2e/cdp.mjs). It writes to
// the database (test users, affiliate rows), so it refuses to run unless
// DATABASE_URL in .env.local points at localhost. The server needs
// QRDX_AFFILIATES=1 and a POLAR_WEBHOOK_SECRET (any value): webhooks are
// signed here with the one in .env.local, like Polar signs them.
//
//   AFF_E2E_BASE_URL=http://localhost:<port> AFF_E2E_DEV_LOG=<dev.log> \
//   AFF_E2E_PSQL="psql -h localhost -p <pg> -U postgres -d qrdx" \
//   AFF_E2E_SQL=../../packages/database/manual-sql/2026-11-10-affiliates.sql \
//   AFF_E2E_SHOTS=<dir> pnpm exec tsx e2e/affiliates.e2e.mts
//
// Start it with the affiliate tables NOT created (AFF_E2E_SQL set): the
// first part proves sign-up, the referral link, the pages and the webhook
// work without them; the suite then applies the SQL file itself, twice
// (it's idempotent), and goes on:
// apply → the admin approves (after "Confirm it's you" with a second
// factor) → the affiliate adds a PayPal email → a visitor who rejected
// cookies signs up through the link (attributed, no cookie) → a visitor who
// allowed Analytics gets no cookie either, and a sign-up on a later page load
// isn't attributed (same visit only) → the affiliate chooses their own code
// once (the start of their email address is refused) and the random one
// still works → the affiliate's own second address
// isn't attributed → signed order.paid webhooks (one twice) make one pending
// commission each → a refund voids one → after the hold it's payable → the
// admin sees the rupee commission converted at the ECB's rate (fetched live)
// and marks everything paid in US dollars with a PayPal reference → a second
// submit with the same reference records nothing → the affiliate sees the
// payout. Screenshots at 1440 and 390 px, light and dark (AFF_E2E_SHOTS),
// with a no-horizontal-scroll check at 390 px.
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const env = (name: string) => process.env[`AFF_E2E_${name}`] ?? "";
const BASE = env("BASE_URL").replace(/\/$/, "");
const DEV_LOG = env("DEV_LOG");
const PSQL = env("PSQL");
const SQL_FILE = env("SQL");
const SHOTS = env("SHOTS");
const RUN = Date.now().toString(36);
const ANA = `ana-${RUN}@qrdx.test`;
const CARLA = `carla-${RUN}@qrdx.test`;
const DAVE = `dave-${RUN}@qrdx.test`;
const EARLY = `early-${RUN}@qrdx.test`;
const LATE = `late-${RUN}@qrdx.test`;
const ANA_TWIN = `ana-${RUN}+second@qrdx.test`;
const ADMIN = "admin@qrdx.test";

for (const [name, value] of Object.entries({
  BASE_URL: BASE,
  DEV_LOG,
  PSQL,
})) {
  if (!value) throw new Error(`Set AFF_E2E_${name}`);
}
const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf8");
const dbUrl = envFile.match(/^DATABASE_URL=(.*)$/m)?.[1] ?? "";
if (
  !/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) ||
  !/-h localhost/.test(PSQL)
) {
  throw new Error("Refusing to run: the database is not local");
}
const WEBHOOK_SECRET =
  envFile.match(/^POLAR_WEBHOOK_SECRET=(.*)$/m)?.[1]?.trim() ?? "";
if (!WEBHOOK_SECRET) throw new Error("Set POLAR_WEBHOOK_SECRET in .env.local");
console.log("Database: local");

const sql = (query: string) =>
  execSync(`${PSQL} -tA -F '|' -c ${JSON.stringify(query)}`, {
    encoding: "utf8",
  }).trim();
const q = (value: string) => `'${value.replace(/'/g, "''")}'`;
const userId = (email: string) =>
  sql(`select id from "user" where email=${q(email)}`);
const tablesExist = () =>
  sql(
    "select count(*) from information_schema.tables where table_schema='public' and table_name like 'affiliate%'",
  );

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ─── The browser ────────────────────────────────────────────────────────────

const DESKTOP = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };
const browser = await launch(DESKTOP);
const { cdp, evaluate, goto, waitFor } = browser;
await cdp.send("Network.enable");
// A desktop Chrome's user agent: headless Chrome says "HeadlessChrome",
// which the referral link rightly doesn't count as a visit (isbot).
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
await cdp.send("Network.setUserAgentOverride", { userAgent: BROWSER_UA });

async function viewport(size: { width: number; height: number }) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    ...size,
    deviceScaleFactor: size === PHONE ? 2 : 1,
    mobile: size === PHONE,
  });
  await sleep(400);
}

/** The screen at 1440 and 390 px in light and dark, and no sideways scroll on a phone. */
async function shot(name: string) {
  for (const [width, size] of [
    ["desktop", DESKTOP],
    ["phone", PHONE],
  ] as const) {
    await viewport(size);
    if (size === PHONE) {
      const overflow = (await evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      )) as number;
      check(
        `${name}: no horizontal scroll at 390 px`,
        overflow <= 0,
        `${overflow}px`,
      );
    }
    if (!SHOTS) continue;
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
      await sleep(350);
      const height = (await evaluate(
        () => document.documentElement.scrollHeight,
      )) as number;
      const captured = (await Promise.race([
        cdp.send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: {
            x: 0,
            y: 0,
            width: size.width,
            height: Math.min(height, 6000),
            scale: 1,
          },
        }),
        sleep(15_000).then(() => null),
      ])) as { data: string } | null;
      if (captured) {
        writeFileSync(
          join(SHOTS, `${name}-${width}-${scheme}.png`),
          Buffer.from(captured.data, "base64"),
        );
      }
    }
  }
  await viewport(DESKTOP);
  await evaluate(() => document.documentElement.classList.remove("dark"));
}

const href = () => evaluate(() => location.href) as Promise<string>;
async function waitText(needle: string, timeout = 20_000) {
  return waitFor(
    // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
    (n: string) => document.body.innerText.includes(n),
    { args: [needle] as never[], timeout },
  ).then(
    () => true,
    () => false,
  );
}
const bodyText = () =>
  // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
  evaluate(() => document.body.innerText) as Promise<string>;
async function cookieBanner(choice: "Reject all" | "Accept all") {
  await waitFor(
    (label: string) => {
      const button = window.__e2e.byRole("button", label, { exact: true });
      if (!button) return false;
      window.__e2e.click(button);
      return true;
    },
    { args: [choice] as never[], timeout: 10_000 },
  ).catch(() => null);
  await sleep(500);
}
const clickButton = (label: string, root = "document") =>
  waitFor(
    (l: string, r: string) => {
      const scope =
        r === "document"
          ? document
          : (document.querySelector(r) as HTMLElement | null);
      const button = scope
        ? window.__e2e.byRole("button", l, { exact: true, root: scope })
        : null;
      if (!button || (button as HTMLButtonElement).disabled) return false;
      window.__e2e.click(button);
      return true;
    },
    { args: [label, root] as never[] },
  );
async function fill(label: string, value: string, root = "document") {
  await waitFor(
    (l: string, v: string, r: string) => {
      const scope =
        r === "document"
          ? undefined
          : ((document.querySelector(r) as HTMLElement | null) ?? undefined);
      const el = window.__e2e.byLabel(l, scope) as HTMLInputElement | null;
      if (!el || el.disabled) return false;
      el.focus();
      window.__e2e.setValue(el, v);
      return true;
    },
    { args: [label, value, root] as never[] },
  );
}

const logSize = () => statSync(DEV_LOG).size;
async function logLine(pattern: RegExp, since: number, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const log = readFileSync(DEV_LOG).subarray(since).toString("utf8");
    const found = log.match(pattern);
    if (found) return found;
    await sleep(250);
  }
  return null;
}
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function sessionUser(): Promise<string | null> {
  return evaluate(async () => {
    const r = await fetch("/api/auth/get-session", { cache: "no-store" });
    const body = await r.json().catch(() => null);
    return body?.user?.email ?? null;
  }) as Promise<string | null>;
}

/**
 * Email-code sign-in through the endpoints the panel calls; `referral` is
 * sent the way the panel sends a pending code.
 */
async function signIn(email: string, referral?: string) {
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
  const found = await logLine(
    new RegExp(`sign-in code for ${escapeRegExp(email)}: (\\d{6})`),
    since,
  );
  if (!found) throw new Error(`No code in the dev log for ${email}`);
  const status = await evaluate(
    async (e: string, otp: string, ref: string) => {
      const r = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(ref ? { "x-qrdx-referral": ref } : {}),
        },
        body: JSON.stringify({ email: e, otp }),
      });
      return r.status;
    },
    email,
    found[1],
    referral ?? "",
  );
  if (status !== 200) throw new Error(`sign in ${status}`);
}

/**
 * Through the real sign-in dialog, the way a visitor gets there from the
 * home page: "Try the Playground" (a client-side link, so the page isn't
 * reloaded), then the Playground's "Sign in", email, code.
 */
async function signInThroughDialog(email: string) {
  await waitFor(() => {
    const link = [...document.querySelectorAll("a")].find(
      (a) => a.textContent?.trim() === "Try the Playground",
    );
    if (!link) return false;
    window.__e2e.click(link);
    return true;
  });
  await waitFor(() => location.pathname === "/playground", { timeout: 60_000 });
  await clickButton("Sign in");
  await fill("Email address", email);
  const since = logSize();
  await clickButton("Email me a code");
  const found = await logLine(
    new RegExp(`sign-in code for ${escapeRegExp(email)}: (\\d{6})`),
    since,
  );
  if (!found) throw new Error(`No code in the dev log for ${email}`);
  await fill("Sign-in code", found[1]);
  await waitFor(
    async () => {
      const r = await fetch("/api/auth/get-session", { cache: "no-store" });
      const body = await r.json().catch(() => null);
      return Boolean(body?.user);
    },
    { timeout: 20_000 },
  );
}

/**
 * A new visitor: no cookies and no site storage. c15t keeps the cookie
 * choice in localStorage too, so clearing cookies alone would carry an
 * earlier "Reject all" over.
 */
async function freshVisitor() {
  await cdp.send("Network.clearBrowserCookies");
  await cdp.send("Storage.clearDataForOrigin", {
    origin: BASE,
    storageTypes: "all",
  });
}

type Cookies = { name: string; value: string; domain: string; path: string }[];
async function saveCookies(): Promise<Cookies> {
  const { cookies } = (await cdp.send("Network.getAllCookies")) as {
    cookies: Cookies;
  };
  return cookies;
}
async function restoreCookies(cookies: Cookies) {
  await cdp.send("Network.clearBrowserCookies");
  await cdp.send("Network.setCookies", { cookies });
}

// ─── "Confirm it's you" ─────────────────────────────────────────────────────

const CONFIRM = "Confirm it's you";
const confirmAsked = (timeout = 8_000) =>
  waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
    args: [CONFIRM] as never[],
    timeout,
  }).then(
    () => true,
    () => false,
  );
const clickInConfirm = (label: string) =>
  waitFor(
    (t: string, l: string) => {
      const dialog = window.__e2e.byRole("dialog", t);
      const button = dialog
        ? window.__e2e.byRole("button", l, { exact: true, root: dialog })
        : null;
      if (!button || (button as HTMLButtonElement).disabled) return false;
      window.__e2e.click(button);
      return true;
    },
    { args: [CONFIRM, label] as never[] },
  );
const confirmClosed = () =>
  waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
    args: [CONFIRM] as never[],
  });

async function confirmByEmail(email: string) {
  const since = logSize();
  await clickInConfirm("Send code");
  const found = await logLine(
    new RegExp(`confirmation code for ${escapeRegExp(email)}: (\\d{6})`),
    since,
  );
  if (!found) throw new Error("No confirmation code in the log");
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
    { args: [CONFIRM, found[1]] as never[] },
  );
  await confirmClosed();
}

async function confirmByBackupCode(code: string) {
  const showing = await evaluate(
    (t: string) =>
      Boolean(
        window.__e2e.byLabel(
          "Backup code",
          window.__e2e.byRole("dialog", t) ?? undefined,
        ),
      ),
    CONFIRM,
  );
  if (!showing) {
    await clickInConfirm("Use another method");
    await clickInConfirm("Use a backup code");
  }
  await waitFor(
    (t: string, v: string) => {
      const dialog = window.__e2e.byRole("dialog", t);
      const input = window.__e2e.byLabel(
        "Backup code",
        dialog ?? undefined,
      ) as HTMLInputElement | null;
      if (!input || input.disabled) return false;
      input.focus();
      window.__e2e.setValue(input, v);
      return true;
    },
    { args: [CONFIRM, code] as never[] },
  );
  await clickInConfirm("Confirm");
  await confirmClosed();
}

// ─── Two-step verification for the admin (requireStrongAdmin) ────────────────

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hash = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = (hash[hash.length - 1] ?? 0) & 15;
  const binary = hash.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

async function turnOnTwoFactor(email: string): Promise<string[]> {
  await goto(`${BASE}/settings/account#two-factor`);
  await waitText("Two-step verification");
  await cookieBanner("Reject all");
  await waitFor(() => {
    const section = document.getElementById("two-factor");
    const button = section
      ? window.__e2e.byRole("button", "Turn on", { exact: true, root: section })
      : null;
    if (!button || (button as HTMLButtonElement).disabled) return false;
    window.__e2e.click(button);
    return true;
  });
  if (await confirmAsked(8000)) await confirmByEmail(email);
  const chose = await waitFor(
    () => {
      const radio = document.querySelector(
        '[role="dialog"] [role="radio"][value="app"]',
      ) as HTMLElement | null;
      if (radio) {
        window.__e2e.click(radio);
        return radio.getAttribute("aria-checked") === "true" ? "radio" : false;
      }
      return document.querySelector('[role="dialog"] code') ? "code" : false;
    },
    { timeout: 15_000 },
  );
  if (chose === "radio") await clickButton("Continue", '[role="dialog"]');
  await waitFor(() => Boolean(document.querySelector('[role="dialog"] code')));
  const secret = (
    (await evaluate(
      () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
    )) as string
  ).replace(/\s+/g, "");
  await fill("Code from your authenticator app", totp(secret));
  await waitText("Save your backup codes");
  await waitFor(
    () =>
      document.querySelectorAll(
        '[role="dialog"] [aria-label="Backup codes"] li',
      ).length > 0,
  );
  const codes = (await evaluate(() =>
    [
      ...document.querySelectorAll(
        '[role="dialog"] [aria-label="Backup codes"] li',
      ),
    ].map((li) => li.textContent?.trim() ?? ""),
  )) as string[];
  await evaluate(() => {
    const box = window.__e2e.byLabel("I've saved my backup codes");
    if (box) window.__e2e.click(box);
  });
  await clickButton("Done", '[role="dialog"]');
  await sleep(800);
  return codes;
}

/**
 * An admin action's button, then its dialog's confirm button (same label),
 * then "Confirm it's you" with a backup code when it asks.
 */
async function adminAction(
  trigger: string,
  confirmLabel: string,
  codes: string[],
  fields: Record<string, string> = {},
) {
  // The first enabled one: a balance below the minimum has its button off.
  await waitFor(
    (label: string) => {
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === label && !b.disabled,
      );
      if (!button) return false;
      window.__e2e.click(button);
      return true;
    },
    { args: [trigger] as never[] },
  );
  await waitFor(() => Boolean(document.querySelector('[role="dialog"]')));
  for (const [label, value] of Object.entries(fields)) {
    await fill(label, value, '[role="dialog"]');
  }
  await clickButton(confirmLabel, '[role="dialog"]');
  if (await confirmAsked(6000)) {
    const code = codes.shift();
    if (!code) throw new Error("Out of backup codes");
    await confirmByBackupCode(code);
  }
  await sleep(1500);
}

// ─── Polar webhooks, signed like Polar signs them ────────────────────────────

async function webhook(payload: unknown): Promise<number> {
  const body = JSON.stringify(payload);
  const id = `msg_${RUN}_${Math.random().toString(36).slice(2)}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", Buffer.from(WEBHOOK_SECRET, "utf8"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const response = await fetch(`${BASE}/api/webhook/polar`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
    },
    body,
  });
  return response.status;
}

const order = (
  id: string,
  user: string,
  netAmount: number,
  currency = "usd",
) => ({
  type: "order.paid",
  timestamp: new Date().toISOString(),
  data: {
    id,
    created_at: new Date().toISOString(),
    modified_at: new Date().toISOString(),
    status: "paid",
    paid: true,
    subtotal_amount: netAmount,
    discount_amount: 0,
    net_amount: netAmount,
    tax_amount: 0,
    total_amount: netAmount,
    refunded_amount: 0,
    refunded_tax_amount: 0,
    currency,
    billing_reason: "subscription_create",
    customer_id: `polar_${user}`,
    customer: { id: `polar_${user}`, external_id: user, email: null },
  },
});

/** A HEAD-less look at where /r/<code> sends people. */
async function referralRedirect(code: string): Promise<string | null> {
  const response = await fetch(`${BASE}/r/${code}`, {
    redirect: "manual",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
  });
  return response.headers.get("location");
}

// ─── Before the SQL: nothing breaks ─────────────────────────────────────────

async function withoutTables() {
  console.log("without the affiliate tables");
  check("the affiliate tables don't exist yet", tablesExist() === "0");
  check(
    "a referral link still redirects, home and without a code",
    (await referralRedirect("ana-diaz-4k2p")) === "/",
  );
  const since = logSize();
  await signIn(EARLY, "ana-diaz-4k2p");
  check(
    "sign-up with a referral code still works",
    (await sessionUser()) === EARLY,
  );
  check("the account exists", Boolean(userId(EARLY)));
  await sleep(1500);
  const afterSignUp = readFileSync(DEV_LOG).subarray(since).toString("utf8");
  check(
    "and logs no error for it",
    !/Unexpected error|affiliates\.|auth\.referral/.test(afterSignUp),
    afterSignUp.match(
      /.*(Unexpected error|affiliates\.|auth\.referral).*/,
    )?.[0],
  );
  // Logged once per server process (the /r/ request above may have done it).
  check(
    "the server says which SQL to apply",
    readFileSync(DEV_LOG, "utf8").includes(
      "the affiliate tables don't exist yet (packages/database/manual-sql/2026-11-10-affiliates.sql)",
    ),
  );
  await goto(`${BASE}/settings/affiliate`);
  check(
    "Settings → Affiliate program says it isn't available yet",
    await waitText("isn't available yet"),
  );
  await goto(`${BASE}/affiliates`);
  check(
    "the apply form says applications aren't open yet",
    await waitText("Applications aren't open yet"),
  );
  check(
    "a signed order.paid webhook still gets a 2xx",
    (await webhook(order(`order_early_${RUN}`, userId(EARLY), 1500))) === 200,
  );
  if (!SQL_FILE) throw new Error("Set AFF_E2E_SQL to the manual SQL file");
  execSync(`${PSQL} -v ON_ERROR_STOP=1 -q -f ${JSON.stringify(SQL_FILE)}`);
  execSync(
    `${PSQL} -v ON_ERROR_STOP=1 -q -f ${JSON.stringify(SQL_FILE)} 2>/dev/null`,
  );
  check(
    "the SQL file applies, and again without errors",
    tablesExist() === "4",
  );
}

// ─── The program ────────────────────────────────────────────────────────────

async function program() {
  console.log("the public page, signed out");
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/affiliates`);
  check("the page states the terms", await waitText("Earn 30% for 12 months"));
  const page = await bodyText();
  for (const phrase of [
    "30 days",
    "US$25",
    "same visit",
    "PayPal",
    "You handle the taxes",
    "No spam",
  ]) {
    check(`/affiliates says "${phrase}"`, page.includes(phrase));
  }
  check(
    "signed out, it asks you to sign in to apply",
    await waitText("Sign in to apply"),
  );
  await cookieBanner("Reject all");
  await shot("affiliates-public");

  console.log("apply");
  await signIn(ANA);
  await goto(`${BASE}/affiliates#apply`);
  await cookieBanner("Reject all");
  await fill(
    "How will you share QRdx?",
    "A weekly newsletter for restaurant owners, about menus and table QR codes.",
  );
  await fill("Website or profile (optional)", "https://ana.example");
  await evaluate(() => {
    const box = document.querySelector('#apply [role="checkbox"]');
    if (box) window.__e2e.click(box);
  });
  await clickButton("Apply", "#apply");
  check("the application is sent", await waitText("your application is in"));
  const applied = sql(
    `select status, code, coalesce(paypal_email,'') from affiliate where user_id=${q(userId(ANA))}`,
  ).split("|");
  check(
    "it's saved as pending, with a random code (not from the name) and no PayPal email",
    applied[0] === "pending" &&
      /^[a-hjkmnp-z2-9]{8}$/.test(applied[1] ?? "") &&
      applied[2] === "",
    applied.join("|"),
  );
  const code = applied[1] ?? "";
  check(
    "the terms version is stored with the acceptance",
    sql(
      `select application->>'termsVersion' from affiliate where user_id=${q(userId(ANA))}`,
    ) === "2026-11-10",
  );
  const affiliateId = sql(`select id from affiliate where code=${q(code)}`);
  await goto(`${BASE}/settings/affiliate`);
  check(
    "Settings says it's being reviewed",
    await waitText("Your application is being reviewed"),
  );
  const anaCookies = await saveCookies();

  console.log("the admin approves");
  const admin = userId(ADMIN) || null;
  if (admin) {
    sql(
      `delete from two_factor where user_id=${q(admin)}; update "user" set two_factor_enabled=false where id=${q(admin)}; delete from session where user_id=${q(admin)}`,
    );
  }
  await signIn(ADMIN);
  const codes = await turnOnTwoFactor(ADMIN);
  check("the admin has two-step verification on", codes.length >= 8);
  const adminCookies = await saveCookies();
  await goto(`${BASE}/admin/affiliates`);
  check("the application is listed", await waitText(ANA));
  check(
    "with what they wrote",
    await waitText("A weekly newsletter for restaurant owners"),
  );
  await shot("admin-applications");
  // Without its own second factor confirmed recently, the action asks.
  sql(
    `delete from verification where identifier like 'qrdx-confirmed-%' and value=${q(userId(ADMIN))}`,
  );
  await adminAction("Approve", "Approve", codes);
  check(
    "the affiliate is approved",
    sql(`select status from affiliate where id=${q(affiliateId)}`) ===
      "approved",
  );
  check(
    "the approval is in the admin audit log",
    sql(
      `select count(*) from admin_audit_log where action='affiliate.approve' and target_id=${q(affiliateId)}`,
    ) === "1",
  );

  console.log("the affiliate adds a PayPal email");
  await restoreCookies(anaCookies);
  await goto(`${BASE}/settings/affiliate`);
  check("their link is shown", await waitText(`/r/${code}`));
  await fill("PayPal email", "ana-payouts@paypal.example");
  await clickButton("Save");
  if (await confirmAsked(8000)) await confirmByEmail(ANA);
  await sleep(1500);
  check(
    "the PayPal email is saved after Confirm it's you",
    sql(`select paypal_email from affiliate where id=${q(affiliateId)}`) ===
      "ana-payouts@paypal.example",
  );

  console.log("a visitor who rejected cookies signs up through the link");
  await freshVisitor();
  await goto(`${BASE}/r/${code}`, { wait: 2500 });
  check(
    "the link lands on the home page with the code",
    (await href()).endsWith(`/?ref=${code}`),
    await href(),
  );
  check(
    "the visit is counted",
    sql(`select click_count from affiliate where id=${q(affiliateId)}`) === "1",
  );
  await cookieBanner("Reject all");
  const noCookie = (await evaluate(() => document.cookie)) as string;
  check("no qrdx_ref cookie without consent", !noCookie.includes("qrdx_ref"));
  await signInThroughDialog(CARLA);
  check(
    "it went through the Playground without a page reload",
    (await href()).includes("/playground"),
    await href(),
  );
  const carla = userId(CARLA);
  const carlaReferral = sql(
    `select affiliate_id, attributed_via from affiliate_referral where referred_user_id=${q(carla)}`,
  );
  check(
    "the new account is attributed, carried through sign-up with no cookie",
    carlaReferral === `${affiliateId}|link`,
    carlaReferral,
  );

  console.log("a visitor who allowed Analytics gets no cookie either");
  await freshVisitor();
  await goto(`${BASE}/r/${code}`, { wait: 2500 });
  await cookieBanner("Accept all");
  await sleep(800);
  const afterConsent = (await evaluate(() => document.cookie)) as string;
  check(
    "no referral cookie with Analytics allowed",
    !afterConsent.includes("qrdx_ref") && !afterConsent.includes(code),
    afterConsent,
  );
  check(
    "nor anything in browser storage",
    !(
      (await evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      )) as string
    ).includes(code),
  );

  console.log("a sign-up on a later page load isn't a referral");
  await goto(`${BASE}/sign-in`);
  check(
    "the later page has no code in its address",
    !(await href()).includes("ref="),
  );
  await fill("Email address", LATE);
  const sinceLate = logSize();
  await clickButton("Email me a code");
  const lateCode = await logLine(
    new RegExp(`sign-in code for ${escapeRegExp(LATE)}: (\\d{6})`),
    sinceLate,
  );
  if (!lateCode) throw new Error("No code for the later visitor");
  await fill("Sign-in code", lateCode[1] ?? "");
  await waitFor(async () => {
    const r = await fetch("/api/auth/get-session", { cache: "no-store" });
    return Boolean((await r.json().catch(() => null))?.user);
  });
  await sleep(1000);
  check(
    "the account exists and isn't attributed (same visit only)",
    Boolean(userId(LATE)) &&
      sql(
        `select count(*) from affiliate_referral where referred_user_id=${q(userId(LATE))}`,
      ) === "0",
  );

  console.log("a second referral, in the same visit");
  await signIn(DAVE, code);
  await sleep(1000);
  const dave = userId(DAVE);
  check(
    "the code carried with the sign-up attributes it",
    sql(
      `select attributed_via from affiliate_referral where referred_user_id=${q(dave)}`,
    ) === "link",
  );

  console.log("the affiliate chooses their own code, once");
  await restoreCookies(anaCookies);
  await goto(`${BASE}/settings/affiliate`);
  await fill("New code", `ana-${RUN}`);
  await clickButton("Change once");
  check(
    "the start of their email address is refused",
    await waitText("That's the start of your email address"),
  );
  const chosen = `ana-picks-${RUN}`;
  await fill("New code", chosen);
  await clickButton("Change once");
  await sleep(1500);
  check(
    "the chosen code is saved and the random one kept",
    sql(
      `select code, previous_code from affiliate where id=${q(affiliateId)}`,
    ) === `${chosen}|${code}`,
  );
  check(
    "the random code's link still works, with the chosen code",
    (await referralRedirect(code)) === `/?ref=${chosen}`,
  );
  check(
    "and the code can't change again",
    !(await bodyText()).includes("Change once"),
  );

  console.log("the affiliate's own second address isn't a referral");
  await signIn(ANA_TWIN, code);
  await sleep(1000);
  check(
    "self-referral (the same email with a +tag) isn't attributed",
    sql(
      `select count(*) from affiliate_referral where referred_user_id=${q(userId(ANA_TWIN))}`,
    ) === "0",
  );
  check(
    "an existing account isn't attributed by signing in with a code",
    await (async () => {
      await signIn(EARLY, code);
      await sleep(800);
      return (
        sql(
          `select count(*) from affiliate_referral where referred_user_id=${q(userId(EARLY))}`,
        ) === "0"
      );
    })(),
  );

  console.log("Polar webhooks");
  const usdOrder = order(`order_usd_${RUN}`, carla, 14_400);
  check("order.paid is accepted", (await webhook(usdOrder)) === 200);
  check("and again (Polar retries)", (await webhook(usdOrder)) === 200);
  check(
    "one pending commission of 30% for the order",
    sql(
      `select count(*), max(amount), max(currency), max(status) from affiliate_commission where polar_order_id=${q(usdOrder.data.id)}`,
    ) === "1|4320|usd|pending",
  );
  const inrOrder = order(`order_inr_${RUN}`, dave, 499_900, "inr");
  await webhook(inrOrder);
  const refunded = order(`order_refund_${RUN}`, carla, 1_500);
  await webhook(refunded);
  check(
    "a refund inside the hold voids it",
    (await webhook({
      type: "refund.created",
      timestamp: new Date().toISOString(),
      data: {
        id: `refund_${RUN}`,
        status: "succeeded",
        amount: 1_500,
        tax_amount: 0,
        order_id: refunded.data.id,
        created_at: new Date().toISOString(),
        reason: "customer_request",
        dispute: null,
      },
    })) === 200 &&
      sql(
        `select status, void_reason from affiliate_commission where polar_order_id=${q(refunded.data.id)}`,
      ) === "void|refund",
  );
  await restoreCookies(anaCookies);
  await goto(`${BASE}/settings/affiliate`);
  check("the dashboard shows it on hold", await waitText("US$43.20"));
  check("with the rupee one beside it", await waitText("₹1,499.70"));
  check("and the counts", (await bodyText()).includes("Sign-ups"));
  await shot("settings-affiliate-on-hold");

  console.log("after the 30 days");
  sql(
    `update affiliate_commission set order_paid_at = order_paid_at - interval '31 days', available_at = now() - interval '1 day' where affiliate_id=${q(affiliateId)} and status='pending'`,
  );
  await goto(`${BASE}/settings/affiliate`);
  await waitText("Payable");
  const earnings = await bodyText();
  check(
    "it's payable without waiting for the cron",
    /Payable\s*US\$43\.20 · ₹1,499\.70/.test(earnings),
    earnings.match(/Payable[^\n]*\n?[^\n]*/)?.[0] ?? "",
  );

  console.log("the admin marks it paid");
  await restoreCookies(adminCookies);
  await goto(`${BASE}/admin/affiliates/${affiliateId}`);
  check("the payable amount is shown", await waitText("Payable now"));
  check(
    "the rupee commission is converted at the ECB's rate, with its date",
    await waitText("European Central Bank reference rates"),
  );
  check("and the US-dollar total is shown", await waitText("Total to send"));
  await shot("admin-affiliate");
  sql(
    `delete from verification where identifier like 'qrdx-confirmed-%' and value=${q(userId(ADMIN))}`,
  );
  await adminAction("Mark paid", "Mark paid", codes, {
    "PayPal transaction ID": "8AB12345CD678901E",
  });
  const payout = sql(
    `select amount, currency, commission_count, paypal_reference, paypal_email, fx_rates->>'inr', fx_date, source_amounts->>'inr' from affiliate_payout where affiliate_id=${q(affiliateId)}`,
  ).split("|");
  const inrRate = Number(payout[5]);
  const expectedUsd = 4320 + Math.floor(149_970 * inrRate + 1e-9);
  check(
    "the payout is recorded in US dollars with the rate, its date and PayPal's reference",
    payout[0] === String(expectedUsd) &&
      payout[1] === "usd" &&
      payout[2] === "2" &&
      payout[3] === "8AB12345CD678901E" &&
      payout[4] === "ana-payouts@paypal.example" &&
      inrRate > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(payout[6] ?? "") &&
      payout[7] === "149970",
    payout.join("|"),
  );
  check(
    "the same PayPal reference can't be recorded twice",
    (() => {
      try {
        sql(
          `insert into affiliate_payout (id, currency, amount, commission_count, paypal_reference, paid_at, created_by, created_at) values ('dup_${RUN}', 'usd', 1, 1, '8AB12345CD678901E', now(), 'x', now())`,
        );
        return false;
      } catch {
        return true;
      }
    })(),
  );
  check(
    "the commission it covers is paid",
    sql(
      `select status from affiliate_commission where polar_order_id=${q(usdOrder.data.id)}`,
    ) === "paid",
  );
  check(
    "the rupee commission is paid by the same payout",
    sql(
      `select status from affiliate_commission where polar_order_id=${q(inrOrder.data.id)}`,
    ) === "paid",
  );
  check(
    "mark paid is in the admin audit log",
    sql(
      `select count(*) from admin_audit_log where action='affiliate.mark_paid' and target_id=${q(affiliateId)}`,
    ) === "1",
  );
  await goto(`${BASE}/admin/affiliates`);
  await waitText("Affiliates");
  await shot("admin-affiliates");

  console.log("the affiliate sees the payout");
  await restoreCookies(anaCookies);
  await goto(`${BASE}/settings/affiliate`);
  check("the payout is listed", await waitText("8AB12345CD678901E"));
  check(
    "and counted as paid",
    /Paid\s*US\$43\.20 · ₹1,499\.70/.test(await bodyText()),
  );
  await shot("settings-affiliate-paid");
}

try {
  if (SQL_FILE && tablesExist() === "0") await withoutTables();
  await program();
} catch (error) {
  failures++;
  console.error(error);
  if (SHOTS) {
    const captured = (await cdp
      .send("Page.captureScreenshot", { format: "png" })
      .catch(() => null)) as { data: string } | null;
    if (captured) {
      mkdirSync(SHOTS, { recursive: true });
      writeFileSync(
        join(SHOTS, "failure.png"),
        Buffer.from(captured.data, "base64"),
      );
    }
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nAll passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
