// New sign-in alerts and security notices end to end, in headless Chrome
// against a running dev server and its local database (CDP, no Playwright;
// see ./cdp.mjs). Each Chrome launch is a fresh profile: a browser the
// account has never seen.
//
//   sign-up      a brand-new account's first sign-in: no alert, the browser
//                is recorded (qrdx_device, HttpOnly)
//   same         signing in again in that browser: no alert
//   new          another browser signs in: the alert, with its device, place,
//                address, time in the place's zone and how it signed in (geo
//                headers set as the hosting platform would)
//   two-step     with two-step verification on, a new browser's sign-in is
//                challenged: no alert until the authenticator code finishes
//                it, then one naming both steps
//   notices      turning two-step verification on (Confirm it's you with an
//                emailed code, then the stepper's authenticator app) logs its
//                notice and isn't counted as a sign-in
//
// The dev server logs alerts and notices instead of emailing them, so it only
// runs against a local dev server whose output goes to E2E_DEV_LOG:
//
//   E2E_BASE_URL=http://localhost:3240 E2E_DEV_LOG=/path/to/dev.log \
//   pnpm exec tsx e2e/security-emails.e2e.ts
//
// Accounts are new @qrdx.test addresses per run. Skips (exit 0) without a
// server, a log or Chrome.
/** biome-ignore-all lint/performance/useDomNodeTextContent: checks must only match text a person can see */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { findChrome, launch, serverIsUp, sleep } from "./cdp.mjs";

const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const DEV_LOG = process.env.E2E_DEV_LOG ?? "";
const RUN = Date.now().toString(36);
const EMAIL = `e2e-alerts-${RUN}@qrdx.test`;

// What the hosting platform adds to each request (lib/security/
// request-details.ts reads them).
const GEO_HEADERS = {
  "x-forwarded-for": "203.0.113.24",
  "x-vercel-ip-city": "Mumbai",
  "x-vercel-ip-country": "IN",
  "x-vercel-ip-timezone": "Asia/Kolkata",
};

type Page = Awaited<ReturnType<typeof launch>>;

let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
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
const logSince = (since: number) =>
  readFileSync(DEV_LOG).subarray(since).toString("utf8");

async function waitForLogLine(
  pattern: RegExp,
  since: number,
  timeout = 20_000,
): Promise<RegExpMatchArray> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const match = logSince(since).match(pattern);
    if (match) return match;
    await sleep(250);
  }
  throw new Error(`No log line matching ${pattern}`);
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ALERT = new RegExp(
  `\\[dev only\\] QRdx new sign-in alert for ${escapeRegExp(EMAIL)}: ([^\\n]*) \\(not emailed`,
);

// ─── Page helpers ───────────────────────────────────────────────────────────

async function waitForText(page: Page, text: string, timeout = 20_000) {
  await page.waitFor((t: string) => document.body.innerText.includes(t), {
    args: [text] as never[],
    timeout,
  });
}

async function clickButton(page: Page, name: string) {
  const ok = await page.evaluate((n: string) => {
    const el =
      window.__e2e.byRole("button", n, { exact: true }) ??
      window.__e2e.byRole("button", n);
    if (!el) return false;
    window.__e2e.click(el);
    return true;
  }, name);
  if (!ok) throw new Error(`No button "${name}"`);
}

async function fill(page: Page, label: string, value: string) {
  const ok = await page.evaluate(
    (l: string, v: string) => {
      const el = window.__e2e.byLabel(l);
      if (!el) return false;
      el.focus();
      window.__e2e.setValue(el, v);
      return true;
    },
    label,
    value,
  );
  if (!ok) throw new Error(`No field "${label}"`);
}

async function signedInEmail(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/get-session", {
      credentials: "include",
    });
    const body = response.ok ? await response.json() : null;
    return body?.user?.email ?? null;
  });
}

async function signOut(page: Page) {
  await page.evaluate(async () => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  });
}

async function deviceCookie(page: Page) {
  const { cookies } = (await page.cdp.send("Network.getCookies", {
    urls: [BASE_URL],
  })) as { cookies: { name: string; value: string; httpOnly: boolean }[] };
  return cookies.find((cookie) => cookie.name === "qrdx_device") ?? null;
}

/** /sign-in → email → code, through the page like a person. */
async function emailCodeSignIn(page: Page, next = "/dashboard") {
  await page.goto(`${BASE_URL}/sign-in?next=${encodeURIComponent(next)}`);
  await waitForText(page, "Email me a code");
  await page.evaluate(() => {
    const button = window.__e2e.byRole("button", "Reject all", { exact: true });
    if (button) window.__e2e.click(button);
  });
  const since = logSize();
  await fill(page, "Email address", EMAIL);
  await clickButton(page, "Email me a code");
  const [, code] = await waitForLogLine(
    new RegExp(`sign-in code for ${escapeRegExp(EMAIL)}: (\\d{6})`),
    since,
  );
  await waitForText(page, "Check your email");
  await fill(page, "Sign-in code", code);
}

