// Workspace single sign-on, end to end against a running dev server and a
// THROWAWAY local database, driven over the Chrome DevTools Protocol. It
// writes to the database (test users, a Business subscription), so it refuses
// to run unless DATABASE_URL in .env.local points at localhost.
//
// Needs, all local:
//   node e2e/sso/dns-stub.mjs <records.json> 5399
//   node e2e/sso/mock-idp.mjs 4455   (or another port: SSO_E2E_IDP)
//   NODE_OPTIONS="--require $PWD/e2e/sso/dns-preload.cjs" \
//   BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4455 \
//     pnpm exec next dev -p <port> > <dev.log>
//
//   SSO_E2E_BASE_URL=http://localhost:<port> SSO_E2E_DEV_LOG=<dev.log> \
//   SSO_E2E_DNS_FILE=<records.json> SSO_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   SSO_E2E_SHOTS=<dir> pnpm exec tsx e2e/sso.e2e.mts
//
// Covers (also: SSO sign-ins open the SSO workspace; two-step verification
// over OIDC and SAML; SAML refusals land on /sign-in): plan gate (non-Business page, sign-in refused after a downgrade,
// also mid-flow), OIDC set-up → domain verification (missing record, then
// DNS) → sign-in of a new person (joins with the chosen role) → sign-in of
// an existing account (linked, no duplicate) → an address outside the
// domain (refused, nothing created) → an unverified connection (refused);
// SAML set-up from metadata → sign-in → unsigned assertion and assertion
// without timestamps (refused); viewers can't manage; creating, verifying
// and removing a connection ask "Confirm it's you" (an emailed code for an
// owner without two-step verification), once per 10 minutes, even for a
// 2-day-old session; screenshots of each screen in light and dark. Every
// SSO sign-in joins the workspace: a removed member rejoins with the join
// role, a promoted member keeps their role, a pending invitation is accepted
// with its role; the Team page's remove dialog warns about it for people in
// the SSO domain only. Trusted devices: OIDC skips the code; SAML posted
// from another site (the IdP served from 127.0.0.1, so the POST to localhost
// is cross-site and Chrome leaves the SameSite=Lax trust cookie off it)
// skips the code through GET /two-factor/continue, and asks again without
// the cookie.
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cspEnforced, launch, recordCspViolations, sleep } from "./cdp.mjs";

const BASE = (process.env.SSO_E2E_BASE_URL ?? "").replace(/\/$/, "");
const DEV_LOG = process.env.SSO_E2E_DEV_LOG ?? "";
const DNS_FILE = process.env.SSO_E2E_DNS_FILE ?? "";
const PSQL = process.env.SSO_E2E_PSQL ?? "";
const SHOTS = process.env.SSO_E2E_SHOTS ?? "";
const IDP = (process.env.SSO_E2E_IDP ?? "http://localhost:4455").replace(
  /\/$/,
  "",
);
const RUN = Date.now().toString(36);
const DOMAIN = `acme-${RUN}.test`;

