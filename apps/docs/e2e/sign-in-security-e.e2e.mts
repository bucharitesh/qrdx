// Round 2, lane E, end to end against a running dev server and a THROWAWAY
// local database, over the Chrome DevTools Protocol:
//
//   cap       a session ends 30 days after its sign-in: the refresh stops at
//             the cap, a session at the cap isn't rewritten on every request,
//             and one past it is refused (row and cookie gone) even though
//             its row says it's still valid
//   oauth     Authorize on the consent screen asks "Confirm it's you" (a
//             sign-in just now counts), and the endpoint refuses an approval
//             posted without one
//   webhooks  showing and rotating a webhook's signing secret ask too
//   reset     support's turn-off of two-step verification waits: the admin
//             confirms with their second step, the address is told the day,
//             the person sees it in Settings and cancels it there; a sign-in
//             with the second step cancels it; support can cancel it; one
//             left due is ready for the daily cron (run separately, below)
//
// It writes to the database (test users, an OAuth app, a webhook endpoint,
// the admin's two-step verification), so it refuses to run unless
// DATABASE_URL in .env.local points at localhost.
//
// Support's turn-off is only scheduled once its notice went out. A dev
// server only writes the notice to its log, and that counts only when the
// server was started with QRDX_DISPOSABLE_DB=1, which says its database is a
// throwaway one (lib/account/two-factor-notice.ts). Set it only for such a
// database, never for one reached through a proxy or tunnel to a shared one:
//
//   QRDX_DISPOSABLE_DB=1 pnpm exec next dev -p <port> > <dev.log>
//   E_E2E_BASE_URL=http://localhost:<port> E_E2E_DEV_LOG=<dev.log> \
//   E_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   E_E2E_SHOTS=<dir> pnpm exec tsx e2e/sign-in-security-e.e2e.mts
//
// The daily cron only runs where outbound delivery is on, so completing the
// reset it leaves due takes the dev server restarted with
// QRDX_ALLOW_DEV_DELIVERY=1 and GET /api/cron/webhooks; the last line of
// output says which account to check.
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cspEnforced, launch, recordCspViolations, sleep } from "./cdp.mjs";

const env = (name: string) => process.env[`E_E2E_${name}`] ?? "";
const BASE = env("BASE_URL").replace(/\/$/, "");
const DEV_LOG = env("DEV_LOG");
const PSQL = env("PSQL");
const SHOTS = env("SHOTS");
const RUN = Date.now().toString(36);
const ADA = `ada-${RUN}@qrdx.test`;
const BOB = `bob-${RUN}@qrdx.test`;
const ADMIN = "admin@qrdx.test";
const CALLBACK = `${BASE}/e2e-oauth-callback`;

for (const [name, value] of Object.entries({
  BASE_URL: BASE,
  DEV_LOG,
  PSQL,
})) {
  if (!value) throw new Error(`Set E_E2E_${name}`);
}
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
const userId = (email: string) =>
  sql(`select id from "user" where email=${q(email)}`);

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ─── TOTP (RFC 6238), to act as the authenticator app ───────────────────────

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
  const offset = hash[hash.length - 1] & 15;
  const binary = hash.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

// ─── The browser ────────────────────────────────────────────────────────────

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const browser = await launch(DESKTOP);
const { cdp, evaluate, goto, waitFor } = browser;
await cdp.send("Network.enable");
const csp = await recordCspViolations(browser);
const cspOn = await cspEnforced(BASE);

async function viewport(size: { width: number; height: number }) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    ...size,
    deviceScaleFactor: size === PHONE ? 2 : 1,
    mobile: size === PHONE,
  });
  await sleep(500);
}