/** A button inside the open dialog (the page behind can have the same name). */
async function clickInDialog(page: Page, name: string) {
  const ok = await page.evaluate((n: string) => {
    const dialog = document.querySelector(
      '[role="dialog"], [role="alertdialog"]',
    );
    const button = [...(dialog?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent?.trim() === n,
    );
    if (!button) return false;
    window.__e2e.click(button);
    return true;
  }, name);
  if (!ok) throw new Error(`No dialog button "${name}"`);
}

// ─── "Confirm it's you" and the turn-on stepper (Settings) ──────────────────
// Labels from app/settings/account/_components/two-factor-setup-dialog.tsx
// and components/confirm-identity/, as e2e/two-factor.e2e.ts drives them.

const CONFIRM_DIALOG = "Confirm it's you";

/** Clicks a button in "Confirm it's you" (it can sit over another dialog). */
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
async function confirmByEmail(page: Page) {
  await page.waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
    args: [CONFIRM_DIALOG] as never[],
  });
  const since = logSize();
  await clickInConfirm(page, "Send code");
  const [, code] = await waitForLogLine(
    new RegExp(`confirmation code for ${escapeRegExp(EMAIL)}: (\\d{6})`),
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

/** The stepper's first step: pick the authenticator app, then Continue. */
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

async function landedOn(page: Page, path: string, timeout = 20_000) {
  await page.waitFor((p: string) => location.pathname.startsWith(p), {
    args: [path] as never[],
    timeout,
  });
}

/** A fresh Chrome profile, sending the hosting platform's geo headers. */
async function newBrowser() {
  const page = await launch({ width: 1280, height: 900 });
  await page.cdp.send("Network.enable");
  await page.cdp.send("Network.setExtraHTTPHeaders", { headers: GEO_HEADERS });
  return page;
}

// ─── The run ────────────────────────────────────────────────────────────────

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

  const pages: Page[] = [];
  try {
    // ── sign-up ──
    const first = await newBrowser();
    pages.push(first);
    let since = logSize();
    await emailCodeSignIn(first);
    await landedOn(first, "/dashboard");
    check("a new account signs in", (await signedInEmail(first)) === EMAIL);
    await waitForLogLine(
      /"event":"auth\.new_sign_in","outcome":"first-device"/,
      since,
    );
    check(
      "its first browser is recorded silently",
      !ALERT.test(logSince(since)),
    );
    const cookie = await deviceCookie(first);
    check(
      "the browser gets an HttpOnly qrdx_device cookie",
      Boolean(cookie && /^[0-9a-f]{64}$/.test(cookie.value) && cookie.httpOnly),
    );

    // ── same ──
    await signOut(first);
    since = logSize();
    await emailCodeSignIn(first);
    await landedOn(first, "/dashboard");
    await waitForLogLine(
      /"event":"auth\.new_sign_in","outcome":"known-device"/,
      since,
    );
    check(
      "signing in again in that browser: no alert",
      !ALERT.test(logSince(since)),
    );
    check(
      "and the same device cookie",
      (await deviceCookie(first))?.value === cookie?.value,
    );

    // ── new ──
    const second = await newBrowser();
    pages.push(second);
    since = logSize();
    await emailCodeSignIn(second);
    await landedOn(second, "/dashboard");
    const [, summary] = await waitForLogLine(ALERT, since);
    check("another browser's sign-in is alerted", true, summary);
    check(
      "the alert names the device, place, address and way in",
      /Chrome on macOS/.test(summary) &&
        /Mumbai, India/.test(summary) &&
        /203\.0\.113\.24/.test(summary) &&
        /GMT\+5:30/.test(summary) &&
        /Email code$/.test(summary),
      summary,
    );
    await waitForLogLine(
      /"event":"account\.new_sign_in_alert","outcome":"logged"/,
      since,
    );
    check("the sender logged it (dev doesn't email)", true);

    // ── notices: turn on two-step verification in the first browser ──
    await first.goto(`${BASE_URL}/settings/account#two-factor`);
    await waitForText(first, "Two-step verification");
    since = logSize();
    await clickButton(first, "Turn on");
    // "Confirm it's you" first (2FA is off: an emailed code), then the
    // stepper: the authenticator app.
    await confirmByEmail(first);
    await chooseAuthenticatorApp(first);
    await waitForText(first, "Set up your authenticator app");
    // The secret is made when the step opens.
    await first.waitFor(() =>
      Boolean(document.querySelector('[role="dialog"] code')),
    );
    const secret = (
      (await first.evaluate(
        () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
      )) as string
    ).replace(/\s+/g, "");
    await fill(first, "Code from your authenticator app", totp(secret));
    await waitForText(first, "Save your backup codes");
    await first.evaluate(() => {
      const box = window.__e2e.byLabel("I've saved my backup codes");
      if (box) window.__e2e.click(box);
    });
    await clickInDialog(first, "Done");
    await waitForLogLine(
      new RegExp(
        `QRdx security notice for ${escapeRegExp(EMAIL)}: two-step verification turned on`,
      ),
      since,
    );
    check("turning it on logs the notice", true);
    check(
      "turning it on (a server-side session swap) isn't a sign-in",
      !ALERT.test(logSince(since)),
    );

    // ── two-step ──
    const third = await newBrowser();
    pages.push(third);
    since = logSize();
    await emailCodeSignIn(third, "/settings/account");
    await waitForText(third, "Your account asks for a second step");
    await sleep(1500);
    check(
      "a challenged sign-in: no alert before the second step",
      !ALERT.test(logSince(since)) && (await signedInEmail(third)) === null,
    );
    check("and no device cookie yet", (await deviceCookie(third)) === null);
    await fill(third, "Authenticator code", totp(secret));
    await landedOn(third, "/settings/account");
    const [, afterStep] = await waitForLogLine(ALERT, since);
    check(
      "the authenticator code finishes it, then the alert names both steps",
      /Email code, then an authenticator code$/.test(afterStep),
      afterStep,
    );
  } finally {
    for (const page of pages) await page.close();
  }

  console.log(failures ? `\n${failures} failed` : "\nall passed");
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