for (const [name, value] of Object.entries({ BASE, DEV_LOG, DNS_FILE, PSQL })) {
  if (!value)
    throw new Error(`Set SSO_E2E_${name === "BASE" ? "BASE_URL" : name}`);
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

// SSO_E2E_MOBILE=1: a 390 x 844 phone (2x, mobile), screenshots in
// <shots>/mobile, and on every screen: no horizontal page scroll (a failed
// check) and the tap targets under 40 px (reported).
const MOBILE = process.env.SSO_E2E_MOBILE === "1";
const SHOT_DIR = MOBILE && SHOTS ? join(SHOTS, "mobile") : SHOTS;
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
const layout: Record<string, { overflow: number; small: string[] }> = {};

// Content-Security-Policy violations (shared recorder, e2e/cdp.mjs), checked
// at the end where the server enforces a CSP (run the dev server with
// CSP_DEV=1); E2E_CSP_SELFTEST=1 first proves the recorder catches one.
const csp = await recordCspViolations(browser);
const cspOn = await cspEnforced(BASE);
if (process.env.E2E_CSP_SELFTEST === "1") {
  if (cspOn) {
    const { caught, lines } = await csp.selfTest(BASE);
    check(
      "CSP self-test: a script from evil.example.com is caught",
      caught,
      lines[0] ?? "the recorder saw nothing",
    );
  } else {
    console.log("  - CSP self-test skipped: CSP not enforced on this server");
  }
}

// Every request the page makes, with the cookies Chrome attached or held back
// (Network.requestWillBeSentExtraInfo), to show which requests carried the
// trust-device cookie.
interface SeenRequest {
  url: string;
  method: string;
  origin: string;
  cookies: string[];
  blocked: { name: string; reasons: string[] }[];
}
const requests = new Map<string, SeenRequest>();
const requestOrder: string[] = [];
await cdp.send("Network.enable");
cdp.on((message: { method: string; params: Record<string, any> }) => {
  if (message.method === "Network.requestWillBeSent") {
    const { requestId, request } = message.params;
    // A redirect reuses the id: keep each hop.
    const key = `${requestId}#${requestOrder.length}`;
    requests.set(key, {
      url: request.url,
      method: request.method,
      origin: request.headers?.Origin ?? request.headers?.origin ?? "",
      cookies: [],
      blocked: [],
    });
    requestOrder.push(key);
  }
  if (message.method === "Network.requestWillBeSentExtraInfo") {
    const { requestId, associatedCookies = [] } = message.params;
    const key = [...requestOrder]
      .reverse()
      .find((k) => k.startsWith(`${requestId}#`));
    const seen = key ? requests.get(key) : undefined;
    if (!seen) return;
    for (const entry of associatedCookies) {
      const reasons: string[] = (entry.blockedReasons ?? []).filter(
        (r: string) => r,
      );
      if (reasons.length) {
        seen.blocked.push({ name: entry.cookie.name, reasons });
      } else {
        seen.cookies.push(entry.cookie.name);
      }
    }
  }
});
/** Requests since `mark` (an index into requestOrder). */
const requestsSince = (mark: number) =>
  requestOrder
    .slice(mark)
    .map((key) => requests.get(key))
    .filter((r): r is SeenRequest => Boolean(r));

/** Horizontal page scroll and small tap targets on the current screen. */
function layoutReport() {
  return evaluate(() => {
    const doc = document.documentElement;
    const dialogs = [
      ...document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
    ];
    const roots = dialogs.length
      ? dialogs
      : [document.querySelector("main") ?? document.body];
    const small: string[] = [];
    for (const root of roots) {
      for (const el of root.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), textarea, [role="tab"], [role="combobox"], [role="checkbox"]',
      )) {
        const r = el.getBoundingClientRect();
        if (!(r.width && r.height)) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (r.height >= 40 && r.width >= 40) continue;
        const label = (
          el.getAttribute("aria-label") ||
          el.textContent ||
          el.getAttribute("placeholder") ||
          el.tagName
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40);
        small.push(`${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return { overflow: doc.scrollWidth - doc.clientWidth, small };
  }) as Promise<{ overflow: number; small: string[] }>;
}

async function shot(name: string) {
  if (!SHOTS) return;
  const SHOTS_HERE = SHOT_DIR;
  // The cookie banner would cover the page.
  await evaluate(() => {
    const reject = window.__e2e.byRole("button", "Reject all", { exact: true });
    if (reject) window.__e2e.click(reject);
  });
  await sleep(300);
  mkdirSync(SHOTS_HERE, { recursive: true });
  if (MOBILE) {
    const report = await layoutReport();
    layout[name] = report;
    check(
      `${name}: no horizontal scroll at 390 px`,
      report.overflow <= 0,
      `scrollWidth - clientWidth = ${report.overflow}`,
    );
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
    // Headless Chrome sometimes never answers a capture: skip it, don't hang.
    // Phones: the whole page, so nothing below the fold goes unseen.
    const height = MOBILE
      ? ((await evaluate(
          () => document.documentElement.scrollHeight,
        )) as number)
      : 0;
    const captured = (await Promise.race([
      cdp.send(
        "Page.captureScreenshot",
        MOBILE
          ? {
              format: "png",
              captureBeyondViewport: true,
              clip: { x: 0, y: 0, width: 390, height, scale: 1 },
            }
          : { format: "png" },
      ),
      sleep(15_000).then(() => null),
    ])) as { data: string } | null;
    if (!captured) {
      console.log(`  (screenshot ${name}-${scheme} timed out)`);
      continue;
    }
    writeFileSync(
      join(SHOTS_HERE, `${name}-${scheme}.png`),
      Buffer.from(captured.data, "base64"),
    );
  }
  await evaluate(() => document.documentElement.classList.remove("dark"));
}

/** A real mouse click (Radix menus ignore synthetic events) on the element `find` returns. */
async function mouseClick(find: string) {
  const box = await evaluate((source: string) => {
    const el = new Function(`return (${source})()`)() as Element | null;
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, find);
  if (!box) throw new Error(`Nothing to click: ${find}`);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await cdp.send("Input.dispatchMouseEvent", {
      type,
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
    });
  }
}

/** The TXT record's value on the Verify card (the code after "Value"). */
const recordValue = () =>
  evaluate(() => {
    const label = [...document.querySelectorAll("div")].find(
      (el) => el.textContent === "Value" && el.children.length === 0,
    );
    return label?.nextElementSibling?.querySelector("code")?.textContent ?? "";
  }) as Promise<string>;

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

function latestCode(email: string): string {
  const log = readFileSync(DEV_LOG, "utf8");
  const matches = [...log.matchAll(/sign-in code for (\S+): (\d{6})/g)].filter(
    (m) => m[1] === email,
  );
  const code = matches.at(-1)?.[2];
  if (!code) throw new Error(`No code in the dev log for ${email}`);
  return code;
}

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
  await forgetSignInConfirmation();
}

/**
 * A finished sign-in counts as "Confirm it's you" for 10 minutes
 * (packages/auth/new-sign-in.ts). The checks here are about the dialog, so
 * the new session's own confirmation ends at once ("10 minutes later"); a
 * confirmation an earlier session made still never carries over.
 */
async function forgetSignInConfirmation() {
  const id = await evaluate(async () => {
    const response = await fetch("/api/auth/get-session");
    return response.ok ? ((await response.json())?.session?.id ?? "") : "";
  });
  if (id)
    sql(
      `delete from verification where identifier=${q(`qrdx-confirmed-${id}`)}`,
    );
}

const CONFIRM = "Confirm it's you";

/** Whether "Confirm it's you" opens within `timeout` ms. */
const confirmAsked = (timeout = 10_000) =>
  waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
    args: [CONFIRM] as never[],
    timeout,
  }).then(
    () => true,
    () => false,
  );

/**
 * "Confirm it's you" for an account without two-step verification: Send
 * code, the code from the dev log, then the dialog closes and the action
 * that asked runs again. Returns what the dialog said.
 */
async function confirmByEmail(email: string, shotName?: string) {
  if (!(await confirmAsked(20_000))) throw new Error(`${CONFIRM} didn't open`);
  const asked = (await evaluate(
    (t: string) =>
      // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
      (window.__e2e.byRole("dialog", t) as HTMLElement | null)?.innerText ?? "",
    CONFIRM,
  )) as string;
  if (shotName) await shot(`${shotName}-send`);
  const since = statSync(DEV_LOG).size;
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
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`confirmation code for ${escaped}: (\\d{6})`);
  let code = "";
  for (let i = 0; i < 80 && !code; i++) {
    const log = readFileSync(DEV_LOG).subarray(since).toString("utf8");
    code = log.match(pattern)?.[1] ?? "";
    if (!code) await sleep(250);
  }
  if (!code)
    throw new Error(`No confirmation code in the dev log for ${email}`);
  if (shotName) {
    await waitFor(
      (t: string) =>
        /Enter the code we sent/.test(
          window.__e2e.byRole("dialog", t)?.textContent ?? "",
        ),
      { args: [CONFIRM] as never[] },
    );
    await shot(`${shotName}-code`);
  }
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
  return asked;
}

/** "Remove single sign-on", then Remove in its dialog. */
async function clickRemoveSso() {
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Remove single sign-on") as HTMLElement,
    ),
  );
  await sleep(800);
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Remove", {
        exact: true,
        root: document.querySelector('[role="alertdialog"]') ?? document,
      }) as HTMLElement,
    ),
  );
}

