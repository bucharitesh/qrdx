// Workspace single sign-on, end to end against a running dev server and a
// THROWAWAY local database, driven over the Chrome DevTools Protocol. It
// writes to the database (test users, a Business subscription), so it refuses
// to run unless DATABASE_URL in .env.local points at localhost.
//
// Needs, all local:
//   node e2e/sso/dns-stub.mjs <records.json> 5399
//   node e2e/sso/mock-idp.mjs 4455
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
// without timestamps (refused); viewers can't manage; the recent sign-in
// rule; screenshots of each screen in light and dark.
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const BASE = (process.env.SSO_E2E_BASE_URL ?? "").replace(/\/$/, "");
const DEV_LOG = process.env.SSO_E2E_DEV_LOG ?? "";
const DNS_FILE = process.env.SSO_E2E_DNS_FILE ?? "";
const PSQL = process.env.SSO_E2E_PSQL ?? "";
const SHOTS = process.env.SSO_E2E_SHOTS ?? "";
const IDP = "http://localhost:4455";
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
    args: [needle],
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
}

/** Starts "Sign in with SSO" on /sign-in; returns the page URL afterwards. */
async function startSso(email: string, stepShot?: string) {
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Sign in with SSO", { exact: true }),
    ),
  );
  await waitFor(() => Boolean(window.__e2e.byLabel("Work email")));
  await evaluate((e: string) => {
    window.__e2e.setValue(window.__e2e.byLabel("Work email"), e);
  }, email);
  if (stepShot) await shot(stepShot);
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Continue", { exact: true }),
    ),
  );
  await sleep(2500);
  return href();
}

