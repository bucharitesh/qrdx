// Two-step verification's lifecycle and the account's other sessions, end to
// end in headless Chrome against a running dev server and its local database
// (CDP, no Playwright; see ./cdp.mjs). Other devices are cookie jars in this
// process, signing in over HTTP like a browser.
//
//   app       turning it on with the authenticator app signs out the other
//             devices, keeps this browser and its "Confirm it's you" (New
//             codes doesn't ask again), and the dialog, toast and notice say
//             so
//   backup    a backup code that finishes another device's sign-in is
//             emailed with the codes left
//   second    adding a passkey while it's on signs nobody out
//   confirm   a backup code used in "Confirm it's you" is emailed with the
//             count from before the new codes it allowed; using codes down
//             to 2 says so
//   (support's reset: e2e/sign-in-security-e.e2e.mts)
//   passkey   a first passkey turns it on and signs out the other devices;
//             the app step and the passkey step say so beforehand
//   existing  turning it off keeps the passkey ("ready"); turning it on
//             again with that passkey signs out the other devices
//
// It reads sign-in codes and notices from the dev server's log, so it only
// runs against a local dev server whose output goes to E2E_DEV_LOG:
//
//   E2E_BASE_URL=http://localhost:3261 E2E_DEV_LOG=/path/to/dev.log \
//   E2E_SHOTS=/path/to/shots bun x tsx e2e/two-factor-lifecycle.e2e.ts
//
// E2E_DB_SQL='<command that runs SQL on the LOCAL database, reading stdin>'
// is needed for the "Confirm it's you" step. E2E_VIEWPORT=mobile runs it at
// 390 x 844. Accounts are new
// @qrdx.test addresses per run. Skips (exit 0) without a server, a log or
// Chrome.
/** biome-ignore-all lint/performance/useDomNodeTextContent: checks must only match text a person can see */
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cspEnforced,
  findChrome,
  launch,
  recordCspViolations,
  serverIsUp,
  sleep,
} from "./cdp.mjs";

const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const DEV_LOG = process.env.E2E_DEV_LOG ?? "";
const SHOTS = process.env.E2E_SHOTS ?? "";
const MOBILE = process.env.E2E_VIEWPORT === "mobile";
const RUN = Date.now().toString(36);
const APP_EMAIL = `e2e-life-app-${RUN}@qrdx.test`;
const PASSKEY_EMAIL = `e2e-life-passkey-${RUN}@qrdx.test`;
const PREFIX = MOBILE ? "mobile" : "desktop";

type Page = Awaited<ReturnType<typeof launch>>;

let failures = 0;
const results: string[] = [];
const layout: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  results.push(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
  console.log(results.at(-1));
  if (!ok) failures++;
}

// ─── The authenticator app ──────────────────────────────────────────────────

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

function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hash = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(
    6,
    "0",
  );
}

// ─── The dev server's log ───────────────────────────────────────────────────

const logSize = () => statSync(DEV_LOG).size;

async function waitForLogLine(
  pattern: RegExp,
  since: number,
  timeout = 20_000,
): Promise<RegExpMatchArray> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const text = readFileSync(DEV_LOG).subarray(since).toString("utf8");
    const match = text.match(pattern);
    if (match) return match;
    await sleep(250);
  }
  throw new Error(`No log line matching ${pattern}`);
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const noticeLine = (email: string, what: string) =>
  new RegExp(
    `security notice for ${escapeRegExp(email)}: ${escapeRegExp(what)} \\(not emailed`,
  );

// ─── Another device: a cookie jar signing in over HTTP ──────────────────────

class Device {
  private readonly cookies = new Map<string, string>();