/** The screen in light and dark, at desktop and phone widths. */
async function shot(name: string, scrollTo?: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  for (const [width, size] of [
    ["desktop", DESKTOP],
    ["phone", PHONE],
  ] as const) {
    await viewport(size);
    if (scrollTo) {
      await evaluate((id: string) => {
        document.getElementById(id)?.scrollIntoView({ block: "start" });
      }, scrollTo);
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
      await sleep(350);
      const captured = (await Promise.race([
        cdp.send("Page.captureScreenshot", { format: "png" }),
        sleep(15_000).then(() => null),
      ])) as { data: string } | null;
      if (!captured) {
        console.log(`  (screenshot ${name}-${width}-${scheme} timed out)`);
        continue;
      }
      writeFileSync(
        join(SHOTS, `${name}-${width}-${scheme}.png`),
        Buffer.from(captured.data, "base64"),
      );
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
async function dismissCookieBanner() {
  await evaluate(() => {
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
      return;
    }
    const reject = window.__e2e.byRole("button", "Reject all", { exact: true });
    if (reject) window.__e2e.click(reject);
  });
  await sleep(300);
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
/** A real mouse click (Radix menus ignore synthetic ones). */
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
async function fill(label: string, value: string) {
  await waitFor(
    (l: string, v: string) => {
      const el = window.__e2e.byLabel(l) as HTMLInputElement | null;
      if (!el || el.disabled) return false;
      el.focus();
      window.__e2e.setValue(el, v);
      return true;
    },
    { args: [label, value] as never[] },
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
const noticeLine = (email: string, text: string) =>
  new RegExp(
    `security notice for ${escapeRegExp(email)}: ${escapeRegExp(text)}`,
  );

async function sessionUser(): Promise<string | null> {
  return evaluate(async () => {
    const r = await fetch("/api/auth/get-session", { cache: "no-store" });
    const body = await r.json().catch(() => null);
    return body?.user?.email ?? null;
  }) as Promise<string | null>;
}

/**
 * Email-code sign-in through the same endpoints the panel calls, and the
 * second step with a backup code when the account asks for one.
 */
async function signIn(email: string, backupCode?: string) {
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
  const reply = (await evaluate(
    async (e: string, otp: string) => {
      const r = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, otp }),
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    email,
    found[1],
  )) as { status: number; body: { twoFactorRedirect?: boolean } | null };
  if (reply.status !== 200) throw new Error(`sign in ${reply.status}`);
  if (reply.body?.twoFactorRedirect) {
    if (!backupCode) throw new Error(`${email} asks for a second step`);
    const step = await evaluate(async (code: string) => {
      const r = await fetch("/api/auth/two-factor/verify-backup-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      return r.status;
    }, backupCode);
    if (step !== 200) throw new Error(`second step ${step}`);
  }
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
const confirmAsked = (timeout = 15_000) =>
  waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
    args: [CONFIRM] as never[],
    timeout,
  }).then(
    () => true,
    () => false,
  );
const dialogText = () =>
  evaluate(
    (t: string) =>
      // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
      (window.__e2e.byRole("dialog", t) as HTMLElement | null)?.innerText ?? "",
    CONFIRM,
  ) as Promise<string>;
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

/** The dialog opened for `action`: checked, shot, left open. */
async function asked(action: string, shotName: string | null) {
  const open = await confirmAsked();
  if (open) {
    await waitFor(
      (t: string) =>
        !/Loading/.test(window.__e2e.byRole("dialog", t)?.textContent ?? ""),
      { args: [CONFIRM] as never[] },
    ).catch(() => null);
    await sleep(300);
  }
  const body = open ? await dialogText() : "";
  check(
    `"${CONFIRM}" asks before you ${action}`,
    open && body.includes(`Before you ${action}, we need to check it's you.`),
    body.replace(/\s+/g, " ").slice(0, 140),
  );
  if (open && shotName) await shot(shotName);
  return open;
}

/** Answers it with a code emailed to the account (two-step off). */
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

/** Answers it with a backup code (two-step on). */
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

/** As if 10 minutes had passed: the account's confirmations are gone. */
const forgetConfirmations = (email: string) =>
  sql(
    `delete from verification where identifier like 'qrdx-confirmed-%' and value=${q(userId(email))}`,
  );

// ─── Two-step verification on, through Settings ─────────────────────────────

/** Turns it on with the authenticator app; returns the backup codes. */
async function turnOnTwoFactor(email: string): Promise<string[]> {
  await goto(`${BASE}/settings/account#two-factor`);
  await waitText("Two-step verification");
  await dismissCookieBanner();
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
  // With passkeys available, the first step asks which method.
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

// ─── cap: 30 days after the sign-in ─────────────────────────────────────────

async function capFlow() {
  console.log("cap");
  await signIn(BOB);
  const bob = userId(BOB);
  const sessionId = sql(
    `select id from session where user_id=${q(bob)} order by created_at desc limit 1`,
  );
  // 26 days in, last refreshed 2 days ago: the refresh stops at day 30.
  sql(
    `update session set created_at = now() - interval '26 days', updated_at = now() - interval '2 days', expires_at = now() + interval '1 day' where id=${q(sessionId)}`,
  );
  await goto(`${BASE}/settings/account`);
  check("still signed in at day 26", (await sessionUser()) === BOB);
  const days = Number(
    sql(
      `select round(extract(epoch from (expires_at - created_at)) / 86400, 3) from session where id=${q(sessionId)}`,
    ),
  );
  check(
    "the refresh moved the expiry to exactly 30 days after sign-in",
    days === 30,
    `${days} days`,
  );

  // At the cap: further requests don't rewrite the row.
  const before = sql(`select updated_at from session where id=${q(sessionId)}`);
  await goto(`${BASE}/settings/account`);
  await sessionUser();
  await sessionUser();
  const after = sql(`select updated_at from session where id=${q(sessionId)}`);
  check("no write on every request once at the cap", before === after);

  // Past the cap, though the row says it's valid for days more.
  sql(
    `update session set created_at = now() - interval '31 days', expires_at = now() + interval '5 days' where id=${q(sessionId)}`,
  );
  await goto(`${BASE}/settings/account`);
  await sleep(500);
  const landed = await href();
  check(
    "a session 31 days old is refused: back to sign in",
    landed.includes("/sign-in"),
    landed,
  );
  check(
    "and its row is deleted",
    sql(`select count(*) from session where id=${q(sessionId)}`) === "0",
  );
  check("the browser is signed out", (await sessionUser()) === null);
}

// ─── oauth: Authorize asks ──────────────────────────────────────────────────

async function oauthFlow() {
  console.log("oauth");
  const bob = userId(BOB);
  const clientId = `e2e-client-${RUN}`;
  sql(
    `insert into oauth_app (id, name, description, client_id, client_secret_hash, redirect_uris, scopes, is_active, owner_user_id, verified, pkce_required, created_at, updated_at) values (${q(`app-${RUN}`)}, 'Menu Sync', 'Keeps your menus in sync with QRdx.', ${q(clientId)}, 'not-used', ${q(JSON.stringify([CALLBACK]))}, '["profile:read","codes:read"]', true, ${q(bob)}, false, false, now(), now())`,
  );
  const authorizeUrl = (extra = "") =>
    `${BASE}/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(CALLBACK)}&scope=profile%3Aread%20codes%3Aread&state=s-${RUN}${extra}`;
  const codes = () =>
    Number(
      sql(
        `select count(*) from oauth_authorization_code where app_id=${q(`app-${RUN}`)}`,
      ),
    );

  // Signed in just now: that counts, so Authorize goes straight through.
  await signIn(BOB);
  await goto(authorizeUrl());
  await waitText("Menu Sync wants to access your QRdx account");
  await dismissCookieBanner();
  await clickButton("Authorize");
  await waitFor((c: string) => location.href.startsWith(c), {
    args: [CALLBACK] as never[],
  }).catch(() => null);
  let landed = await href();
  check(
    "after a sign-in just now, Authorize goes straight to the app",
    landed.startsWith(CALLBACK) &&
      new URL(landed).searchParams.has("code") &&
      new URL(landed).searchParams.get("state") === `s-${RUN}`,
    landed.slice(0, 90),
  );

  // Ten minutes later: Authorize asks.
  forgetConfirmations(BOB);
  const before = codes();
  await goto(authorizeUrl("&prompt=consent"));
  await waitText("Menu Sync wants to access your QRdx account");
  await clickButton("Authorize");
  const open = await asked("let this app use your account", "oauth-confirm");
  check("no code yet", codes() === before);
  if (open) {
    await confirmByEmail(BOB);
    await waitFor((c: string) => location.href.startsWith(c), {
      args: [CALLBACK] as never[],
    }).catch(() => null);
    landed = await href();
    check(
      "after confirming, Authorize goes to the app with a code",
      landed.startsWith(CALLBACK) && new URL(landed).searchParams.has("code"),
      landed.slice(0, 90),
    );
  }

  // Closing the dialog changes nothing.
  forgetConfirmations(BOB);
  await goto(authorizeUrl("&prompt=consent"));
  await waitText("Menu Sync wants to access your QRdx account");
  const count = codes();
  await clickButton("Authorize");
  if (await confirmAsked()) {
    await clickInConfirm("Close");
    await confirmClosed();
  }
  await sleep(500);
  check(
    "closing the dialog stays on the consent screen, no code",
    (await href()).includes("/oauth/authorize") && codes() === count,
  );
  check(
    "and Authorize works again",
    await evaluate(
      () =>
        !(
          window.__e2e.byRole("button", "Authorize", {
            exact: true,
          }) as HTMLButtonElement | null
        )?.disabled,
    ),
  );

  // A post that skips the page's button gets no code either.
  const posted = (await evaluate(
    async (fields: Record<string, string>) => {
      const r = await fetch("/api/oauth/authorize", {
        method: "POST",
        body: new URLSearchParams(fields),
      });
      return r.url;
    },
    {
      response_type: "code",
      client_id: clientId,
      redirect_uri: CALLBACK,
      scope: "profile:read codes:read",
      state: `s-${RUN}`,
      decision: "allow",
    },
  )) as string;
  check(
    "an approval posted without a confirmation goes back to the consent page",
    posted.includes("/oauth/authorize?") && codes() === count,
    posted.slice(0, 90),
  );
}

// ─── webhooks: the signing secret asks ──────────────────────────────────────

async function webhooksFlow() {
  console.log("webhooks");
  const bob = userId(BOB);
  const [orgId, slug] = sql(
    `select o.id, o.slug from organization o join member m on m.organization_id = o.id where m.user_id=${q(bob)} and m.role='owner' order by o.created_at limit 1`,
  ).split("|");
  const endpointId = `wh-${RUN}`;
  const secret = `whsec_e2e${RUN}0123456789abcdef`;
  sql(
    `insert into webhook_endpoint (id, user_id, organization_id, url, secret, events, active, created_at) values (${q(endpointId)}, ${q(bob)}, ${q(orgId)}, 'https://example.com/qrdx-e2e-hook', ${q(secret)}, '["code.created"]', false, now())`,
  );

  forgetConfirmations(BOB);
  await goto(`${BASE}/dashboard/${slug}/settings/webhooks`);
  await waitText("https://example.com/qrdx-e2e-hook");
  await dismissCookieBanner();
  await mouseClick(
    `() => window.__e2e.byRole("button", "Endpoint actions", { exact: true })`,
  );
  await waitFor(() =>
    Boolean(window.__e2e.byRole("menuitem", "Signing secret")),
  );
  await mouseClick(`() => window.__e2e.byRole("menuitem", "Signing secret")`);
  const open = await asked("show a signing secret", "webhook-reveal-confirm");
  if (open) {
    await confirmByEmail(BOB);
    // In the dialog's read-only field.
    check(
      "after confirming, the secret is shown",
      await waitFor(
        (s: string) =>
          (
            window.__e2e.byLabel(
              "Signing secret",
              window.__e2e.byRole("dialog", "Signing secret") ?? document,
            ) as HTMLInputElement | null
          )?.value === s,
        { args: [secret] as never[] },
      ).then(
        () => true,
        () => false,
      ),
    );
  }

  // The deliveries page: Rotate asks, then Reveal doesn't (10 minutes).
  forgetConfirmations(BOB);
  await goto(`${BASE}/dashboard/${slug}/settings/webhooks/${endpointId}`);
  await waitText("Signing secret");
  await clickButton("Rotate");
  await waitText("Rotate the signing secret?");
  await clickButton("Rotate secret");
  const rotateAsked = await asked(
    "make a new signing secret",
    "webhook-rotate-confirm",
  );
  check(
    "the secret isn't rotated before confirming",
    sql(`select secret from webhook_endpoint where id=${q(endpointId)}`) ===
      secret,
  );
  if (rotateAsked) {
    await confirmByEmail(BOB);
    await waitText("New secret created");
    const rotated = sql(
      `select secret from webhook_endpoint where id=${q(endpointId)}`,
    );
    check(
      "after confirming, it's rotated and shown",
      rotated !== secret &&
        (await evaluate(
          (s: string) =>
            (window.__e2e.byLabel("Signing secret") as HTMLInputElement | null)
              ?.value === s,
          rotated,
        )),
    );
    await shot("webhook-rotated");
  }
  // Delete it so no worker run ever tries to deliver to it.
  sql(`delete from webhook_endpoint where id=${q(endpointId)}`);
}

// ─── reset: support's turn-off waits ────────────────────────────────────────

async function resetFlow() {
  console.log("reset");
  // A clean admin: two-step verification off (this database only).
  const admin = userId(ADMIN) || null;
  if (admin) {
    sql(
      `delete from two_factor where user_id=${q(admin)}; update "user" set two_factor_enabled=false where id=${q(admin)}; delete from session where user_id=${q(admin)}`,
    );
  }
  await signIn(ADMIN);
  const adminCodes = await turnOnTwoFactor(ADMIN);
  check("the admin has two-step verification on", adminCodes.length === 10);
  const adminCookies = await saveCookies();

  await signIn(ADA);
  const adaCodes = await turnOnTwoFactor(ADA);
  check("Ada has two-step verification on", adaCodes.length === 10);
  const ada = userId(ADA);
  const adaCookies = await saveCookies();
  const pending = () =>
    sql(
      `select value from verification where identifier=${q(`qrdx-2fa-reset-${ada}`)}`,
    );

  /** As the admin, on Ada's page: Turn off → reason → Turn off in 7 days. */
  async function schedule({
    confirm,
    shotPrefix,
  }: {
    confirm?: string;
    shotPrefix?: string;
  } = {}) {
    await restoreCookies(adminCookies);
    await goto(`${BASE}/admin/users/${ada}`);
    await waitText("Sign-in methods");
    await dismissCookieBanner();
    await evaluate(() =>
      document.getElementById("sign-in")?.scrollIntoView({ block: "start" }),
    );
    if (shotPrefix) await shot(`${shotPrefix}-before`, "sign-in");
    await clickButton("Turn off", "#sign-in");
    await waitText("Turn off two-step verification");
    await evaluate(() => {
      const box = document.querySelector(
        '[role="dialog"] textarea',
      ) as HTMLTextAreaElement | null;
      if (box) {
        window.__e2e.setValue(
          box,
          "E2E: lost phone and backup codes, wrote from the account address",
        );
      }
    });
    if (shotPrefix) await shot(`${shotPrefix}-dialog`);
    const since = logSize();
    await clickButton("Turn off in 7 days", '[role="dialog"]');
    if (confirm) {
      const open = await asked("make this change for someone", null);
      if (open) await confirmByBackupCode(confirm);
    }
    if (
      !(await waitText("Reset scheduled")) &&
      (await waitText("doesn't send email", 2_000))
    ) {
      check(
        "support can schedule the reset",
        false,
        "the dev server doesn't count the logged notice: start it with QRDX_DISPOSABLE_DB=1 (a throwaway database only)",
      );
    }
    return since;
  }

  // The admin's sign-in answered a second step… on another device's
  // session; this one confirmed by email only, so the action asks.
  forgetConfirmations(ADMIN);
  const since = await schedule({
    confirm: adminCodes[0],
    shotPrefix: "admin-reset",
  });
  const record = pending();
  check("a reset is waiting", record.includes('"dueAt"'), record.slice(0, 80));
  const dueAt = (JSON.parse(record || "{}") as { dueAt?: string }).dueAt ?? "";
  const wait = Date.parse(dueAt) - Date.now();
  check(
    "due at the start of a UTC day 7 to 8 days on",
    wait >= 7 * 86_400_000 - 60_000 &&
      wait < 8 * 86_400_000 &&
      dueAt.endsWith("T00:00:00.000Z"),
    dueAt,
  );
  const dueDay = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(dueAt));
  check(
    "the address is told the day",
    Boolean(
      await logLine(
        noticeLine(
          ADA,
          `support will turn off two-step verification, on ${dueDay}`,
        ),
        since,
      ),
    ),
  );
  check(
    "nothing changed yet: still on, sessions kept",
    sql(`select two_factor_enabled from "user" where id=${q(ada)}`) === "t" &&
      Number(sql(`select count(*) from session where user_id=${q(ada)}`)) > 0,
  );
  await goto(`${BASE}/admin/users/${ada}`);
  check(
    "the admin page shows it waiting, with the day",
    await waitText(`turns off ${dueAt.slice(0, 10)}`),
  );
  await evaluate(() =>
    document.getElementById("sign-in")?.scrollIntoView({ block: "start" }),
  );
  await shot("admin-reset-pending", "sign-in");
  check("the audit trail has it", await waitText("user.reset_two_factor"));

  // Ada, already signed in: Settings shows it, and Cancel asks.
  await restoreCookies(adaCookies);
  await goto(`${BASE}/settings/account#two-factor`);
  check(
    "Settings shows support's turn-off and its day",
    await waitText(`Support will turn this off on ${dueDay}`),
  );
  await evaluate(() =>
    document.getElementById("two-factor")?.scrollIntoView({ block: "start" }),
  );
  await shot("settings-reset-notice", "two-factor");
  forgetConfirmations(ADA);
  let mark = logSize();
  await clickButton("Cancel", "#two-factor");
  const open = await asked(
    "cancel support's turn-off",
    "settings-cancel-confirm",
  );
  if (open) {
    await confirmByBackupCode(adaCodes[0]);
    check(
      "cancelled: the toast says it stays on",
      await waitText("Cancelled. Two-step verification stays on."),
    );
  }
  check(
    "the notice is gone and nothing is waiting",
    (await waitFor(
      // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
      () => !document.body.innerText.includes("Support will turn this off"),
    ).then(
      () => true,
      () => false,
    )) && pending() === "",
  );
  check(
    "the address is told it was cancelled",
    Boolean(
      await logLine(
        noticeLine(
          ADA,
          "support's turn-off of two-step verification cancelled, by person",
        ),
        mark,
      ),
    ),
  );

  // Signing in with the second step cancels it on its own.
  await schedule();
  check("waiting again", pending() !== "");
  mark = logSize();
  await signIn(ADA, adaCodes[1]);
  check("Ada signed in with a backup code", (await sessionUser()) === ADA);
  check("the sign-in cancelled it", pending() === "");
  check(
    "and the address is told why",
    Boolean(
      await logLine(
        noticeLine(
          ADA,
          "support's turn-off of two-step verification cancelled, by sign-in",
        ),
        mark,
      ),
    ),
  );

  // Support can cancel it.
  await schedule();
  check("waiting again", pending() !== "");
  mark = logSize();
  await goto(`${BASE}/admin/users/${ada}`);
  await clickButton("Cancel reset", "#sign-in");
  await waitText("Cancel the reset");
  await evaluate(() => {
    const box = document.querySelector(
      '[role="dialog"] textarea',
    ) as HTMLTextAreaElement | null;
    if (box)
      window.__e2e.setValue(box, "E2E: the owner replied it wasn't them");
  });
  await shot("admin-cancel-dialog");
  await clickButton("Cancel reset", '[role="dialog"]');
  await waitText("Reset cancelled");
  check("support cancelled it", pending() === "");
  check(
    "the address is told support cancelled it",
    Boolean(
      await logLine(
        noticeLine(
          ADA,
          "support's turn-off of two-step verification cancelled, by support",
        ),
        mark,
      ),
    ),
  );

  // One left due for the daily cron (run separately).
  await schedule();
  sql(
    `update verification set value = jsonb_set(value::jsonb, '{dueAt}', '"2026-01-01T00:00:00.000Z"')::text where identifier=${q(`qrdx-2fa-reset-${ada}`)}`,
  );
  check("one is left due for the cron", pending().includes("2026-01-01"));
  return ada;
}

let dueFor = "";
try {
  await capFlow();
  await oauthFlow();
  await webhooksFlow();
  dueFor = await resetFlow();
} catch (error) {
  failures++;
  console.log(`  ✗ stopped: ${error instanceof Error ? error.message : error}`);
  if (SHOTS) {
    const captured = (await cdp.send("Page.captureScreenshot", {
      format: "png",
    })) as { data: string };
    writeFileSync(
      join(SHOTS, "failure.png"),
      Buffer.from(captured.data, "base64"),
    );
  }
} finally {
  await browser.close();
}
const cspResult = csp.result(cspOn);
if (cspResult.skipped) {
  console.log(`  - no CSP violations: skipped (${cspResult.note})`);
} else {
  check("no CSP violations", cspResult.ok, cspResult.lines.join("\n      "));
}
console.log(dueFor ? `due reset: user ${dueFor} (${ADA})` : "");
console.log(failures === 0 ? "ALL PASSED" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