/** At the mock IdP: sign in as `email` (with extra query flags for SAML). */
async function idpSignIn(email: string, flags: Record<string, string> = {}) {
  const url = new URL(await href());
  if (Object.keys(flags).length > 0) {
    for (const [k, v] of Object.entries(flags)) url.searchParams.set(k, v);
    url.searchParams.set("auto", email);
    await goto(url.toString(), { wait: 3500 });
    return;
  }
  await evaluate((e: string) => {
    window.__e2e.setValue(window.__e2e.byLabel("Sign in as"), e);
    window.__e2e.click(
      window.__e2e.byRole("button", "Sign in", { exact: true }),
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

/** Turns on two-step verification in Settings the way a person does. */
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
  await waitText("Set up your authenticator app");
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
  await waitText("Save these backup codes");
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
  await waitText("10 of 10 backup codes left");
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
) {
  const before = liveSessions(email);
  await startSso(email);
  await idpSignIn(email);
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
      e.setValue(e.byLabel("Email domain"), domain);
      e.setValue(e.byLabel("Issuer URL"), idp);
      e.setValue(e.byLabel("Client ID"), "qrdx-test-client");
      e.setValue(e.byLabel("Client secret"), "qrdx-test-secret");
      e.click(e.byRole("button", "Save connection", { exact: true }));
    },
    DOMAIN,
    IDP,
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
  await emailSignIn(owner);
  await goto(page, { wait: 3000 });
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Verify", { exact: true }),
    ),
  );
  await waitText("We didn't find the TXT record");
  check("Missing record: clear reason", true);
  await shot("05-verify-missing-record");

  const token = await recordValue();
  writeFileSync(DNS_FILE, JSON.stringify({ [recordName]: [token] }));
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Verify", { exact: true }),
    ),
  );
  await waitText("Verified");
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
      window.__e2e.byRole("button", "Replace secret", { exact: true }),
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
      window.__e2e.byRole("button", "Save", { exact: true, root: dialog }),
    );
  });
  await waitText("Client secret updated");
  check("Client secret replaced", true);

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
  await ssoWithTwoFactor("OIDC", tara, taraSecret, "16-two-factor-oidc");

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

  console.log("removed members and invitations");
  sql(
    `delete from member where user_id=${q(benId)} and organization_id=${q(orgId)}`,
  );
  await startSso(ben);
  await idpSignIn(ben);
  check(
    "Removed member signs in",
    (await href()).startsWith(`${BASE}/dashboard`),
    await href(),
  );
  check(
    "…but isn't added back",
    sql(
      `select count(*) from member where user_id=${q(benId)} and organization_id=${q(orgId)}`,
    ) === "0",
  );
  sql(
    `insert into member (id, organization_id, user_id, role, created_at) values ('m-ben-${RUN}', ${q(orgId)}, ${q(benId)}, 'viewer', now())`,
  );
  const dan = `dan@${DOMAIN}`;
  sql(
    `insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id, created_at) values ('inv-${RUN}', ${q(orgId)}, ${q(dan)}, 'member', 'pending', now() + interval '2 days', ${q(ownerId)}, now())`,
  );
  await startSso(dan);
  await idpSignIn(dan);
  check(
    "Invited person signs in",
    (await href()).startsWith(`${BASE}/dashboard`),
    await href(),
  );
  check(
    "…and joins through the invitation, not SSO",
    sql(
      `select count(*) from member where user_id=${q(userId(dan))} and organization_id=${q(orgId)}`,
    ) === "0",
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

  console.log("recent sign-in rule");
  sql(
    `update session set created_at = now() - interval '2 days' where user_id=${q(ownerId)}`,
  );
  await goto(page, { wait: 3000 });
  await evaluate(() =>
    window.__e2e.click(window.__e2e.byRole("button", "Remove single sign-on")),
  );
  await sleep(800);
  await shot("12a-remove-dialog");
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Remove", {
        exact: true,
        root: document.querySelector('[role="alertdialog"]') ?? document,
      }),
    ),
  );
  await waitText("sign out and sign in again");
  check(
    "Old session must sign in again",
    sql(
      `select count(*) from sso_provider where provider_id=${q(providerId)}`,
    ) === "1",
  );
  await shot("12-reauth");

  console.log("remove, then SAML");
  await emailSignIn(owner);
  await goto(page, { wait: 3000 });
  await evaluate(() =>
    window.__e2e.click(window.__e2e.byRole("button", "Remove single sign-on")),
  );
  await sleep(800);
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Remove", {
        exact: true,
        root: document.querySelector('[role="alertdialog"]') ?? document,
      }),
    ),
  );
  await waitText("Set up single sign-on");
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

  const metadata = await (await fetch(`${IDP}/saml/metadata`)).text();
  await evaluate(() =>
    window.__e2e.click(window.__e2e.byRole("tab", "SAML 2.0")),
  );
  await sleep(500);
  await shot("13-setup-saml");
  await evaluate(
    (domain: string, xml: string) => {
      const e = window.__e2e;
      e.setValue(e.byLabel("Email domain"), domain);
      e.setValue(e.byLabel("Identity provider metadata"), xml);
      e.click(e.byRole("button", "Save connection", { exact: true }));
    },
    DOMAIN,
    metadata,
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
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Verify", { exact: true }),
    ),
  );
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

  console.log("SAML entered by hand, certificate replaced");
  await emailSignIn(owner);
  await goto(page, { wait: 3000 });
  check(
    "No 'Replace certificate' for a metadata connection",
    !(await text()).includes("Replace certificate"),
  );
  await evaluate(() =>
    window.__e2e.click(window.__e2e.byRole("button", "Remove single sign-on")),
  );
  await sleep(800);
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Remove", {
        exact: true,
        root: document.querySelector('[role="alertdialog"]') ?? document,
      }),
    ),
  );
  await waitText("Set up single sign-on");
  const certificate = await (await fetch(`${IDP}/saml/certificate`)).text();
  await evaluate(() =>
    window.__e2e.click(window.__e2e.byRole("tab", "SAML 2.0")),
  );
  await sleep(400);
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Enter the details instead", {
        exact: true,
      }),
    ),
  );
  await sleep(400);
  await evaluate(
    (domain: string, idp: string, cert: string) => {
      const e = window.__e2e;
      e.setValue(e.byLabel("Email domain"), domain);
      e.setValue(e.byLabel("Sign-in URL"), `${idp}/saml/sso`);
      e.setValue(
        e.byLabel("Identity provider entity ID"),
        `${idp}/saml/metadata`,
      );
      e.setValue(e.byLabel("Signing certificate"), cert);
      e.click(e.byRole("button", "Save connection", { exact: true }));
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
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Verify", { exact: true }),
    ),
  );
  await waitText("Verified");
  await goto(page, { wait: 3000 });
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Replace certificate", { exact: true }),
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
      window.__e2e.byRole("button", "Save", { exact: true, root: dialog }),
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
if (MOBILE) {
  console.log("\nTap targets under 40 px, by screen:");
  for (const [name, report] of Object.entries(layout)) {
    console.log(`  ${name}: ${report.small.join("; ") || "none"}`);
  }
}
console.log(failures ? `\n${failures} failed` : "\nAll SSO checks passed");
process.exit(failures ? 1 : 0);