  constructor(readonly label: string) {}

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private absorb(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const [name, ...rest] = pair.split("=");
      if (attributes.some((a) => /^\s*max-age=0\s*$/i.test(a))) {
        this.cookies.delete(name.trim());
      } else {
        this.cookies.set(name.trim(), rest.join("="));
      }
    }
  }

  async post(path: string, body: unknown) {
    const response = await fetch(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: {
        origin: BASE_URL,
        "content-type": "application/json",
        cookie: this.cookieHeader(),
        "user-agent": `Mozilla/5.0 (QRdx e2e ${this.label}) Chrome/142.0 Safari/537.36`,
      },
      body: JSON.stringify(body),
      redirect: "manual",
    });
    this.absorb(response);
    const json = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { status: response.status, json };
  }

  /** The signed-in account's email, or null when signed out. */
  async signedInAs(): Promise<string | null> {
    const response = await fetch(`${BASE_URL}/api/auth/get-session`, {
      headers: { origin: BASE_URL, cookie: this.cookieHeader() },
    });
    const json = (await response.json().catch(() => null)) as {
      user?: { email?: string };
    } | null;
    return json?.user?.email ?? null;
  }

  /** Signs in with an email code, then the second step when asked. */
  async signIn(email: string, second?: { backupCode?: string; totp?: string }) {
    const since = logSize();
    await this.post("/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    const [, code] = await waitForLogLine(
      new RegExp(`sign-in code for ${escapeRegExp(email)}: (\\d{6})`),
      since,
    );
    const first = await this.post("/sign-in/email-otp", { email, otp: code });
    if (first.status !== 200) {
      throw new Error(`${this.label}: sign-in refused (${first.status})`);
    }
    if (first.json?.twoFactorRedirect !== true) return;
    if (!second) throw new Error(`${this.label}: asked for a second step`);
    const reply = second.backupCode
      ? await this.post("/two-factor/verify-backup-code", {
          code: second.backupCode,
        })
      : await this.post("/two-factor/verify-totp", { code: second.totp });
    if (reply.status !== 200) {
      throw new Error(`${this.label}: second step refused (${reply.status})`);
    }
  }
}

// ─── Page helpers ───────────────────────────────────────────────────────────

/** On a phone: no horizontal page scroll; tap targets under 40 px listed. */
async function checkMobileLayout(page: Page, name: string) {
  const result = (await page.evaluate(() => {
    const root = document.documentElement;
    const scope =
      document.querySelector('[role="alertdialog"], [role="dialog"]') ??
      document.querySelector("main") ??
      document.body;
    const small = [
      ...scope.querySelectorAll(
        'button, a[href], input:not([type="hidden"]), [role="checkbox"]',
      ),
    ]
      .filter((el) => window.__e2e.visible(el))
      .map((el) => {
        const box = el.getBoundingClientRect();
        const label = (
          el.getAttribute("aria-label") ||
          el.textContent ||
          el.tagName
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40);
        return {
          label,
          w: Math.round(box.width),
          h: Math.round(box.height),
        };
      })
      .filter((t) => t.h < 40 || t.w < 40);
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      small,
    };
  })) as {
    scrollWidth: number;
    clientWidth: number;
    small: { label: string; w: number; h: number }[];
  };
  const fits = result.scrollWidth <= result.clientWidth;
  check(
    `mobile, no horizontal scroll: ${name}`,
    fits,
    `scrollWidth ${result.scrollWidth} / clientWidth ${result.clientWidth}`,
  );
  layout.push(
    `${name}: ${fits ? "OK" : "OVERFLOW"}; small targets: ${
      result.small.length
        ? result.small.map((t) => `"${t.label}" ${t.w}x${t.h}`).join(", ")
        : "none"
    }`,
  );
}

/** Light and dark screenshots of the page as it is. */
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  if (MOBILE) await checkMobileLayout(page, name);
  for (const scheme of ["light", "dark"] as const) {
    await page.cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: "reduce" },
        { name: "prefers-color-scheme", value: scheme },
      ],
    });
    await sleep(400);
    const { data } = (await page.cdp.send("Page.captureScreenshot", {
      format: "png",
    })) as { data: string };
    writeFileSync(
      join(SHOTS, `${PREFIX}-${name}-${scheme}.png`),
      Buffer.from(data, "base64"),
    );
  }
  await page.cdp.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-color-scheme", value: "light" },
    ],
  });
}

