// "Require single sign-on for <domain>", end to end against a running dev
// server and a THROWAWAY local database, driven over the Chrome DevTools
// Protocol. It writes to the database (test users, a Business subscription,
// members), so it refuses to run unless DATABASE_URL in .env.local points at
// localhost.
//
// Needs, all local (like e2e/sso.e2e.mts):
//   node e2e/sso/dns-stub.mjs <records.json> 5399
//   MOCK_IDP_SP_ORIGIN=http://localhost:<port> node e2e/sso/mock-idp.mjs 4455
//   QRDX_TEST_DNS_SERVER=127.0.0.1:5399 \
//   NODE_OPTIONS="--require $PWD/e2e/sso/dns-preload.cjs" \
//   BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4455 \
//     pnpm exec next dev -p <port> > <dev.log>
//
//   SSO_E2E_BASE_URL=http://localhost:<port> SSO_E2E_DEV_LOG=<dev.log> \
//   SSO_E2E_DNS_FILE=<records.json> SSO_E2E_IDP=http://localhost:4455 \
//   SSO_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   SSO_E2E_SHOTS=<dir> [SSO_E2E_MOBILE=1] pnpm exec tsx e2e/sso-required.e2e.mts
//
// Covers: an OIDC connection set up and verified (DNS), then the setting:
// an admin at the domain who signed in another way can't turn it on (and
// says why); the owner turns it on (a confirm dialog, then "Confirm it's
// you"); that signs people at the domain out of sessions that didn't come
// from SSO, keeps SSO sessions (24 hours at most), and leaves owners and
// other domains alone. Then, while it's on: the email step says SSO is
// required; an email code is refused and the code option goes; SSO signs in
// for 24 hours at most; the owner still signs in with a code; an email
// change off the domain is refused; Google or GitHub's refusal reads right
// on /sign-in; workspace metadata can't be changed over HTTP; the second
// step still applies after SSO; a session whose 24 hours are up ends. Then
// it's turned off and codes work again. Screenshots of each new screen in
// light and dark.
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "./cdp.mjs";

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
  if (!value) {
    throw new Error(`Set SSO_E2E_${name === "BASE" ? "BASE_URL" : name}`);
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

async function shot(name: string) {
  if (!SHOTS) return;
  await evaluate(() => {
    const reject = window.__e2e.byRole("button", "Reject all", { exact: true });
    if (reject) window.__e2e.click(reject);
  });
  await sleep(300);
  mkdirSync(SHOT_DIR, { recursive: true });
  if (MOBILE) {
    const overflow = (await evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )) as number;
    check(
      `${name}: no horizontal scroll at 390 px`,
      overflow <= 0,
      `scrollWidth - clientWidth = ${overflow}`,
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
      join(SHOT_DIR, `${name}-${scheme}.png`),
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

/** The newest code of `kind` for `email` in the dev log, after `since` bytes. */
function codeFor(
  kind: "sign-in" | "confirmation",
  email: string,
  since = 0,
): string {
  const log = readFileSync(DEV_LOG).subarray(since).toString("utf8");
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${kind} code for ${escaped}: (\\d{6})`, "g");
  return [...log.matchAll(pattern)].at(-1)?.[1] ?? "";
}

async function waitForCode(
  kind: "sign-in" | "confirmation",
  email: string,
  since: number,
) {
  for (let i = 0; i < 80; i++) {
    const code = codeFor(kind, email, since);
    if (code) return code;
    await sleep(250);
  }
  throw new Error(`No ${kind} code in the dev log for ${email}`);
}

/** Email-code sign-in through the endpoints the panel calls; the status. */
async function emailSignIn(email: string, { clear = true } = {}) {
  if (clear) await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  const since = statSync(DEV_LOG).size;
  const sent = await evaluate(async (e: string) => {
    const r = await fetch("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: e, type: "sign-in" }),
    });
    return r.status;
  }, email);
  if (sent !== 200) throw new Error(`send code ${sent}`);
  const code = await waitForCode("sign-in", email, since);
  const reply = (await evaluate(
    async (e: string, otp: string) => {
      const r = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, otp }),
      });
      return { status: r.status, body: await r.text() };
    },
    email,
    code,
  )) as { status: number; body: string };
  if (reply.status === 200) await forgetSignInConfirmation();
  return reply;
}

/** The sign-in's own "Confirm it's you" ends at once, so the dialog shows. */
async function forgetSignInConfirmation() {
  const id = (await evaluate(async () => {
    const response = await fetch("/api/auth/get-session");
    return response.ok ? ((await response.json())?.session?.id ?? "") : "";
  })) as string;
  if (id) {
    sql(
      `delete from verification where identifier like ${q(`qrdx-confirmed-%${id}`)}`,
    );
  }
}

const CONFIRM = "Confirm it's you";
const confirmAsked = (timeout = 10_000) =>
  waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
    args: [CONFIRM] as never[],
    timeout,
  }).then(
    () => true,
    () => false,
  );

/** "Confirm it's you" with an emailed code; returns what the dialog said. */
async function confirmByEmail(email: string, shotName?: string) {
  if (!(await confirmAsked(20_000))) throw new Error(`${CONFIRM} didn't open`);
  const asked = (await evaluate(
    (t: string) =>
      // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
      (window.__e2e.byRole("dialog", t) as HTMLElement | null)?.innerText ?? "",
    CONFIRM,
  )) as string;
  if (shotName) await shot(shotName);
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
  const code = await waitForCode("confirmation", email, since);
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

/** "Sign in with SSO" on /sign-in, then the mock IdP signs in as `email`. */
async function ssoSignIn(email: string) {
  await cdp.send("Network.clearBrowserCookies");
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
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Continue", { exact: true }) as HTMLElement,
    ),
  );
  await sleep(2500);
  console.log(`    (at ${(await href()).split("?")[0]})`);
  await idpSignIn(email);
}

/** At the mock IdP's page: sign in as `email`. */
async function idpSignIn(email: string) {
  await waitFor(() => Boolean(window.__e2e.byLabel("Sign in as")), {
    timeout: 20_000,
  });
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
const sessionsOf = (email: string) =>
  Number(
    sql(
      `select count(*) from session where user_id=${q(userId(email))} and expires_at > ${NOW}`,
    ),
  );
/** The browser's session as the app sees it (null when signed out). */
const browserSession = () =>
  evaluate(async () => {
    const response = await fetch("/api/auth/get-session");
    return response.ok ? await response.json() : "error";
  }) as Promise<{
    session: { id: string; expiresAt: string };
    user: { email: string };
  } | null>;
// The columns are timestamps without a time zone, written in UTC; psql's
// now() is in the server's zone.
const NOW = "(now() at time zone 'utc')";
/** Hours from now until the session ends, from the database. */
const hoursLeft = (sessionId: string) =>
  Number(
    sql(
      `select extract(epoch from (expires_at - ${NOW})) / 3600 from session where id=${q(sessionId)}`,
    ),
  );
const markerOf = (sessionId: string) =>
  sql(
    `select value from verification where identifier=${q(`qrdx-sso-session-${sessionId}`)} and expires_at > ${NOW}`,
  );

// ---- the authenticator app (RFC 6238) ----
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

/** Turns on two-step verification with an authenticator app, in Settings. */
async function turnOnTwoFactor(email: string): Promise<string> {
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

/** The "Require single sign-on for <domain>" switch's state, or null. */
const requireSwitch = () =>
  evaluate((domain: string) => {
    const el = window.__e2e.byLabel(`Require single sign-on for ${domain}`);
    if (!el) return null;
    return {
      checked: el.getAttribute("aria-checked") === "true",
      disabled: (el as HTMLButtonElement).disabled,
    };
  }, DOMAIN) as Promise<{ checked: boolean; disabled: boolean } | null>;

const clickRequireSwitch = () =>
  evaluate((domain: string) => {
    const el = window.__e2e.byLabel(`Require single sign-on for ${domain}`);
    if (el) window.__e2e.click(el);
  }, DOMAIN);

/** The panel's email step: type `email`, then "Email me a code". */
async function typeEmail(email: string) {
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  await waitFor(() => Boolean(window.__e2e.byLabel("Email address")));
  await evaluate((e: string) => {
    window.__e2e.setValue(
      window.__e2e.byLabel("Email address") as HTMLElement,
      e,
    );
    window.__e2e.click(
      window.__e2e.byRole("button", "Email me a code", {
        exact: true,
      }) as HTMLElement,
    );
  }, email);
}

// A step that never returns (a page that never answers) ends the run.
const hardStop = setTimeout(async () => {
  console.error("  ✗ run timed out after 8 minutes");
  if (SHOTS) await shot("zz-timeout").catch(() => {});
  await browser.close();
  process.exit(1);
}, 8 * 60_000);

try {
  // ---- people ----
  const owner = `owner-${RUN}@${DOMAIN}`; // the workspace's owner, at the domain
  const admin = `admin@${DOMAIN}`;
  const ana = `ana@${DOMAIN}`;
  const ben = `ben@${DOMAIN}`;
  const zed = `zed-${RUN}@other.test`;

  for (const email of [zed, ana, admin]) {
    const reply = await emailSignIn(email);
    if (reply.status !== 200)
      throw new Error(`sign in ${email}: ${reply.status}`);
  }
  await emailSignIn(owner);
  const ownerId = userId(owner);
  const slug = sql(
    `select o.slug from organization o join member m on m.organization_id=o.id where m.user_id=${q(ownerId)} and m.role='owner' limit 1`,
  );
  const orgId = sql(`select id from organization where slug=${q(slug)}`);
  sql(
    `insert into subscription (id, created_at, amount, currency, recurring_interval, status, current_period_start, current_period_end, started_at, customer_id, product_id, checkout_id, user_id) values ('sub-${RUN}', now(), 1500, 'usd', 'month', 'active', now(), now() + interval '30 days', now(), 'cus-${RUN}', 'local-business-monthly', 'chk-${RUN}', ${q(ownerId)})`,
  );
  sql(
    `insert into member (id, organization_id, user_id, role, created_at) values ('m-admin-${RUN}', ${q(orgId)}, ${q(userId(admin))}, 'admin', now()), ('m-ana-${RUN}', ${q(orgId)}, ${q(userId(ana))}, 'member', now())`,
  );
  const page = `${BASE}/dashboard/${slug}/settings/sso`;

  console.log("set up and verify an OIDC connection");
  await goto(page, { wait: 3000 });
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
  await confirmByEmail(owner);
  await waitText(`Verify ${DOMAIN}`);
  const providerId = sql(
    `select provider_id from sso_provider where organization_id=${q(orgId)}`,
  );
  check("Unverified: no Require card yet", (await requireSwitch()) === null);
  const token = (await evaluate(() => {
    const label = [...document.querySelectorAll("div")].find(
      (el) => el.textContent === "Value" && el.children.length === 0,
    );
    return label?.nextElementSibling?.querySelector("code")?.textContent ?? "";
  })) as string;
  writeFileSync(
    DNS_FILE,
    JSON.stringify({ [`_qrdx-${providerId}.${DOMAIN}`]: [token] }),
  );
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Verify", { exact: true }) as HTMLElement,
    ),
  );
  await waitText("Verified");
  check(
    "Verified through DNS",
    sql(
      `select domain_verified from sso_provider where provider_id=${q(providerId)}`,
    ) === "t",
  );

  console.log("sessions before it's required");
  const anaCodeSessions = sessionsOf(ana);
  await ssoSignIn(ben);
  const benSession = await browserSession();
  check(
    "Ben signs in with SSO (not required yet)",
    benSession?.user?.email === ben,
  );
  const benSessionId = benSession?.session?.id ?? "";
  check(
    "His SSO session is marked, and lasts Better Auth's usual 7 days",
    markerOf(benSessionId).includes(providerId) &&
      hoursLeft(benSessionId) > 24 * 6,
    `${hoursLeft(benSessionId).toFixed(1)} h`,
  );
  check("Ana has an email-code session", anaCodeSessions >= 1);

  console.log("an admin at the domain who signed in by code");
  await emailSignIn(admin);
  await goto(page, { wait: 3000 });
  await waitText("Require single sign-on");
  const adminSwitch = await requireSwitch();
  check(
    "Admin: the switch is off and can't be turned on",
    adminSwitch?.checked === false && adminSwitch.disabled === true,
    JSON.stringify(adminSwitch),
  );
  check(
    "Admin: says to sign in with single sign-on first",
    (await text()).includes("then sign in with single sign-on"),
  );
  await shot("01-admin-signed-in-by-code");

  console.log("the owner turns it on");
  await emailSignIn(owner);
  const ownerSessionsBefore = sessionsOf(owner);
  await goto(page, { wait: 3000 });
  await waitText("Require single sign-on");
  check(
    "Owner: the switch is off and can be turned on",
    JSON.stringify(await requireSwitch()) ===
      JSON.stringify({ checked: false, disabled: false }),
  );
  await shot("02-require-off");
  await clickRequireSwitch();
  await waitFor(() => Boolean(document.querySelector('[role="alertdialog"]')));
  await sleep(400);
  const dialogText = (await evaluate(
    () =>
      // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
      document.querySelector<HTMLElement>('[role="alertdialog"]')?.innerText ??
      "",
  )) as string;
  check(
    "Asks first, saying who's signed out",
    dialogText.includes(`Require single sign-on for ${DOMAIN}?`) &&
      dialogText.includes("apart from this workspace's owners"),
    dialogText.replace(/\s+/g, " ").slice(0, 200),
  );
  await shot("03-require-dialog");
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Require single sign-on", {
        exact: true,
        root: document.querySelector('[role="alertdialog"]') ?? document,
      }) as HTMLElement,
    ),
  );
  const asked = await confirmByEmail(owner, "04-require-confirm");
  check(
    "Then asks to confirm it's you",
    asked.includes("Before you change single sign-on"),
    asked.replace(/\s+/g, " ").slice(0, 120),
  );
  await waitText(`Single sign-on is required for ${DOMAIN}`);
  await sleep(1500);
  check(
    "Saved with the connection's id",
    sql(`select metadata from organization where id=${q(orgId)}`).includes(
      `"ssoRequired":"${providerId}"`,
    ),
  );
  check("The switch is on", (await requireSwitch())?.checked === true);
  check(
    "The connection card says SSO only",
    (await text()).includes(`People at ${DOMAIN} sign in with OIDC only.`),
  );
  await shot("05-require-on");
  check("Ana's email-code sessions are signed out", sessionsOf(ana) === 0);
  check(
    "The admin's email-code sessions are signed out",
    sessionsOf(admin) === 0,
  );
  check("Ben's SSO session is kept", sessionsOf(ben) === 1);
  check(
    "…and now ends 24 hours after his sign-in",
    hoursLeft(benSessionId) <= 24 && hoursLeft(benSessionId) > 23,
    `${hoursLeft(benSessionId).toFixed(2)} h`,
  );
  check(
    "The owner's sessions are kept (break-glass)",
    sessionsOf(owner) === ownerSessionsBefore,
    `${ownerSessionsBefore} → ${sessionsOf(owner)}`,
  );
  check("Other domains are left alone", sessionsOf(zed) >= 1);

  console.log("signing in while it's required");
  await typeEmail(ana);
  await waitText("Your company requires single sign-on.");
  check(
    "The email step says it's required, with Continue with SSO and the code",
    (await text()).includes("Continue with SSO") &&
      ((await evaluate(() =>
        Boolean(
          window.__e2e.byRole("button", "Email me a code", { exact: true }),
        ),
      )) as boolean),
  );
  await shot("06-offer-required");
  const since = statSync(DEV_LOG).size;
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Email me a code", {
        exact: true,
      }) as HTMLElement,
    ),
  );
  await waitText("Check your email");
  const code = await waitForCode("sign-in", ana, since);
  await evaluate((c: string) => {
    const input = document.querySelector(
      "[data-input-otp]",
    ) as HTMLInputElement | null;
    if (input) {
      input.focus();
      window.__e2e.setValue(input, c);
    }
  }, code);
  await waitText("Your company requires single sign-on for this address");
  check(
    "A code sign-in is refused, back to SSO, without the code",
    (await text()).includes("Continue with SSO") &&
      !(await evaluate(() =>
        Boolean(
          window.__e2e.byRole("button", "Email me a code", { exact: true }),
        ),
      )),
  );
  check("No session for Ana", sessionsOf(ana) === 0);
  await shot("07-code-refused");

  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Continue with SSO", {
        exact: true,
      }) as HTMLElement,
    ),
  );
  await sleep(2500);
  await idpSignIn(ana);
  const anaSession = await browserSession();
  check(
    "Continue with SSO signs her in",
    anaSession?.user?.email === ana,
    await href(),
  );
  const anaSessionId = anaSession?.session?.id ?? "";
  check(
    "…for 24 hours at most, marked as SSO",
    hoursLeft(anaSessionId) <= 24 &&
      hoursLeft(anaSessionId) > 23.9 &&
      markerOf(anaSessionId).includes(providerId),
    `${hoursLeft(anaSessionId).toFixed(2)} h`,
  );

  console.log("her email can't move off the domain");
  await goto(`${BASE}/settings/account`, { wait: 3000 });
  await evaluate(() => {
    const button = window.__e2e.byRole("button", "Change", { exact: true });
    if (button) window.__e2e.click(button);
  });
  await waitFor(() => Boolean(window.__e2e.byLabel("New email")));
  await evaluate(() => {
    const e = window.__e2e;
    e.setValue(e.byLabel("New email") as HTMLElement, "ana@elsewhere.test");
    e.click(e.byRole("button", "Send code", { exact: true }) as HTMLElement);
  });
  await waitText("so your account can't move to an address elsewhere");
  check("Refused before Confirm it's you", !(await confirmAsked(500)));
  await shot("08-email-change-refused");

  console.log("the owner keeps a code");
  check(
    "The owner signs in with an email code",
    (await emailSignIn(owner)).status === 200,
  );
  check(
    "…and reading the session keeps it",
    (await browserSession())?.user?.email === owner,
  );

  console.log("metadata over HTTP");
  const overHttp = (await evaluate(async (organizationId: string) => {
    const r = await fetch("/api/auth/organization/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId, data: { metadata: {} } }),
    });
    return r.status;
  }, orgId)) as number;
  check(
    "Changing workspace metadata over HTTP is refused",
    overHttp === 403 &&
      sql(`select metadata from organization where id=${q(orgId)}`).includes(
        `"ssoRequired":"${providerId}"`,
      ),
    String(overHttp),
  );

  console.log("Google or GitHub's refusal on /sign-in");
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in?next=%2Fdashboard&via=google&error=sso_required`);
  await waitText("Your company requires single sign-on for this address");
  check(
    "Says why, with Sign in with SSO below",
    (await text()).includes("Sign in with SSO"),
  );
  await shot("09-social-refused");

  console.log("two-step verification after SSO");
  await ssoSignIn(ben);
  check(
    "Ben signs in again with SSO",
    (await browserSession())?.user?.email === ben,
  );
  // The sign-in itself counts as "Confirm it's you"; end that, so the dialog
  // (an emailed code) shows like for any later change.
  await forgetSignInConfirmation();
  const secret = await turnOnTwoFactor(ben);
  check("Two-step verification on for Ben", Boolean(secret));
  const benAfterSetup = await browserSession();
  check(
    "Turning it on keeps his SSO session (the swap carries the marker)",
    benAfterSetup?.user?.email === ben &&
      markerOf(benAfterSetup.session.id).includes(providerId),
  );
  await ssoSignIn(ben);
  check(
    "The second step is still asked after SSO",
    (await href()).startsWith(`${BASE}/sign-in/two-factor`) &&
      (await browserSession()) === null,
    await href(),
  );
  await shot("10-second-step-after-sso");
  const totp = await freshTotp(secret);
  await evaluate((c: string) => {
    const field = window.__e2e.byLabel("Authenticator code");
    if (field) {
      field.focus();
      window.__e2e.setValue(field, c);
    }
  }, totp);
  await waitFor(() => location.pathname.startsWith("/dashboard"), {
    timeout: 20_000,
  });
  const benTwoStep = await browserSession();
  check(
    "…and the session it makes counts as SSO, 24 hours at most",
    benTwoStep?.user?.email === ben &&
      markerOf(benTwoStep.session.id).includes(providerId) &&
      hoursLeft(benTwoStep.session.id) <= 24,
  );

  console.log("24 hours on");
  sql(
    `update verification set expires_at = ${NOW} - interval '1 minute' where identifier=${q(`qrdx-sso-session-${benTwoStep?.session.id}`)}`,
  );
  await goto(`${BASE}/dashboard/${slug}`, { wait: 3000 });
  check(
    "Once the 24 hours are up, the session ends and the app asks to sign in",
    (await href()).startsWith(`${BASE}/sign-in`) &&
      sql(
        `select count(*) from session where id=${q(benTwoStep?.session.id ?? "")}`,
      ) === "0",
    await href(),
  );

  console.log("turning it off");
  await emailSignIn(owner);
  await goto(page, { wait: 3000 });
  await waitText("Require single sign-on");
  await clickRequireSwitch();
  await confirmByEmail(owner);
  await waitText(`Single sign-on is no longer required for ${DOMAIN}`);
  await sleep(1500);
  check(
    "Off: the setting is gone, the join role stays as it was",
    !sql(
      `select coalesce(metadata, '') from organization where id=${q(orgId)}`,
    ).includes("ssoRequired"),
  );
  check(
    "Email codes work again for the domain",
    (await emailSignIn(ana)).status === 200,
  );
} catch (error) {
  failures++;
  console.error("  ✗ run stopped:", error);
  if (SHOTS) await shot("zz-failure").catch(() => {});
} finally {
  clearTimeout(hardStop);
  await browser.close();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