/** Clicks Verify on the connection card. */
const clickVerify = () =>
  evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Verify", { exact: true }) as HTMLElement,
    ),
  );

/**
 * Starts "Sign in with SSO" on /sign-in; returns the page URL afterwards.
 * Starts from a clean browser (no cookies) unless `keepCookies`.
 */
async function startSso(
  email: string,
  stepShot?: string,
  { keepCookies = false } = {},
) {
  if (!keepCookies) await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Sign in with SSO", {
        exact: true,
      }) as HTMLElement,
    ),
  );
  await waitFor(() => Boolean(window.__e2e.byLabel("Work email")));
  await evaluate((e: string) => {
    window.__e2e.setValue(window.__e2e.byLabel("Work email") as HTMLElement, e);
  }, email);
  if (stepShot) await shot(stepShot);
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Continue", { exact: true }) as HTMLElement,
    ),
  );
  await sleep(2500);
  return href();
}

/**
 * At the mock IdP: sign in as `email` (with extra query flags for SAML).
 * `crossSite` (SAML): load the IdP's page from 127.0.0.1 instead of
 * localhost, so its POST back to QRdx is cross-site, like a real IdP's.
 */
async function idpSignIn(
  email: string,
  flags: Record<string, string> = {},
  { crossSite = false } = {},
) {
  const url = new URL(await href());
  if (Object.keys(flags).length > 0 || crossSite) {
    for (const [k, v] of Object.entries(flags)) url.searchParams.set(k, v);
    url.searchParams.set("auto", email);
    if (crossSite) url.hostname = "127.0.0.1";
    await goto(url.toString(), { wait: 3500 });
    return;
  }
  await evaluate((e: string) => {
    window.__e2e.setValue(window.__e2e.byLabel("Sign in as") as HTMLElement, e);
    window.__e2e.click(
      window.__e2e.byRole("button", "Sign in", { exact: true }) as HTMLElement,
    );
  }, email);
  await sleep(4000);
}

const userId = (email: string) =>
  sql(`select id from "user" where email=${q(email)}`);

/** The workspace the person's newest session opened. */
const activeWorkspace = (email: string) =>
  sql(
    `select coalesce(active_organization_id, '') from session where user_id=${q(userId(email))} order by created_at desc limit 1`,
  );
const liveSessions = (email: string) =>
  sql(
    `select count(*) from session where user_id=${q(userId(email))} and expires_at > now()`,
  );
/** The browser's session as the app sees it (null when signed out). */
const browserSession = () =>
  evaluate(async () => {
    const response = await fetch("/api/auth/get-session");
    return response.ok ? await response.json() : "error";
  });

/** Ends the browser's session, keeping its other cookies (trust_device). */
async function signOutKeepingCookies() {
  await evaluate(async () => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  });
}
/** The value of one of QRdx's auth cookies in this browser, or "". */
async function authCookie(name: string): Promise<string> {
  const { cookies } = (await cdp.send("Network.getCookies", {
    urls: [BASE],
  })) as { cookies: { name: string; value: string }[] };
  return cookies.find((c) => c.name === `better-auth.${name}`)?.value ?? "";
}

// ---- the authenticator app (RFC 6238, like e2e/two-factor.e2e.ts) ----
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
/** A code from a 30-second window no earlier code came from. */
async function freshTotp(secret: string): Promise<string> {
  while (step() <= lastStep) await sleep(1000);
  lastStep = step();
  return totpAt(secret, lastStep);
}

let slug = "";
let orgId = "";

/**
 * Turns on two-step verification in Settings the way a person does: "Confirm
 * it's you" with an emailed code, then the stepper with the authenticator
 * app.
 */