async function waitForText(page: Page, text: string, timeout = 20_000) {
  await page.waitFor((t: string) => document.body.innerText.includes(t), {
    args: [text] as never[],
    timeout,
  });
}

const dialogText = (page: Page) =>
  page.evaluate(
    () =>
      (
        document.querySelector(
          '[role="alertdialog"], [role="dialog"]',
        ) as HTMLElement | null
      )?.innerText ?? "",
  ) as Promise<string>;

async function clickButton(page: Page, name: string) {
  await page.waitFor(
    (n: string) => {
      const el =
        window.__e2e.byRole("button", n, { exact: true }) ??
        window.__e2e.byRole("button", n);
      if (!el || (el as HTMLButtonElement).disabled) return false;
      window.__e2e.click(el);
      return true;
    },
    { args: [name] as never[] },
  );
}

/** A button inside the open dialog (the page behind can have the same name). */
async function clickInDialog(page: Page, name: string) {
  await page.waitFor(
    (n: string) => {
      const dialogs = [
        ...document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
      ];
      for (const dialog of dialogs.reverse()) {
        const button = [...dialog.querySelectorAll("button")].find(
          (b) => b.textContent?.trim() === n && !b.disabled,
        );
        if (button) {
          window.__e2e.click(button);
          return true;
        }
      }
      return false;
    },
    { args: [name] as never[] },
  );
}

async function fill(page: Page, label: string, value: string) {
  await page.waitFor(
    (l: string, v: string) => {
      const el = window.__e2e.byLabel(l);
      if (!el || (el as HTMLInputElement).disabled) return false;
      el.focus();
      window.__e2e.setValue(el, v);
      return true;
    },
    { args: [label, value] as never[] },
  );
}

async function session(page: Page): Promise<{ user?: { id: string } } | null> {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/get-session", {
      credentials: "include",
    });
    return response.ok ? response.json() : null;
  });
}

async function landedOn(page: Page, path: string, timeout = 30_000) {
  await page.waitFor((p: string) => location.pathname.startsWith(p), {
    args: [path] as never[],
    timeout,
  });
}

/** A signed-out browser, from a blank page. */
async function leaveSignedIn(page: Page) {
  await page.goto("about:blank", { wait: 200 });
  await page.cdp.send("Network.clearBrowserCookies");
}

async function rejectCookies(page: Page) {
  await page.evaluate(() => {
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
      return;
    }
    const button = window.__e2e.byRole("button", "Reject all", { exact: true });
    if (button) window.__e2e.click(button);
  });
}

/** /sign-in → email → code. Returns once the code was entered. */
async function emailCodeStep(page: Page, email: string, next = "/dashboard") {
  await page.goto(`${BASE_URL}/sign-in?next=${encodeURIComponent(next)}`);
  await waitForText(page, "Email me a code");
  await rejectCookies(page);
  const since = logSize();
  await fill(page, "Email address", email);
  await clickButton(page, "Email me a code");
  const [, code] = await waitForLogLine(
    new RegExp(`sign-in code for ${escapeRegExp(email)}: (\\d{6})`),
    since,
  );
  await waitForText(page, "Check your email");
  await fill(page, "Sign-in code", code);
}

/** Settings, loaded fresh (the same URL with a #hash wouldn't reload it). */
async function openSettings(page: Page) {
  await page.goto("about:blank", { wait: 100 });
  await page.goto(`${BASE_URL}/settings/account#two-factor`);
  await waitForText(page, "Two-step verification");
  await rejectCookies(page);
  await page.evaluate(() =>
    document.getElementById("two-factor")?.scrollIntoView({ block: "start" }),
  );
}

// ─── "Confirm it's you" ─────────────────────────────────────────────────────

const CONFIRM_DIALOG = "Confirm it's you";

// SQL on the LOCAL database, read from stdin (E2E_DB_SQL, as in
// two-factor.e2e.ts): ends this run's confirmations early.
const DB_SQL = process.env.E2E_DB_SQL ?? "";
function expireConfirmations() {
  if (!DB_SQL) throw new Error("Set E2E_DB_SQL to run the confirm step");
  execSync(DB_SQL, {
    input: `update "verification" set expires_at = (now() at time zone 'utc') - interval '1 second' where identifier like 'qrdx-confirmed-%' and value in (select id from "user" where email like '%${RUN}%');`,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });
}

const confirmOpen = (page: Page) =>
  page.evaluate(
    (t: string) => Boolean(window.__e2e.byRole("dialog", t)),
    CONFIRM_DIALOG,
  ) as Promise<boolean>;

async function clickInConfirm(page: Page, name: string) {
  await page.waitFor(
    (t: string, n: string) => {
      const dialog = window.__e2e.byRole("dialog", t);
      const el = dialog
        ? window.__e2e.byRole("button", n, { exact: true, root: dialog })
        : null;
      if (!el || (el as HTMLButtonElement).disabled) return false;
      window.__e2e.click(el);
      return true;
    },
    { args: [CONFIRM_DIALOG, name] as never[] },
  );
}

/** "Confirm it's you" with a code emailed to the account (2FA off). */
async function confirmByEmail(page: Page, email: string) {
  const asked = await page
    .waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
      args: [CONFIRM_DIALOG] as never[],
      timeout: 5000,
    })
    .then(
      () => true,
      () => false,
    );
  // A sign-in in the last 10 minutes already counts as confirming
  // (packages/auth/new-sign-in.ts): nothing to answer.
  if (!asked) return;
  const since = logSize();
  await clickInConfirm(page, "Send code");
  const [, code] = await waitForLogLine(
    new RegExp(`confirmation code for ${escapeRegExp(email)}: (\\d{6})`),
    since,
  );
  await page.waitFor(
    (t: string, v: string) => {
      const input = window.__e2e
        .byRole("dialog", t)
        ?.querySelector("[data-input-otp]") as HTMLInputElement | null;
      if (!input) return false;
      input.focus();
      window.__e2e.setValue(input, v);
      return true;
    },
    { args: [CONFIRM_DIALOG, code] as never[] },
  );
  await page.waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
    args: [CONFIRM_DIALOG] as never[],
  });
}

/** "Confirm it's you" with a backup code (2FA on). */
async function confirmByBackupCode(page: Page, code: string) {
  await page.waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
    args: [CONFIRM_DIALOG] as never[],
  });
  await page.waitFor(
    (t: string) =>
      !/Loading/.test(window.__e2e.byRole("dialog", t)?.textContent ?? ""),
    { args: [CONFIRM_DIALOG] as never[] },
  );
  const showing = (await page.evaluate(
    (t: string) =>
      Boolean(
        window.__e2e.byLabel(
          "Backup code",
          window.__e2e.byRole("dialog", t) ?? undefined,
        ),
      ),
    CONFIRM_DIALOG,
  )) as boolean;
  if (!showing) {
    await clickInConfirm(page, "Use another method");
    await clickInConfirm(page, "Use a backup code");
  }
  await page.waitFor(
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
    { args: [CONFIRM_DIALOG, code] as never[] },
  );
  await clickInConfirm(page, "Confirm");
  await page.waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
    args: [CONFIRM_DIALOG] as never[],
  });
}

// ─── The setup dialog ───────────────────────────────────────────────────────

async function chooseAuthenticatorApp(page: Page) {
  await page.waitFor(() => {
    const radio = document.querySelector(
      '[role="dialog"] [role="radio"][value="app"]',
    ) as HTMLElement | null;
    if (!radio) return false;
    window.__e2e.click(radio);
    return radio.getAttribute("aria-checked") === "true";
  });
  await clickInDialog(page, "Continue");
}