async function turnOnTwoFactor(email: string): Promise<string> {
  await emailSignIn(email);
  await goto(`${BASE}/settings/account#two-factor`, { wait: 3000 });
  await waitText("Two-step verification");
  await evaluate(() => {
    const e = window.__e2e;
    const button =
      e.byRole("button", "Turn on", { exact: true }) ??
      e.byRole("button", "Turn on");
    if (button) e.click(button);
  });
  await confirmByEmail(email);
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

/**
 * SSO sign-in of someone with two-step verification on: the challenge page,
 * no session until the code, then the SSO workspace.
 */
async function ssoWithTwoFactor(
  label: string,
  email: string,
  secret: string,
  shotName: string,
  { trust = false, crossSite = false } = {},
) {
  const before = liveSessions(email);
  await startSso(email);
  await idpSignIn(email, {}, { crossSite });
  const at = await href();
  check(
    `${label} + 2FA: sent to /sign-in/two-factor?next=…`,
    at.startsWith(`${BASE}/sign-in/two-factor?next=`),
    at,
  );
  check(
    `${label} + 2FA: no session before the code`,
    (await browserSession()) === null && liveSessions(email) === before,
    `sessions ${before} → ${liveSessions(email)}`,
  );
  await waitText("Your account asks for a second step");
  await shot(shotName);
  if (trust) {
    await evaluate(() => {
      const box = window.__e2e.byLabel("Don't ask again on this device");
      if (box) window.__e2e.click(box);
    });
    check(
      `${label} + 2FA: "Don't ask again on this device" ticked`,
      (await evaluate(
        () =>
          window.__e2e
            .byLabel("Don't ask again on this device")
            ?.getAttribute("aria-checked") === "true" ||
          (
            window.__e2e.byLabel(
              "Don't ask again on this device",
            ) as HTMLInputElement | null
          )?.checked === true,
      )) as boolean,
    );
  }
  const code = await freshTotp(secret);
  await evaluate((c: string) => {
    const field = window.__e2e.byLabel("Authenticator code");
    if (field) {
      field.focus();
      window.__e2e.setValue(field, c);
    }
  }, code);
  await waitFor(() => location.pathname.startsWith("/dashboard/"), {
    timeout: 20_000,
  });
  await sleep(1500);
  const session = (await browserSession()) as {
    user?: { email?: string };
  } | null;
  check(
    `${label} + 2FA: signed in after the code, in the SSO workspace`,
    session?.user?.email === email &&
      (await href()).startsWith(`${BASE}/dashboard/${slug}`) &&
      activeWorkspace(email) === orgId,
    await href(),
  );
  if (trust) {
    check(
      `${label} + 2FA: this browser is now trusted`,
      (await authCookie("trust_device")) !== "",
    );
  }
}

/**
 * SSO sign-in on a trusted device (cookies kept): no code asked, signed in,
 * in the SSO workspace. Returns the requests the sign-in made.
 */
async function trustedSsoSignIn(
  label: string,
  email: string,
  { crossSite = false } = {},
) {
  await signOutKeepingCookies();
  check(`${label}: signed out first`, (await browserSession()) === null);
  const trustBefore = await authCookie("trust_device");
  const before = liveSessions(email);
  const mark = requestOrder.length;
  await startSso(email, undefined, { keepCookies: true });
  await idpSignIn(email, {}, { crossSite });
  await waitFor(() => location.pathname.startsWith("/dashboard/"), {
    timeout: 20_000,
  }).catch(() => null);
  await sleep(1000);
  const seen = requestsSince(mark);
  const session = (await browserSession()) as {
    user?: { email?: string };
  } | null;
  check(
    `${label}: no code asked`,
    !seen.some((r) => r.url.includes("/sign-in/two-factor")),
    seen
      .filter(
        (r) =>
          r.url.startsWith(BASE) &&
          !r.url.startsWith(`${BASE}/_next/`) &&
          !r.url.startsWith(`${BASE}/__nextjs`),
      )
      .map((r) => `${r.method} ${r.url.replace(BASE, "")}`)
      .join(" → ")
      .slice(0, 400),
  );
  check(
    `${label}: signed in, in the SSO workspace`,
    session?.user?.email === email &&
      (await href()).startsWith(`${BASE}/dashboard/${slug}`) &&
      activeWorkspace(email) === orgId &&
      Number(liveSessions(email)) === Number(before) + 1,
    `${await href()} sessions ${before} → ${liveSessions(email)}`,
  );
  check(
    `${label}: trust cookie rotated`,
    trustBefore !== "" &&
      (await authCookie("trust_device")) !== "" &&
      (await authCookie("trust_device")) !== trustBefore,
  );
  return seen;
}

/** Opens the Team page's remove dialog for `email`; returns its text. */
async function removeDialogFor(email: string): Promise<string> {
  await evaluate((e: string) => {
    const row = [...document.querySelectorAll("tr")].find((tr) =>
      tr.textContent?.includes(e),
    );
    const button = [...(row?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent?.trim() === "Remove",
    );
    if (button) window.__e2e.click(button);
  }, email);
  await waitFor(() => Boolean(document.querySelector('[role="alertdialog"]')));
  await sleep(400);
  return (await evaluate(
    () =>
      // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
      document.querySelector<HTMLElement>('[role="alertdialog"]')?.innerText ??
      "",
  )) as string;
}

try {
  // ---- people ----
  const owner = `owner-${RUN}@qrdx.test`;
  const ana = `ana@${DOMAIN}`; // has an account before SSO
  const ben = `ben@${DOMAIN}`; // first sign-in is through SSO
  const carl = `carl@${DOMAIN}`; // SAML
  const eve = `eve-${RUN}@other.test`; // outside the domain

  await emailSignIn(eve);
  await emailSignIn(ana);
  const anaId = userId(ana);
  await emailSignIn(owner);
  const ownerId = userId(owner);
  slug = sql(
    `select o.slug from organization o join member m on m.organization_id=o.id where m.user_id=${q(ownerId)} and m.role='owner' limit 1`,
  );
  orgId = sql(`select id from organization where slug=${q(slug)}`);
  const page = `${BASE}/dashboard/${slug}/settings/sso`;

  console.log("plan gate");
  await goto(page, { wait: 3000 });
  check(
    "Free workspace: one calm line",
    (await text()).includes("Single sign-on comes with the Business plan."),
  );
  await shot("01-not-business");

  sql(
    `insert into subscription (id, created_at, amount, currency, recurring_interval, status, current_period_start, current_period_end, started_at, customer_id, product_id, checkout_id, user_id) values ('sub-${RUN}', now(), 1500, 'usd', 'month', 'active', now(), now() + interval '30 days', now(), 'cus-${RUN}', 'local-business-monthly', 'chk-${RUN}', ${q(ownerId)})`,
  );

  console.log("OIDC set-up");
  await goto(page, { wait: 3000 });
  check(
    "Business workspace: set-up form",
    (await text()).includes("Set up single sign-on"),
  );
  const redirectUri = await evaluate(() =>
    [...document.querySelectorAll("code")]
      .map((c) => c.textContent)
      .find((t) => t?.includes("/sso/callback/")),
  );
  check(
    "Shows the OIDC redirect URI",
    /\/api\/auth\/sso\/callback\/sso-[a-z0-9]{12}$/.test(redirectUri ?? ""),
    redirectUri,
  );
  await shot("02-setup-oidc");

  await evaluate(
    (domain: string, idp: string) => {
      const e = window.__e2e;
      e.setValue(e.byLabel("Email domain") as HTMLElement, domain);
      e.setValue(e.byLabel("Issuer URL") as HTMLElement, idp);
      e.setValue(e.byLabel("Client ID") as HTMLElement, "qrdx-test-client");
      e.setValue(e.byLabel("Client secret") as HTMLElement, "qrdx-test-secret");
      e.click(
        e.byRole("button", "Save connection", { exact: true }) as HTMLElement,
      );
    },
    DOMAIN,
    IDP,
  );
  const createAsked = await confirmByEmail(owner, "02b-confirm-sso");
  check(
    "Saving the connection asks to confirm it's you (an emailed code)",
    createAsked.includes("Before you change single sign-on") &&
      createAsked.includes("We'll email a 6-digit code"),
    createAsked.replace(/\s+/g, " ").slice(0, 160),
  );
  await waitText(`Verify ${DOMAIN}`);
  const providerId = sql(
    `select provider_id from sso_provider where organization_id=${q(orgId)}`,
  );
  check(
    "Connection saved, unverified",
    sql(
      `select domain_verified from sso_provider where provider_id=${q(providerId)}`,
    ) === "f",
  );
  check(
    "Redirect URI matches the saved connection",
    (redirectUri ?? "").endsWith(providerId),
  );
  const recordName = `_qrdx-${providerId}.${DOMAIN}`;
  check(
    "Shows the TXT record name",
    (await text()).includes(`_qrdx-${providerId}`),
  );
  await shot("03-connection-unverified");

  console.log("unverified connection can't sign anyone in");
  await startSso(ben, "04a-sign-in-sso-step");
  check(
    "Refused before verification",
    (await text()).includes(`No SSO is set up for ${DOMAIN}.`),
  );
  await shot("04-sign-in-sso-not-set-up");

  console.log("domain verification");
  // A new sign-in is a new session: it confirms again.
  await emailSignIn(owner);
  await goto(page, { wait: 3000 });
  await clickVerify();
  await confirmByEmail(owner);
  check("Verifying from a new session asks to confirm it's you", true);
  await waitText("We didn't find the TXT record");
  check("Missing record: clear reason", true);
  await shot("05-verify-missing-record");

  const token = await recordValue();
  writeFileSync(DNS_FILE, JSON.stringify({ [recordName]: [token] }));
  await clickVerify();
  await waitText("Verified");
  check(
    "Verifying again within 10 minutes doesn't ask",
    !(await confirmAsked(500)),
  );
  check(
    "Verified through DNS",
    sql(
      `select domain_verified from sso_provider where provider_id=${q(providerId)}`,
    ) === "t",
  );
  await sleep(1500);
  // Join as viewer.
  if (MOBILE) {
    // CDP touch taps don't open Radix menus; the keyboard does, on phones too.
    await evaluate(() => window.__e2e.byLabel("Join as")?.focus());
    for (const key of ["Enter", "ArrowDown", "Enter"]) {
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key,
        code: key,
        windowsVirtualKeyCode: key === "Enter" ? 13 : 40,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code: key,
        windowsVirtualKeyCode: key === "Enter" ? 13 : 40,
      });
      await sleep(500);
    }
  } else {
    await mouseClick(`() => window.__e2e.byLabel("Join as")`);
    await sleep(600);
    await mouseClick(`() => window.__e2e.byRole("option", "Viewer")`);
  }
  await sleep(2500);
  check(
    "Join role saved",
    sql(`select metadata from organization where id=${q(orgId)}`).includes(
      '"ssoJoinRole":"viewer"',
    ),
  );
  await goto(page, { wait: 3000 });
  await shot("06-connection-verified");
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Replace secret", {
        exact: true,
      }) as HTMLElement,
    ),
  );
  await waitFor(() => Boolean(window.__e2e.byRole("dialog", "")));
  await shot("06b-replace-secret");
  await evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as Element;
    window.__e2e.setValue(
      dialog.querySelector("input") as HTMLInputElement,
      "qrdx-test-secret",
    );
    window.__e2e.click(
      window.__e2e.byRole("button", "Save", {
        exact: true,
        root: dialog,
      }) as HTMLElement,
    );
  });
  await waitText("Client secret updated");
  check(
    "Client secret replaced, without asking again",
    !(await confirmAsked(500)),
  );

  console.log("OIDC sign-in, new person");
  await startSso(ben);
  check("Went to the IdP", (await href()).startsWith(IDP));
  await shot("07-mock-idp");
  await idpSignIn(ben);
  check(
    "Back in QRdx, signed in, in the SSO workspace",
    (await href()).startsWith(`${BASE}/dashboard/${slug}`),
    await href(),
  );
  const benId = userId(ben);
  check("…which the session opened", activeWorkspace(ben) === orgId);
  check(
    "Account created, address verified",
    sql(`select email_verified from "user" where id=${q(benId)}`) === "t",
  );
  check(
    "Linked to the connection",
    sql(
      `select count(*) from account where user_id=${q(benId)} and provider_id=${q(providerId)}`,
    ) === "1",
  );
  check(
    "Joined the workspace as viewer",
    sql(
      `select role from member where user_id=${q(benId)} and organization_id=${q(orgId)}`,
    ) === "viewer",
  );

  console.log("viewer can't manage");
  await goto(page, { wait: 3000 });
  check("Viewer sees why", (await text()).includes("You're a viewer here."));
  check("No set-up controls", !(await text()).includes("Replace secret"));
  await shot("08-viewer");

  console.log("OIDC sign-in, existing account");
  await startSso(ana);
  await idpSignIn(ana);
  check(
    "Signed in, in the SSO workspace",
    (await href()).startsWith(`${BASE}/dashboard/${slug}`) &&
      activeWorkspace(ana) === orgId,
    await href(),
  );
  check(
    "Same account, no duplicate",
    sql(`select count(*) from "user" where email=${q(ana)}`) === "1" &&
      userId(ana) === anaId,
  );
  check(
    "Linked to the connection",
    sql(
      `select count(*) from account where user_id=${q(anaId)} and provider_id=${q(providerId)}`,
    ) === "1",
  );
  check(
    "Joined the workspace",
    sql(
      `select role from member where user_id=${q(anaId)} and organization_id=${q(orgId)}`,
    ) === "viewer",
  );

  console.log("two-step verification, OIDC");
  const tara = `tara@${DOMAIN}`; // has 2FA on before her first SSO sign-in
  const taraSecret = await turnOnTwoFactor(tara);
  check("Two-step verification on", taraSecret.length >= 16);
  await ssoWithTwoFactor("OIDC", tara, taraSecret, "16-two-factor-oidc", {
    trust: true,
  });

  console.log("trusted device, OIDC");
  await trustedSsoSignIn("OIDC + trusted device", tara);

  console.log("address outside the domain");
  const outsider = `zed-${RUN}@elsewhere.test`;
  await startSso(`zoe@${DOMAIN}`);
  await idpSignIn(outsider);
  check(
    "Refused with a message",
    (await text()).includes("outside your company's domain"),
    await href(),
  );
  check(
    "No account created",
    sql(`select count(*) from "user" where email=${q(outsider)}`) === "0",
  );
  await shot("09-outside-domain");
  await startSso(`zoe@${DOMAIN}`);
  await idpSignIn(eve);
  check(
    "Existing outside account not linked",
    sql(
      `select count(*) from account where user_id=${q(userId(eve))} and provider_id=${q(providerId)}`,
    ) === "0",
  );
  check(
    "…and not signed in",
    !(await href()).startsWith(`${BASE}/dashboard`),
    await href(),
  );

  console.log("every SSO sign-in joins: removed, promoted, invited");
  const team = `${BASE}/dashboard/${slug}/settings/team`;
  // Someone outside the SSO domain, for the dialog without the warning.
  const eveId = userId(eve);
  sql(
    `insert into member (id, organization_id, user_id, role, created_at) values ('m-eve-${RUN}', ${q(orgId)}, ${q(eveId)}, 'member', now())`,
  );
  await emailSignIn(owner);
  await goto(team, { wait: 3000 });
  const plainDialog = await removeDialogFor(eve);
  check(
    "Remove dialog: no SSO warning for someone outside the domain",
    plainDialog.includes("They lose access") &&
      !plainDialog.includes("single sign-on"),
    plainDialog.replace(/\s+/g, " ").slice(0, 200),
  );
  await shot("21a-remove-member");
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Cancel", {
        exact: true,
        root: document.querySelector('[role="alertdialog"]') ?? document,
      }) as HTMLElement,
    ),
  );
  await sleep(600);
  const ssoDialog = await removeDialogFor(ben);
  check(
    "Remove dialog: says an SSO member rejoins unless unassigned in the IdP",
    ssoDialog.includes(
      `${ben} can sign in with single sign-on, so they'll rejoin the next time they do, unless you unassign them from QRdx in your identity provider first.`,
    ),
    ssoDialog.replace(/\s+/g, " ").slice(0, 300),
  );
  await shot("21-remove-sso-member");
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Remove member", {
        exact: true,
        root: document.querySelector('[role="alertdialog"]') ?? document,
      }) as HTMLElement,
    ),
  );
  await waitText(`Removed ${ben.split("@")[0]}`).catch(() => null);
  await sleep(1000);
  check(
    "Removed on the Team page",
    sql(
      `select count(*) from member where user_id=${q(benId)} and organization_id=${q(orgId)}`,
    ) === "0",
  );
  await startSso(ben);
  await idpSignIn(ben);
  check(
    "Removed member rejoins at the next SSO sign-in, in the SSO workspace",
    (await href()).startsWith(`${BASE}/dashboard/${slug}`) &&
      activeWorkspace(ben) === orgId,
    await href(),
  );
  check(
    "…with the join role",
    sql(
      `select role from member where user_id=${q(benId)} and organization_id=${q(orgId)}`,
    ) === "viewer",
  );

  sql(
    `update member set role='admin' where user_id=${q(anaId)} and organization_id=${q(orgId)}`,
  );
  await startSso(ana);
  await idpSignIn(ana);
  check(
    "Promoted member signs in with SSO",
    (await href()).startsWith(`${BASE}/dashboard/${slug}`),
    await href(),
  );
  check(
    "…and keeps their role",
    sql(
      `select role from member where user_id=${q(anaId)} and organization_id=${q(orgId)}`,
    ) === "admin",
  );

  const dan = `dan@${DOMAIN}`;
  sql(
    `insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id, created_at) values ('inv-${RUN}', ${q(orgId)}, ${q(dan)}, 'admin', 'pending', now() + interval '2 days', ${q(ownerId)}, now())`,
  );
  await startSso(dan);
  await idpSignIn(dan);
  check(
    "Invited person signs in, in the SSO workspace",
    (await href()).startsWith(`${BASE}/dashboard/${slug}`) &&
      activeWorkspace(dan) === orgId,
    await href(),
  );
  check(
    "…joins with the invitation's role",
    sql(
      `select role from member where user_id=${q(userId(dan))} and organization_id=${q(orgId)}`,
    ) === "admin",
  );
  check(
    "…and the invitation is accepted",
    sql(`select status from invitation where id='inv-${RUN}'`) === "accepted",
  );
  check(
    "…once (one membership)",
    sql(
      `select count(*) from member where user_id=${q(userId(dan))} and organization_id=${q(orgId)}`,
    ) === "1",
  );

  console.log("plan drops below Business");
  sql(`update subscription set status='canceled' where id='sub-${RUN}'`);
  await startSso(ben);
  check(
    "Sign-in refused",
    (await text()).includes(`SSO for ${DOMAIN} isn't available right now`),
  );
  await shot("10-sign-in-plan-dropped");
  sql(`update subscription set status='active' where id='sub-${RUN}'`);
  await startSso(ben);
  sql(`update subscription set status='canceled' where id='sub-${RUN}'`);
  await idpSignIn(ben);
  check(
    "Refused at the callback too",
    (await href()).includes("/sign-in?error=sso_unavailable"),
    await href(),
  );
  check(
    "…with a message",
    (await text()).includes("isn't available for this workspace right now"),
  );
  await emailSignIn(owner);
  await goto(page, { wait: 3000 });
  check(
    "Settings say it's paused",
    (await text()).includes("no longer includes single sign-on"),
  );
  check(
    "…and it can still be removed",
    await evaluate(() =>
      Boolean(window.__e2e.byRole("button", "Remove single sign-on")),
    ),
  );
  await shot("11-settings-plan-dropped");
  sql(`update subscription set status='active' where id='sub-${RUN}'`);

  console.log("a 2-day-old session confirms instead of signing in again");
  // The session is 2 days old and hasn't confirmed: removing asks "Confirm
  // it's you", never to sign out and in again, and works once confirmed.
  sql(
    `update session set created_at = now() - interval '2 days' where user_id=${q(ownerId)}`,
  );
  await goto(page, { wait: 3000 });
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Remove single sign-on") as HTMLElement,
    ),
  );
  await sleep(800);
  await shot("12a-remove-dialog");
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Remove", {
        exact: true,
        root: document.querySelector('[role="alertdialog"]') ?? document,
      }) as HTMLElement,
    ),
  );
  const removeAsked = await confirmByEmail(owner, "12-remove-confirm");
  check(
    "2-day-old session: removing asks to confirm it's you, not to sign in again",
    removeAsked.includes("Before you change single sign-on") &&
      !(await text()).includes("sign out and sign in again"),
    removeAsked.replace(/\s+/g, " ").slice(0, 160),
  );
  await waitText("Set up single sign-on");
  check(
    "2-day-old session: removed once confirmed",
    sql(
      `select count(*) from sso_provider where provider_id=${q(providerId)}`,
    ) === "0",
  );
  check(
    "Removed, links gone",
    sql(`select count(*) from account where provider_id=${q(providerId)}`) ===
      "0",
  );
  check(
    "Members stay",
    sql(
      `select count(*) from member where organization_id=${q(orgId)} and user_id in (${q(anaId)}, ${q(benId)})`,
    ) === "2",
  );

  console.log("a confirmation older than 10 minutes asks again, then SAML");
  // "10 minutes later": the owner's confirmations end now. The app stores
  // UTC wall times in `timestamp` columns, so now() is taken in UTC.
  sql(
    `update verification set expires_at = (now() at time zone 'utc') - interval '1 second' where identifier in (select 'qrdx-confirmed-' || id from session where user_id=${q(ownerId)})`,
  );
  const metadata = await (await fetch(`${IDP}/saml/metadata`)).text();
  await evaluate(() =>
    window.__e2e.click(window.__e2e.byRole("tab", "SAML 2.0") as HTMLElement),
  );
  await sleep(500);
  await shot("13-setup-saml");
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
  const againAsked = await confirmByEmail(owner);
  check(
    "A confirmation older than 10 minutes asks again (SAML set-up)",
    againAsked.includes("Before you change single sign-on"),
    againAsked.replace(/\s+/g, " ").slice(0, 160),
  );
  await waitText(`Verify ${DOMAIN}`);
  const samlId = sql(
    `select provider_id from sso_provider where organization_id=${q(orgId)}`,
  );
  const samlToken = await recordValue();
  writeFileSync(
    DNS_FILE,
    JSON.stringify({ [`_qrdx-${samlId}.${DOMAIN}`]: [samlToken] }),
  );
  await clickVerify();
  await waitText("Verified");
  await goto(page, { wait: 3000 });
  await shot("14-saml-verified");

  console.log("SAML sign-in");
  await startSso(carl);
  check(
    "Went to the IdP (SAML)",
    (await href()).startsWith(`${IDP}/saml/sso`),
    await href(),
  );
  await idpSignIn(carl, { unsigned: "1" });
  check(
    "Unsigned assertion refused",
    !(await href()).startsWith(`${BASE}/dashboard`) &&
      sql(`select count(*) from "user" where email=${q(carl)}`) === "0",
    await href(),
  );
  await startSso(carl);
  await idpSignIn(carl, { notimes: "1" });
  check(
    "Assertion without timestamps refused",
    sql(`select count(*) from "user" where email=${q(carl)}`) === "0",
    await href(),
  );
  await startSso(carl);
  await idpSignIn(carl);
  check(
    "Signed in with SAML, in the SSO workspace",
    (await href()).startsWith(`${BASE}/dashboard/${slug}`) &&
      activeWorkspace(carl) === orgId,
    await href(),
  );
  const carlId = userId(carl);
  check(
    "Joined as viewer",
    sql(
      `select role from member where user_id=${q(carlId)} and organization_id=${q(orgId)}`,
    ) === "viewer",
  );
  check(
    "Name from displayName",
    sql(`select name from "user" where id=${q(carlId)}`) === "carl",
  );
  await startSso(ben);
  await idpSignIn(ben);
  check(
    "Earlier OIDC member links to SAML too",
    sql(
      `select count(*) from account where user_id=${q(benId)} and provider_id=${q(samlId)}`,
    ) === "1",
  );

  console.log("SAML refusals land on the sign-in page");
  await startSso(`zoe@${DOMAIN}`);
  await idpSignIn(eve);
  check(
    "Existing outside account: /sign-in with next and the code",
    (await href()) ===
      `${BASE}/sign-in?next=%2Fdashboard&error=account_not_linked`,
    await href(),
  );
  check("…and the SSO message", (await text()).includes("couldn't be linked"));
  await shot("17-saml-not-linked");
  const outsider2 = `yan-${RUN}@elsewhere.test`;
  await startSso(`zoe@${DOMAIN}`);
  await idpSignIn(outsider2);
  check(
    "Address outside the domain: /sign-in with next and the code",
    (await href()).startsWith(
      `${BASE}/sign-in?next=%2Fdashboard&error=sso_email_outside_domain`,
    ),
    await href(),
  );
  check(
    "…and the SSO message",
    (await text()).includes("outside your company's domain") &&
      sql(`select count(*) from "user" where email=${q(outsider2)}`) === "0",
  );

  console.log("two-step verification, SAML");
  await ssoWithTwoFactor("SAML", tara, taraSecret, "18-two-factor-saml");

  console.log("trusted device, SAML posted from another site");
  const mark = requestOrder.length;
  await ssoWithTwoFactor(
    "SAML cross-site",
    tara,
    taraSecret,
    "18b-two-factor-saml-cross-site",
    { trust: true, crossSite: true },
  );
  const acsPost = (since: number) =>
    requestsSince(since).find(
      (r) => r.method === "POST" && r.url.includes("/sso/saml2/sp/acs/"),
    );
  const firstPost = acsPost(mark);
  check(
    "SAML cross-site: the ACS POST came from the IdP's site",
    firstPost?.origin === `http://127.0.0.1:${new URL(IDP).port}`,
    firstPost?.origin,
  );
  check(
    "SAML cross-site: …and went through /two-factor/continue to the page",
    requestsSince(mark).some((r) =>
      r.url.startsWith(`${BASE}/api/auth/two-factor/continue?next=`),
    ),
  );
  const seen = await trustedSsoSignIn("SAML + trusted device", tara, {
    crossSite: true,
  });
  const trustedPost = seen.find(
    (r) => r.method === "POST" && r.url.includes("/sso/saml2/sp/acs/"),
  );
  check(
    "SAML + trusted device: Chrome kept the trust cookie off the cross-site POST",
    Boolean(trustedPost) &&
      !trustedPost?.cookies.includes("better-auth.trust_device") &&
      Boolean(
        trustedPost?.blocked.some(
          (b) =>
            b.name === "better-auth.trust_device" &&
            b.reasons.some((r) => /SameSite/i.test(r)),
        ),
      ),
    JSON.stringify(trustedPost?.blocked ?? null),
  );
  const continued = seen.find((r) =>
    r.url.startsWith(`${BASE}/api/auth/two-factor/continue`),
  );
  check(
    "SAML + trusted device: …and the GET to /two-factor/continue carried it",
    Boolean(continued?.cookies.includes("better-auth.trust_device")),
    JSON.stringify(continued ?? null).slice(0, 300),
  );

  console.log("SAML without the trust cookie (fresh browser)");
  await startSso(tara); // clears every cookie
  await idpSignIn(tara, {}, { crossSite: true });
  check(
    "SAML, no trust cookie: the code is asked",
    (await href()).startsWith(`${BASE}/sign-in/two-factor?next=`) &&
      (await browserSession()) === null,
    await href(),
  );

  console.log("SAML entered by hand, certificate replaced");
  await emailSignIn(owner);
  await goto(page, { wait: 3000 });
  check(
    "No 'Replace certificate' for a metadata connection",
    !(await text()).includes("Replace certificate"),
  );
  await clickRemoveSso();
  await confirmByEmail(owner);
  await waitText("Set up single sign-on");
  const certificate = await (await fetch(`${IDP}/saml/certificate`)).text();
  await evaluate(() =>
    window.__e2e.click(window.__e2e.byRole("tab", "SAML 2.0") as HTMLElement),
  );
  await sleep(400);
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Enter the details instead", {
        exact: true,
      }) as HTMLElement,
    ),
  );
  await sleep(400);
  await evaluate(
    (domain: string, idp: string, cert: string) => {
      const e = window.__e2e;
      e.setValue(e.byLabel("Email domain") as HTMLElement, domain);
      e.setValue(e.byLabel("Sign-in URL") as HTMLElement, `${idp}/saml/sso`);
      e.setValue(
        e.byLabel("Identity provider entity ID") as HTMLElement,
        `${idp}/saml/metadata`,
      );
      e.setValue(e.byLabel("Signing certificate") as HTMLElement, cert);
      e.click(
        e.byRole("button", "Save connection", { exact: true }) as HTMLElement,
      );
    },
    DOMAIN,
    IDP,
    certificate,
  );
  await waitText(`Verify ${DOMAIN}`);
  const manualId = sql(
    `select provider_id from sso_provider where organization_id=${q(orgId)}`,
  );
  const manualToken = await recordValue();
  writeFileSync(
    DNS_FILE,
    JSON.stringify({ [`_qrdx-${manualId}.${DOMAIN}`]: [manualToken] }),
  );
  await clickVerify();
  await waitText("Verified");
  await goto(page, { wait: 3000 });
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Replace certificate", {
        exact: true,
      }) as HTMLElement,
    ),
  );
  await waitFor(() => Boolean(window.__e2e.byRole("dialog", "")));
  await shot("15a-replace-certificate");
  await evaluate((cert: string) => {
    const dialog = document.querySelector('[role="dialog"]') as Element;
    window.__e2e.setValue(
      dialog.querySelector("textarea") as HTMLTextAreaElement,
      cert,
    );
    window.__e2e.click(
      window.__e2e.byRole("button", "Save", {
        exact: true,
        root: dialog,
      }) as HTMLElement,
    );
  }, certificate);
  await waitText("Certificate updated");
  check("Certificate replaced", true);
  await goto(page, { wait: 3000 });
  await shot("15-saml-manual");
  const erin = `erin@${DOMAIN}`;
  await startSso(erin);
  await idpSignIn(erin);
  check(
    "Signed in with the hand-entered SAML connection, in the SSO workspace",
    (await href()).startsWith(`${BASE}/dashboard/${slug}`) &&
      activeWorkspace(erin) === orgId,
    await href(),
  );
  check(
    "…and joined",
    sql(
      `select role from member where user_id=${q(userId(erin))} and organization_id=${q(orgId)}`,
    ) === "viewer",
  );

  console.log("docs and pricing");
  await goto(`${BASE}/docs/help/teams/single-sign-on`, { wait: 3000 });
  check("Docs page renders", (await text()).includes("Verify your domain"));
  await shot("19-docs-sso");
  await goto(`${BASE}/pricing`, { wait: 3000 });
  check(
    "Pricing lists single sign-on",
    (await text()).includes("Single sign-on"),
  );
  await shot("20-pricing");
} catch (error) {
  failures++;
  console.error("✗ stopped:", error);
  if (SHOTS) {
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
    });
    writeFileSync(join(SHOTS, "zz-failure.png"), Buffer.from(data, "base64"));
    console.error(
      "page:",
      await href().catch(() => "?"),
      (await text().catch(() => "")).slice(0, 600),
    );
  }
} finally {
  await browser.close();
}
const cspResult = csp.result(cspOn);
if (cspResult.skipped) {
  console.log(`\n  - no CSP violations: skipped (${cspResult.note})`);
} else {
  check("no CSP violations", cspResult.ok, cspResult.lines.join("\n      "));
}
if (MOBILE) {
  console.log("\nTap targets under 40 px, by screen:");
  for (const [name, report] of Object.entries(layout)) {
    console.log(`  ${name}: ${report.small.join("; ") || "none"}`);
  }
}
console.log(failures ? `\n${failures} failed` : "\nAll SSO checks passed");
process.exit(failures ? 1 : 0);