async function readSecret(page: Page): Promise<string> {
  await page.waitFor(() =>
    Boolean(document.querySelector('[role="dialog"] code')),
  );
  return (
    (await page.evaluate(
      () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
    )) as string
  ).replace(/\s+/g, "");
}

async function readBackupCodes(page: Page): Promise<string[]> {
  await page.waitFor(
    () =>
      document.querySelectorAll(
        '[role="dialog"] [aria-label="Backup codes"] li',
      ).length > 0,
  );
  return (await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[role="dialog"] [aria-label="Backup codes"] li',
      ),
    ].map((li) => li.textContent?.trim() ?? ""),
  )) as string[];
}

/** Ticks "I've saved my backup codes" and clicks Done. */
async function saveCodesAndFinish(page: Page) {
  await page.evaluate(() => {
    const box = window.__e2e.byLabel("I've saved my backup codes");
    if (box) window.__e2e.click(box);
  });
  await clickInDialog(page, "Done");
}

// ─── Passkeys: Chrome's virtual authenticator ──────────────────────────────

async function addAuthenticator(
  page: Page,
  { userVerified = true }: { userVerified?: boolean } = {},
): Promise<string> {
  const { authenticatorId } = (await page.cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: userVerified,
        automaticPresenceSimulation: true,
      },
    },
  )) as { authenticatorId: string };
  return authenticatorId;
}

/**
 * The same passkeys on a new authenticator (Chrome allows one internal one
 * at a time), e.g. one that doesn't verify the person: a prompt that opens
 * on its own then fails quietly.
 */
async function swapAuthenticator(
  page: Page,
  current: string,
  options: { userVerified?: boolean },
): Promise<string> {
  const { credentials } = (await page.cdp.send("WebAuthn.getCredentials", {
    authenticatorId: current,
  })) as { credentials: unknown[] };
  await removeAuthenticator(page, current);
  const next = await addAuthenticator(page, options);
  for (const credential of credentials) {
    await page.cdp.send("WebAuthn.addCredential", {
      authenticatorId: next,
      credential,
    });
  }
  return next;
}

/** The authenticator waits for a touch that never comes (presence off). */
async function holdPrompt(page: Page, authenticatorId: string, held: boolean) {
  await page.cdp.send("WebAuthn.setAutomaticPresenceSimulation", {
    authenticatorId,
    enabled: !held,
  });
}

async function removeAuthenticator(page: Page, authenticatorId: string) {
  await page.cdp.send("WebAuthn.removeVirtualAuthenticator", {
    authenticatorId,
  });
}

// ─── The run ────────────────────────────────────────────────────────────────

async function appFlow(page: Page) {
  // ── app: turning it on with the authenticator app ──
  await emailCodeStep(page, APP_EMAIL);
  await landedOn(page, "/dashboard");
  const userId = (await session(page))?.user?.id ?? "";
  check("account A signs up with an email code", Boolean(userId));

  const phone = new Device("phone");
  await phone.signIn(APP_EMAIL);
  check(
    "account A is also signed in on a phone",
    (await phone.signedInAs()) === APP_EMAIL,
  );

  await openSettings(page);
  await clickButton(page, "Turn on");
  await confirmByEmail(page, APP_EMAIL);
  await waitForText(page, "Turning it on signs out your other devices.");
  check("the first step says turning it on signs out the other devices", true);
  await shot(page, "01-turn-on-choose");
  await chooseAuthenticatorApp(page);
  await waitForText(page, "Set up your authenticator app");
  const secret = await readSecret(page);
  let since = logSize();
  await fill(page, "Code from your authenticator app", totp(secret));
  await waitForText(page, "Save your backup codes");
  await waitForText(
    page,
    "Two-step verification is on. Your other devices were signed out.",
  );
  check("the codes step says the other devices were signed out", true);
  await shot(page, "02-codes-signed-out");
  check(
    "the phone is signed out",
    (await phone.signedInAs()) === null,
    `phone: ${await phone.signedInAs()}`,
  );
  check(
    "this browser stays signed in (the session Better Auth swapped in)",
    (await session(page))?.user?.id === userId,
  );
  await waitForLogLine(
    noticeLine(
      APP_EMAIL,
      "two-step verification turned on, other sessions signed out",
    ),
    since,
  );
  check("the 'on' notice says the other sessions were signed out", true);

  await saveCodesAndFinish(page);
  await waitForText(
    page,
    "Two-step verification is on. Your other devices were signed out.",
  );
  check("the toast says the other devices were signed out", true);
  await shot(page, "03-done-toast");
  await waitForText(page, "10 of 10 left");

  // Its "Confirm it's you" moved to the new session: New codes doesn't ask.
  await clickButton(page, "New codes");
  await waitForText(page, "Make new backup codes?");
  await clickInDialog(page, "Make new codes");
  await page.waitFor(
    (t: string) =>
      Boolean(window.__e2e.byRole("dialog", t)) ||
      document.body.innerText.includes("Your new backup codes"),
    { args: [CONFIRM_DIALOG] as never[] },
  );
  check(
    "the confirmation stayed with this browser: New codes doesn't ask again",
    !(await confirmOpen(page)),
  );
  let codes = await readBackupCodes(page);
  check("new backup codes are shown", codes.length === 10, `${codes.length}`);
  await saveCodesAndFinish(page);
  await waitForText(page, "10 of 10 left");

  // ── backup: another device signs in with a backup code ──
  const laptop = new Device("laptop");
  since = logSize();
  await laptop.signIn(APP_EMAIL, { backupCode: codes[0] });
  check(
    "a laptop signs in with a backup code",
    (await laptop.signedInAs()) === APP_EMAIL,
  );
  await waitForLogLine(
    noticeLine(APP_EMAIL, "a backup code was used to sign in, 9 left"),
    since,
  );
  check("that backup code is emailed, with 9 left", true);

  // ── second: a passkey added while it's on signs nobody out ──
  const authenticatorId = await addAuthenticator(page);
  await page.goto(`${BASE_URL}/settings/account#passkeys`);
  await waitForText(page, "Passkeys");
  await clickButton(page, "Add passkey");
  await page.waitFor(() =>
    Boolean(window.__e2e.byRole("dialog", "Add a passkey")),
  );
  check(
    "adding a second method doesn't mention signing out",
    !(await dialogText(page)).includes("sign"),
    (await dialogText(page)).replace(/\s+/g, " ").slice(0, 160),
  );
  await clickInDialog(page, "Continue");
  await page.waitFor(() => !window.__e2e.byRole("dialog", "Add a passkey"));
  await waitForText(page, "Passkey added");
  check(
    "after adding a passkey while it's on, the laptop is still signed in",
    (await laptop.signedInAs()) === APP_EMAIL,
  );

  // ── confirm: a backup code in "Confirm it's you" ──
  // A new sign-in in this browser. Answering its second step counts as
  // confirming for 10 minutes (packages/auth/new-sign-in.ts), so that ends
  // early here ("10 minutes later").
  await leaveSignedIn(page);
  await emailCodeStep(page, APP_EMAIL);
  // The passkey answers the second step on its own.
  await landedOn(page, "/dashboard");
  expireConfirmations();
  await openSettings(page);
  await clickButton(page, "New codes");
  await waitForText(page, "Make new backup codes?");
  // The passkey prompt opens on its own; held open, a backup code is used.
  await holdPrompt(page, authenticatorId, true);
  since = logSize();
  await clickInDialog(page, "Make new codes");
  await confirmByBackupCode(page, codes[1]);
  await holdPrompt(page, authenticatorId, false);
  await waitForText(page, "Your new backup codes");
  await waitForLogLine(
    noticeLine(APP_EMAIL, "a backup code was used to confirm it's you, 8 left"),
    since,
  );
  check(
    "a backup code in Confirm it's you is emailed with the count before the new codes (8 left)",
    true,
  );
  codes = await readBackupCodes(page);
  await saveCodesAndFinish(page);

  // Down to 2: each sign-in with a backup code says how many are left.
  const tablets: Device[] = [];
  for (let used = 1; used <= 8; used++) {
    const tablet = new Device(`tablet-${used}`);
    since = logSize();
    await tablet.signIn(APP_EMAIL, { backupCode: codes[used - 1] });
    await waitForLogLine(
      noticeLine(
        APP_EMAIL,
        `a backup code was used to sign in, ${10 - used} left`,
      ),
      since,
    );
    tablets.push(tablet);
  }
  check("using backup codes counts down to 2 left in the notices", true);
  await openSettings(page);
  await waitForText(page, "2 of 10 left");
  check("Settings agrees: 2 of 10 left", true);

  // ── admin: support's reset ──
  // It now waits 7 days, needs the admin's own two-step verification and is
  // completed by the daily cron, signing out every session: covered by
  // e2e/sign-in-security-e.e2e.mts and tests/lib/two-factor-sign-out.test.ts.
  await removeAuthenticator(page, authenticatorId);
}

async function passkeyFlow(page: Page) {
  await leaveSignedIn(page);
  let authenticatorId = await addAuthenticator(page);
  await emailCodeStep(page, PASSKEY_EMAIL);
  await landedOn(page, "/dashboard");
  check("account B signs up with an email code", Boolean(await session(page)));

  const phone = new Device("phone-b");
  await phone.signIn(PASSKEY_EMAIL);
  check(
    "account B is also signed in on a phone",
    (await phone.signedInAs()) === PASSKEY_EMAIL,
  );

  // The authenticator app's step, opened on its own, says it too.
  await openSettings(page);
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("#two-factor *")].find(
      (el) =>
        el.textContent?.startsWith("Authenticator app") &&
        el.querySelector("button"),
    );
    const button = [...(row?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent?.trim() === "Set up",
    );
    if (button) window.__e2e.click(button);
  });
  await confirmByEmail(page, PASSKEY_EMAIL);
  await waitForText(
    page,
    "This turns on two-step verification and signs out your other devices.",
  );
  await readSecret(page);
  check("the app step, opened on its own, says it signs out", true);
  await shot(page, "04-app-step-turning-on");
  await clickInDialog(page, "Cancel");

  // ── passkey: a first passkey turns it on ──
  await clickButton(page, "Add passkey");
  await page.waitFor(() =>
    Boolean(window.__e2e.byRole("dialog", "Add a passkey")),
  );
  await waitForText(
    page,
    "Adding it turns on two-step verification and signs out your other devices.",
  );
  check("the passkey step says adding it signs out the other devices", true);
  await shot(page, "05-passkey-step-turning-on");
  let since = logSize();
  await clickInDialog(page, "Continue");
  await waitForText(page, "Save your backup codes");
  await waitForText(
    page,
    "Two-step verification is on. Your other devices were signed out.",
  );
  check(
    "a first passkey turns it on and signs out the phone",
    (await phone.signedInAs()) === null,
  );
  check(
    "this browser stays signed in",
    Boolean((await session(page))?.user?.id),
  );
  await waitForLogLine(
    noticeLine(
      PASSKEY_EMAIL,
      "two-step verification turned on, other sessions signed out",
    ),
    since,
  );
  check("the 'on' notice says so", true);
  await saveCodesAndFinish(page);
  await waitForText(page, "10 of 10 left");

  // ── existing: off keeps the passkey; on again with it signs out ──
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("#two-factor button")].find(
      (b) => b.textContent?.trim() === "Turn off",
    );
    if (button) window.__e2e.click(button as HTMLElement);
  });
  await waitForText(page, "Turn off two-step verification?");
  await clickInDialog(page, "Turn off");
  await waitForText(page, "Your passkey is ready to be your second step.");
  check("turned off, the passkey is ready to be the second step", true);

  const tablet = new Device("tablet-b");
  await tablet.signIn(PASSKEY_EMAIL);
  check(
    "with it off, a tablet signs in without a second step",
    (await tablet.signedInAs()) === PASSKEY_EMAIL,
  );

  // An authenticator that won't verify the person: the prompt that opens on
  // its own fails quietly and the step waits with its button (screenshot);
  // then one that does.
  authenticatorId = await swapAuthenticator(page, authenticatorId, {
    userVerified: false,
  });
  await clickButton(page, "Turn on");
  await page.waitFor(() =>
    Boolean(window.__e2e.byRole("dialog", "Use your passkey")),
  );
  await waitForText(page, "Your other devices will be signed out.");
  await page.waitFor(() => {
    const button = window.__e2e.byRole("button", "Continue with passkey", {
      exact: true,
    }) as HTMLButtonElement | null;
    return Boolean(button && !button.disabled);
  });
  check(
    "the existing-passkey step says the other devices are signed out",
    true,
  );
  await shot(page, "06-existing-passkey");
  authenticatorId = await swapAuthenticator(page, authenticatorId, {
    userVerified: true,
  });
  since = logSize();
  await clickInDialog(page, "Continue with passkey");
  await waitForText(page, "Save your backup codes");
  await waitForText(
    page,
    "Two-step verification is on. Your other devices were signed out.",
  );
  check(
    "on again with the existing passkey: the tablet is signed out",
    (await tablet.signedInAs()) === null,
  );
  await waitForLogLine(
    noticeLine(
      PASSKEY_EMAIL,
      "two-step verification turned on, other sessions signed out",
    ),
    since,
  );
  await saveCodesAndFinish(page);
  await removeAuthenticator(page, authenticatorId);
}

async function main() {
  if (!(DEV_LOG && existsSync(DEV_LOG))) {
    console.log("SKIP: set E2E_DEV_LOG to the dev server's log file");
    return;
  }
  if (!(await serverIsUp(BASE_URL))) {
    console.log(`SKIP: no server at ${BASE_URL}`);
    return;
  }
  if (!findChrome()) {
    console.log("SKIP: Chrome not found");
    return;
  }

  const page = await launch({ width: 1440, height: 1000 });
  if (MOBILE) {
    await page.cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await page.cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
  }
  const csp = await recordCspViolations(page);
  const enforced = await cspEnforced(BASE_URL);
  try {
    await page.cdp.send("WebAuthn.enable", { enableUI: false });
    await appFlow(page);
    await passkeyFlow(page);
    check(
      "no page errors",
      page.consoleErrors.length === 0,
      page.consoleErrors.slice(0, 3).join(" | "),
    );
  } catch (error) {
    check(
      "run finished",
      false,
      error instanceof Error ? error.message : String(error),
    );
    if (SHOTS) {
      const { data } = (await page.cdp.send("Page.captureScreenshot", {
        format: "png",
      })) as { data: string };
      writeFileSync(
        join(SHOTS, `${PREFIX}-fail-${RUN}.png`),
        Buffer.from(data, "base64"),
      );
      console.log(`      dialog: ${(await dialogText(page)).slice(0, 300)}`);
    }
  } finally {
    await page.close();
  }

  const cspResult = csp.result(enforced);
  if (cspResult.skipped) {
    console.log(`NOTE  no CSP violations: skipped (${cspResult.note})`);
  } else {
    check("no CSP violations", cspResult.ok, cspResult.lines.join("\n      "));
  }

  if (MOBILE) console.log(`\nMobile layout:\n${layout.join("\n")}`);
  console.log(`\n${results.length - failures} passed, ${failures} failed`);
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
