// Two-step verification end to end, in headless Chrome against a running dev
// server and its local database (CDP, no Playwright; see ./cdp.mjs):
//
//   setup      sign up with an email code, turn it on in Settings (QR code,
//              key, first code, backup codes saved)
//   challenge  email-code sign-in asks for a code; a TOTP finishes it; so
//              does one from a browser already signed in as that person
//   wrong      5 wrong codes end the challenge ("Sign in again")
//   backup     a backup code works once and only once
//   trust      "Don't ask again on this device" skips the next challenge
//   page       /sign-in/two-factor (where Google, GitHub and SSO land) finishes
//              a pending challenge and returns to `next`; without one it says
//              to sign in again
//   plain      someone without 2FA is never asked
//   manage     changing the email, new backup codes and turning it off need
//              a current code
//   admin      an admin turns it off from the user's 360 page (audited)
//   delete     with it on, deleting the account takes one authenticator code
//              and emails nothing; with it off, the emailed code as before
//
// It reads sign-in codes and notices from the dev server's log, so it only
// runs against a local dev server whose output goes to E2E_DEV_LOG:
//
//   E2E_BASE_URL=http://localhost:3111 E2E_DEV_LOG=/path/to/dev.log \
//   E2E_SHOTS=/path/to/shots pnpm exec tsx e2e/two-factor.e2e.ts
//
// E2E_ADMIN_EMAIL (default admin@qrdx.test) must be listed in ADMIN_EMAILS.
// Accounts are new @qrdx.test addresses per run. Skips (exit 0) without a
// server, a log or Chrome.
/** biome-ignore-all lint/performance/useDomNodeTextContent: checks must only match text a person can see */
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
/** E2E_VIEWPORT=mobile: a 390 x 844 phone (DPR 2, touch) instead of desktop. */
const MOBILE = process.env.E2E_VIEWPORT === "mobile";
/** Mobile layout findings per screenshot, printed at the end. */
const layout: string[] = [];
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@qrdx.test";
const RUN = Date.now().toString(36);
const USER_EMAIL = `e2e-2fa-${RUN}@qrdx.test`;
const PLAIN_EMAIL = `e2e-plain-${RUN}@qrdx.test`;

type Page = Awaited<ReturnType<typeof launch>>;

let failures = 0;
const results: string[] = [];

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

function wrongCode(secret: string): string {
  const valid = new Set(
    [-30_000, 0, 30_000].map((d) => totp(secret, Date.now() + d)),
  );
  for (let n = 111_111; ; n++) {
    if (!valid.has(String(n))) return String(n);
  }
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

// ─── Page helpers ───────────────────────────────────────────────────────────

/**
 * On a phone: no horizontal page scroll (asserted), and the tap targets in
 * the open dialog or the main card that are under 40 px (listed).
 */
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
        // A hit area widened with an absolute ::after (e.g. checkboxes).
        const after = getComputedStyle(el, "::after");
        const grow =
          after.position === "absolute"
            ? Math.max(0, -Number.parseFloat(after.top) || 0)
            : 0;
        const rect = {
          width: box.width + grow * 2,
          height: box.height + grow * 2,
        };
        const label = (
          el.getAttribute("aria-label") ||
          el.textContent ||
          el.getAttribute("placeholder") ||
          el.tagName
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40);
        return { label, w: Math.round(rect.width), h: Math.round(rect.height) };
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
    `${name}: scrollWidth ${result.scrollWidth} <= clientWidth ${result.clientWidth} ${fits ? "OK" : "OVERFLOW"}; small targets: ${
      result.small.length
        ? result.small.map((t) => `"${t.label}" ${t.w}x${t.h}`).join(", ")
        : "none"
    }`,
  );
}

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
      join(SHOTS, `${name}-${scheme}.png`),
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

const pageText = (page: Page) =>
  page.evaluate(() => document.body.innerText) as Promise<string>;

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

// ─── "Confirm it's you" and the turn-on stepper (Settings) ──────────────────

const CONFIRM_DIALOG = "Confirm it's you";

const confirmText = (page: Page) =>
  page.evaluate(
    (t: string) => window.__e2e.byRole("dialog", t)?.textContent ?? "",
    CONFIRM_DIALOG,
  ) as Promise<string>;

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
async function confirmByEmail(page: Page, email: string) {
  await page.waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
    args: [CONFIRM_DIALOG] as never[],
  });
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

/**
 * "Confirm it's you" with 2FA on: a 6-digit authenticator code or a backup
 * code, switching to that method first when another is shown. Waits for the
 * dialog to close unless `{ closes: false }` (a wrong code).
 */
async function confirmByCode(
  page: Page,
  code: string,
  { closes = true }: { closes?: boolean } = {},
) {
  await page.waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
    args: [CONFIRM_DIALOG] as never[],
  });
  const totpCode = /^\d{6}$/.test(code);
  await page.waitFor(
    (t: string) =>
      !/Loading/.test(window.__e2e.byRole("dialog", t)?.textContent ?? ""),
    { args: [CONFIRM_DIALOG] as never[] },
  );
  const text = await confirmText(page);
  const showing = totpCode
    ? text.includes("Enter the code from your authenticator app")
    : text.includes("Backup code");
  if (!showing) {
    await clickInConfirm(page, "Use another method");
    await clickInConfirm(
      page,
      totpCode ? "Use an authenticator code" : "Use a backup code",
    );
  }
  await page.waitFor(
    (t: string, v: string, otp: boolean) => {
      const dialog = window.__e2e.byRole("dialog", t);
      const input = (
        otp
          ? dialog?.querySelector("[data-input-otp]")
          : window.__e2e.byLabel("Backup code", dialog ?? undefined)
      ) as HTMLInputElement | null;
      if (!input || input.disabled) return false;
      input.focus();
      window.__e2e.setValue(input, v);
      return true;
    },
    { args: [CONFIRM_DIALOG, code, totpCode] as never[] },
  );
  if (!totpCode) await clickInConfirm(page, "Confirm");
  if (closes) {
    await page.waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
      args: [CONFIRM_DIALOG] as never[],
    });
  }
}

/** The turn-on stepper's first step: pick the authenticator app. */
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

async function session(
  page: Page,
): Promise<{ user?: { id: string; email: string } } | null> {
  return page.evaluate(async () => {
    const response = await fetch("/api/auth/get-session", {
      credentials: "include",
    });
    return response.ok ? response.json() : null;
  });
}

async function signOutKeepingCookies(page: Page) {
  await page.evaluate(async () => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  });
}

async function clearCookies(page: Page) {
  await page.cdp.send("Network.clearBrowserCookies");
}

/** The cookie banner: decline (it would cover the screenshots). */
async function rejectCookies(page: Page) {
  await page.evaluate(() => {
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

/** A JSON email-code sign-in from the page: leaves a pending challenge. */
async function startPendingChallenge(page: Page, email: string) {
  const since = logSize();
  await page.evaluate(async (address: string) => {
    await fetch("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: address, type: "sign-in" }),
    });
  }, email);
  const [, code] = await waitForLogLine(
    new RegExp(`sign-in code for ${escapeRegExp(email)}: (\\d{6})`),
    since,
  );
  const reply = await page.evaluate(
    async (address: string, otp: string) => {
      const response = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, otp }),
      });
      return response.json();
    },
    email,
    code,
  );
  return reply?.twoFactorRedirect === true;
}

async function enterTotp(page: Page, code: string) {
  await fill(page, "Authenticator code", code);
}

async function landedOn(page: Page, path: string, timeout = 20_000) {
  await page.waitFor((p: string) => location.pathname.startsWith(p), {
    args: [path] as never[],
    timeout,
  });
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

  const page = await launch({ width: 1280, height: 900 });
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
  // CSP violations (shared recorder, e2e/cdp.mjs), checked at the end where
  // the server enforces a CSP; E2E_CSP_SELFTEST=1 first proves it works.
  const csp = await recordCspViolations(page);
  const enforced = await cspEnforced(BASE_URL);
  if (process.env.E2E_CSP_SELFTEST === "1") {
    if (enforced) {
      const { caught, lines } = await csp.selfTest(BASE_URL);
      check(
        "CSP self-test: a script from evil.example.com is caught",
        caught,
        lines[0] ?? "the recorder saw nothing",
      );
    } else {
      console.log(
        "NOTE  CSP self-test skipped: CSP not enforced on this server",
      );
    }
  }
  let secret = "";
  let backupCodes: string[] = [];
  let userId = "";
  try {
    // ── setup ──
    await emailCodeStep(page, USER_EMAIL);
    await landedOn(page, "/dashboard");
    userId = (await session(page))?.user?.id ?? "";
    check(
      "new account signs in with an email code (no 2FA yet)",
      Boolean(userId),
    );

    await page.goto(`${BASE_URL}/settings/account#two-factor`);
    await waitForText(page, "Two-step verification");
    await page.evaluate(() =>
      document
        .getElementById("two-factor")
        ?.scrollIntoView({ block: "center" }),
    );
    await shot(page, "01-settings-off");
    await clickButton(page, "Turn on");
    // Asks "Confirm it's you" (an emailed code: 2FA is off), then the
    // stepper: the authenticator app.
    await confirmByEmail(page, USER_EMAIL);
    await chooseAuthenticatorApp(page);
    await waitForText(page, "Set up your authenticator app");
    // The secret is made when the step opens.
    await page.waitFor(() =>
      Boolean(document.querySelector('[role="dialog"] code')),
    );
    const hasQr = await page.evaluate(() =>
      Boolean(document.querySelector('[role="dialog"] svg')),
    );
    secret = (
      (await page.evaluate(
        () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
      )) as string
    ).replace(/\s+/g, "");
    check("setup shows a QR code and the key", hasQr && secret.length >= 16);
    await shot(page, "02-setup-dialog");

    await fill(page, "Code from your authenticator app", wrongCode(secret));
    await waitForText(page, "That code isn't right");
    check("setup refuses a wrong code", true);
    await shot(page, "03-setup-wrong-code");

    await page.evaluate(() => {
      const el = window.__e2e.byLabel("Code from your authenticator app");
      if (el) window.__e2e.setValue(el, "");
    });
    await fill(page, "Code from your authenticator app", totp(secret));
    await waitForText(page, "Save your backup codes");
    backupCodes = (await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label="Backup codes"] li')].map(
        (li) => li.textContent?.trim() ?? "",
      ),
    )) as string[];
    check(
      "turning on shows 10 backup codes",
      backupCodes.length === 10,
      `${backupCodes.length}`,
    );
    await shot(page, "04-backup-codes");
    const doneDisabled = await page.evaluate(
      () =>
        (
          window.__e2e.byRole("button", "Done", {
            exact: true,
          }) as HTMLButtonElement
        )?.disabled,
    );
    check("Done waits for 'I've saved them'", doneDisabled === true);
    await page.evaluate(() => {
      const box = window.__e2e.byLabel("I've saved my backup codes");
      if (box) window.__e2e.click(box);
    });
    await clickInDialog(page, "Done");
    await waitForText(page, "10 of 10 left");
    check("settings show it on, with 10 codes left", true);
    check(
      "the session survived turning it on (cookie swapped in place)",
      (await session(page))?.user?.id === userId,
    );
    await page.evaluate(() =>
      document
        .getElementById("two-factor")
        ?.scrollIntoView({ block: "center" }),
    );
    await shot(page, "05-settings-on");

    // ── challenge (email code dialog step) ──
    await clearCookies(page);
    await emailCodeStep(page, USER_EMAIL, "/settings/account");
    await waitForText(page, "Your account asks for a second step");
    check("email-code sign-in is challenged", (await session(page)) === null);
    await shot(page, "06-sign-in-challenge");
    await enterTotp(page, wrongCode(secret));
    await waitForText(page, "That code isn't right");
    await shot(page, "07-sign-in-wrong-code");
    await enterTotp(page, totp(secret));
    await landedOn(page, "/settings/account");
    check(
      "a TOTP finishes it and returns to next",
      (await session(page))?.user?.id === userId,
    );

    // ── signing in again with a live session in the same browser ──
    // An old session cookie plus the mailbox must not mint a fresh session.
    // (/sign-in redirects someone signed in, so this is the page's fetch.)
    check(
      "signed in before signing in again",
      (await session(page))?.user?.id === userId,
    );
    check(
      "an email-code sign-in with a live session is challenged",
      await startPendingChallenge(page, USER_EMAIL),
    );
    check("and no session without the code", (await session(page)) === null);
    await page.goto(
      `${BASE_URL}/sign-in/two-factor?next=%2Fsettings%2Faccount`,
    );
    await waitForText(page, "Your account asks for a second step");
    await enterTotp(page, totp(secret));
    await landedOn(page, "/settings/account");
    check(
      "a TOTP finishes that one too",
      (await session(page))?.user?.id === userId,
    );

    // ── wrong codes ──
    await clearCookies(page);
    await emailCodeStep(page, USER_EMAIL);
    await waitForText(page, "Your account asks for a second step");
    for (let i = 0; i < 5; i++) {
      await enterTotp(page, wrongCode(secret));
      await page.waitFor(
        () =>
          document.body.innerText.includes("That code isn't right") ||
          document.body.innerText.includes("Too many wrong codes"),
      );
      await sleep(3_600); // the HTTP limit allows 3 per 10 s in production
    }
    await waitForText(page, "Too many wrong codes. Sign in again");
    await shot(page, "08-too-many-attempts");
    const reply = await page.evaluate(async (code: string) => {
      const response = await fetch("/api/auth/two-factor/verify-totp", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      return { status: response.status, body: await response.json() };
    }, totp(secret));
    check(
      "after 5 wrong codes even the right one is refused",
      reply.status === 400 &&
        reply.body?.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
      `${reply.status} ${reply.body?.code}`,
    );
    check(
      "no session after a failed challenge",
      (await session(page)) === null,
    );

    // ── backup code, once ──
    await clearCookies(page);
    await emailCodeStep(page, USER_EMAIL);
    await waitForText(page, "Your account asks for a second step");
    await clickButton(page, "Use a backup code");
    await fill(page, "Backup code", backupCodes[0]);
    await shot(page, "09-backup-code-step");
    await clickButton(page, "Verify");
    await landedOn(page, "/dashboard");
    check("a backup code signs in", (await session(page))?.user?.id === userId);

    await clearCookies(page);
    await emailCodeStep(page, USER_EMAIL);
    await waitForText(page, "Your account asks for a second step");
    await clickButton(page, "Use a backup code");
    await fill(page, "Backup code", backupCodes[0]);
    await clickButton(page, "Verify");
    await waitForText(
      page,
      "That backup code isn't right, or it was already used",
    );
    check(
      "the same backup code is refused the second time",
      (await session(page)) === null,
    );
    await shot(page, "10-backup-code-used");
    await fill(
      page,
      "Backup code",
      backupCodes[1].replace("-", "").toLowerCase(),
    );
    await clickButton(page, "Verify");
    await landedOn(page, "/dashboard");
    check(
      "another backup code, typed in lower case without the dash, works",
      (await session(page))?.user?.id === userId,
    );

    // ── trusted device ──
    await clearCookies(page);
    await emailCodeStep(page, USER_EMAIL);
    await waitForText(page, "Your account asks for a second step");
    await page.evaluate(() => {
      const box = window.__e2e.byLabel("Don't ask again on this device");
      if (box) window.__e2e.click(box);
    });
    await enterTotp(page, totp(secret));
    await landedOn(page, "/dashboard");
    await signOutKeepingCookies(page);
    check("signed out", (await session(page)) === null);
    await emailCodeStep(page, USER_EMAIL);
    await landedOn(page, "/dashboard");
    check(
      "a trusted device isn't asked again",
      (await session(page))?.user?.id === userId,
    );

    // ── the challenge page (redirect sign-ins land here) ──
    await clearCookies(page);
    await page.goto(
      `${BASE_URL}/sign-in/two-factor?next=%2Fsettings%2Faccount`,
    );
    await waitForText(page, "This sign-in timed out or was already finished");
    check("the challenge page without a challenge says to sign in again", true);
    await shot(page, "11-challenge-page-expired");
    // A pending challenge, as a Google/GitHub/SSO callback leaves one, then
    // the page they land on, for each place a sign-in can return to.
    const destinations = [
      "/oauth/authorize?client_id=e2e-app&response_type=code",
      `/invite/e2e-${RUN}`,
      `/join/e2e-${RUN}`,
      "/settings/account",
    ];
    for (const [index, next] of destinations.entries()) {
      await clearCookies(page);
      // A settled page first: the last destination may still be redirecting.
      await page.goto(`${BASE_URL}/sign-in`);
      check(
        `JSON sign-in answers twoFactorRedirect (${next})`,
        await startPendingChallenge(page, USER_EMAIL),
      );
      await page.goto(
        `${BASE_URL}/sign-in/two-factor?next=${encodeURIComponent(next)}`,
      );
      await waitForText(page, "Your account asks for a second step");
      if (index === 0) await shot(page, "12-challenge-page");
      await enterTotp(page, totp(secret));
      await page.waitFor(
        (target: string) => `${location.pathname}${location.search}` === target,
        { args: [next] as never[] },
      );
      check(
        `the challenge page finishes it and opens ${next}`,
        (await session(page))?.user?.id === userId,
      );
    }

    // An unsafe next falls back to /dashboard.
    await clearCookies(page);
    await page.goto(
      `${BASE_URL}/sign-in/two-factor?next=${encodeURIComponent("//evil.example/x")}`,
    );
    const signInHref = await page.evaluate(() =>
      (
        window.__e2e.byRole("link", "Sign in again") as HTMLAnchorElement
      )?.getAttribute("href"),
    );
    check(
      "an unsafe next falls back to /dashboard",
      signInHref === "/sign-in?next=%2Fdashboard",
      String(signInHref),
    );

    // "Use another account" drops the challenge.
    await emailCodeStep(page, USER_EMAIL);
    await waitForText(page, "Your account asks for a second step");
    await clickButton(page, "Use another account");
    await waitForText(page, "Email me a code");
    const left = (await page.cdp.send("Network.getCookies", {
      urls: [BASE_URL],
    })) as {
      cookies: { name: string }[];
    };
    check(
      "Use another account clears the challenge cookie",
      !left.cookies.some((c) => c.name.endsWith("two_factor")),
    );

    // ── someone without 2FA ──
    await clearCookies(page);
    await emailCodeStep(page, PLAIN_EMAIL);
    await landedOn(page, "/dashboard");
    check(
      "someone without 2FA is never asked",
      (await session(page))?.user?.email === PLAIN_EMAIL,
    );

    // ── manage: new backup codes, turn off ──
    await clearCookies(page);
    await emailCodeStep(page, USER_EMAIL, "/settings/account");
    await waitForText(page, "Your account asks for a second step");
    await enterTotp(page, totp(secret));
    await landedOn(page, "/settings/account");
    await waitForText(page, " left. Each works once");
    const leftText = await pageText(page);
    check(
      "settings count used backup codes",
      leftText.includes("8 of 10 left"),
    );

    // ── changing the email asks "Confirm it's you" ──
    // Moved to a new address and back, so the rest of the run signs in as
    // before. With 2FA on the dialog offers the app or a backup code, never
    // an emailed code; a wrong code sends nothing. The second move is inside
    // the confirmation's 10 minutes, so it doesn't ask again.
    const movedEmail = `e2e-2fa-moved-${RUN}@qrdx.test`;
    const moves: [to: string, back: boolean][] = [
      [movedEmail, false],
      [USER_EMAIL, true],
    ];
    for (const [index, [to, back]] of moves.entries()) {
      await page.goto(`${BASE_URL}/settings/account`);
      await clickButton(page, "Change");
      await waitForText(page, "Change your email");
      await fill(page, "New email", to);
      const since = logSize();
      await clickInDialog(page, "Send code");
      if (index === 0) {
        await page.waitFor(
          (t: string) => Boolean(window.__e2e.byRole("dialog", t)),
          { args: [CONFIRM_DIALOG] as never[] },
        );
        const asked = await confirmText(page);
        check(
          "changing the email asks to confirm it's you, with no emailed code",
          asked.includes("Before you change your email") &&
            !asked.includes("We'll email"),
          asked.replace(/\s+/g, " ").slice(0, 160),
        );
        await shot(page, "13a-change-email-confirm");
        await confirmByCode(page, wrongCode(secret), { closes: false });
        await waitForText(page, "That code isn't right");
        await shot(page, "13b-change-email-wrong-code");
        check(
          "a wrong authenticator code sends no email-change code",
          !readFileSync(DEV_LOG)
            .subarray(since)
            .toString("utf8")
            .includes(`email-change code for ${to}`),
        );
        await confirmByCode(page, totp(secret));
      }
      const [, emailed] = await waitForLogLine(
        new RegExp(`email-change code for ${escapeRegExp(to)}: (\\d{6})`),
        since,
      );
      await fill(page, "Code from the new address", emailed);
      await clickInDialog(page, "Change email");
      await waitForText(page, `Your email is now ${to}`);
      check(
        back
          ? "and back again, without asking again"
          : "confirmed with the app, the emailed code changes the email",
        (await session(page))?.user?.email === to,
      );
      // Closed (and done animating) before the next dialog is measured.
      await page.waitFor(() => !document.querySelector('[role="dialog"]'));
    }

    // New backup codes: still inside the email change's confirmation.
    let noticeSince = logSize();
    await clickButton(page, "New codes");
    await waitForText(page, "Make new backup codes?");
    await shot(page, "13-new-codes-dialog");
    await clickInDialog(page, "Make new codes");
    await waitForText(page, "Your new backup codes");
    const fresh = (await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label="Backup codes"] li')].map(
        (li) => li.textContent?.trim() ?? "",
      ),
    )) as string[];
    check(
      "new backup codes replace the old ones",
      fresh.length === 10 && !fresh.includes(backupCodes[2]),
    );
    await waitForLogLine(
      new RegExp(
        `security notice for ${escapeRegExp(USER_EMAIL)}: new backup codes`,
      ),
      noticeSince,
    );
    check("new backup codes send a notice", true);
    await page.evaluate(() => {
      const box = window.__e2e.byLabel("I've saved my backup codes");
      if (box) window.__e2e.click(box);
    });
    await clickButton(page, "Done");
    await waitForText(page, "10 of 10 left");

    // Turning off from a new sign-in asks again: with a backup code.
    await clearCookies(page);
    await emailCodeStep(page, USER_EMAIL, "/settings/account");
    await waitForText(page, "Your account asks for a second step");
    await enterTotp(page, totp(secret, Date.now() + 30_000));
    await landedOn(page, "/settings/account");
    noticeSince = logSize();
    await clickButton(page, "Turn off");
    await waitForText(page, "Turn off two-step verification?");
    await shot(page, "14-turn-off-dialog");
    await clickInDialog(page, "Turn off");
    await confirmByCode(page, fresh[0]);
    await page.waitFor(() =>
      document.querySelector("#two-factor")?.textContent?.includes("Off"),
    );
    check("turned off, confirmed with a backup code", true);
    check(
      "the session survived turning it off",
      (await session(page))?.user?.id === userId,
    );
    await waitForLogLine(
      new RegExp(
        `security notice for ${escapeRegExp(USER_EMAIL)}: two-step verification turned off`,
      ),
      noticeSince,
    );
    check("turning off sends a notice", true);
    await clearCookies(page);
    await emailCodeStep(page, USER_EMAIL);
    await landedOn(page, "/dashboard");
    check(
      "after turning off, sign-in isn't challenged",
      (await session(page))?.user?.id === userId,
    );

    // ── admin turns it off ──
    // Turn it on again (fresh sign-in just above).
    await page.goto(`${BASE_URL}/settings/account#two-factor`);
    await waitForText(page, "Two-step verification");
    await clickButton(page, "Turn on");
    // Asks "Confirm it's you" (an emailed code: 2FA is off), then the
    // stepper: the authenticator app.
    await confirmByEmail(page, USER_EMAIL);
    await chooseAuthenticatorApp(page);
    await waitForText(page, "Set up your authenticator app");
    // The secret is made when the step opens.
    await page.waitFor(() =>
      Boolean(document.querySelector('[role="dialog"] code')),
    );
    secret = (
      (await page.evaluate(
        () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
      )) as string
    ).replace(/\s+/g, "");
    await fill(page, "Code from your authenticator app", totp(secret));
    await waitForText(page, "Save your backup codes");

    await clearCookies(page);
    await emailCodeStep(page, ADMIN_EMAIL, `/admin/users/${userId}`);
    await landedOn(page, "/admin/users");
    await waitForText(page, "Two-step verification");
    await page.evaluate(() =>
      document.getElementById("sign-in")?.scrollIntoView({ block: "center" }),
    );
    await shot(page, "15-admin-row-on");
    noticeSince = logSize();
    const opened = await page.evaluate(() => {
      const row = [...document.querySelectorAll("#sign-in *")].find(
        (el) =>
          el.textContent?.startsWith("Two-step verification") &&
          el.querySelector("button"),
      );
      const button = row?.querySelector("button");
      if (!button) return false;
      window.__e2e.click(button);
      return true;
    });
    if (!opened) throw new Error("No admin Turn off button");
    await waitForText(page, "Turn off two-step verification");
    await page.evaluate(() => {
      const box = document.querySelector(
        '[role="dialog"] textarea',
      ) as HTMLTextAreaElement | null;
      if (box)
        window.__e2e.setValue(
          box,
          "E2E: lost phone, confirmed from the account address",
        );
    });
    await shot(page, "16-admin-confirm");
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const buttons = [...(dialog?.querySelectorAll("button") ?? [])];
      const confirm = buttons
        .reverse()
        .find((b) => b.textContent?.trim() === "Turn off");
      if (confirm) window.__e2e.click(confirm);
    });
    await waitForLogLine(
      new RegExp(
        `security notice for ${escapeRegExp(USER_EMAIL)}: two-step verification turned off by support`,
      ),
      noticeSince,
    );
    check("admin reset sends the notice", true);
    await page.goto(`${BASE_URL}/admin/users/${userId}`);
    await waitForText(page, "Not set up.");
    check("admin row shows it off", true);
    await page.goto(`${BASE_URL}/admin/audit-log`);
    await waitForText(page, "user.reset_two_factor");
    check("the reset is in the audit log", true);

    await clearCookies(page);
    await emailCodeStep(page, USER_EMAIL);
    await landedOn(page, "/dashboard");
    check(
      "after the admin reset, sign-in isn't challenged",
      (await session(page))?.user?.id === userId,
    );

    // ── deleting the account needs a current code too ──
    // Turn it on again (signed in just above, so recently enough).
    await page.goto(`${BASE_URL}/settings/account#two-factor`);
    await waitForText(page, "Two-step verification");
    await clickButton(page, "Turn on");
    // Asks "Confirm it's you" (an emailed code: 2FA is off), then the
    // stepper: the authenticator app.
    await confirmByEmail(page, USER_EMAIL);
    await chooseAuthenticatorApp(page);
    await waitForText(page, "Set up your authenticator app");
    // The secret is made when the step opens.
    await page.waitFor(() =>
      Boolean(document.querySelector('[role="dialog"] code')),
    );
    secret = (
      (await page.evaluate(
        () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
      )) as string
    ).replace(/\s+/g, "");
    await fill(page, "Code from your authenticator app", totp(secret));
    await waitForText(page, "Save your backup codes");
    const deletionCodes = (await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label="Backup codes"] li')].map(
        (li) => li.textContent?.trim() ?? "",
      ),
    )) as string[];
    check(
      "backup codes are easy to read (no 0, O, 1 or I)",
      deletionCodes.length === 10 &&
        deletionCodes.every((c) =>
          /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/.test(c),
        ),
      deletionCodes[0],
    );
    await page.evaluate(() => {
      const box = window.__e2e.byLabel("I've saved my backup codes");
      if (box) window.__e2e.click(box);
    });
    await clickInDialog(page, "Done");
    await waitForText(page, "10 of 10 left");

    // With 2FA on, deleting from a new sign-in asks "Confirm it's you" with
    // the app or a backup code: no emailed code is offered or sent.
    await clearCookies(page);
    await emailCodeStep(page, USER_EMAIL, "/settings/account");
    await waitForText(page, "Your account asks for a second step");
    await enterTotp(page, totp(secret, Date.now() + 30_000));
    await landedOn(page, "/settings/account");
    await page.evaluate(() =>
      document.getElementById("danger")?.scrollIntoView({ block: "center" }),
    );
    await clickButton(page, "Delete account…");
    await waitForText(page, "Delete your account?");
    const deleteSince = logSize();
    await fill(page, "Type delete to confirm", "delete");
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="alertdialog"]');
      const button = [...(dialog?.querySelectorAll("button") ?? [])].find(
        (b) => b.textContent?.trim() === "Delete account",
      );
      if (button) window.__e2e.click(button);
    });
    await page.waitFor(
      (t: string) => Boolean(window.__e2e.byRole("dialog", t)),
      { args: [CONFIRM_DIALOG] as never[] },
    );
    const deleteAsk = await confirmText(page);
    check(
      "deleting with 2FA on asks to confirm it's you, with no emailed code",
      deleteAsk.includes("Before you delete your account") &&
        !deleteAsk.includes("We'll email"),
      deleteAsk.replace(/\s+/g, " ").slice(0, 160),
    );
    await shot(page, "17-delete-account-confirm");
    await confirmByCode(page, wrongCode(secret), { closes: false });
    await waitForText(page, "That code isn't right");
    check(
      "a wrong authenticator code stops the deletion",
      (await session(page))?.user?.id === userId,
    );
    await shot(page, "18-delete-account-wrong-code");
    await confirmByCode(page, totp(secret, Date.now() + 30_000));
    await landedOn(page, "/");
    await page.waitFor(() => location.pathname === "/");
    check(
      "deleted, confirmed with an authenticator code",
      (await session(page)) === null,
    );
    const deletionLog = readFileSync(DEV_LOG)
      .subarray(deleteSince)
      .toString("utf8");
    check(
      "no emailed code was sent for the deletion",
      !new RegExp(
        `(sign-in|confirmation) code for ${escapeRegExp(USER_EMAIL)}:`,
      ).test(deletionLog),
    );
    // A request for an emailed confirmation code from a 2FA account is
    // refused too (tests/lib/account-confirmation.test.ts).

    // Signing in with the address now makes a new account, without 2FA.
    await emailCodeStep(page, USER_EMAIL);
    await landedOn(page, "/dashboard");
    const after = await session(page);
    check(
      "the old account is gone (a new one, without 2FA)",
      Boolean(after?.user?.id) && after?.user?.id !== userId,
    );

    // With 2FA off, "Confirm it's you" emails a code to the account.
    await page.goto(`${BASE_URL}/settings/account#danger`);
    await waitForText(page, "Danger zone");
    await clickButton(page, "Delete account…");
    await waitForText(page, "Delete your account?");
    await fill(page, "Type delete to confirm", "delete");
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="alertdialog"]');
      const button = [...(dialog?.querySelectorAll("button") ?? [])].find(
        (b) => b.textContent?.trim() === "Delete account",
      );
      if (button) window.__e2e.click(button);
    });
    await page.waitFor(
      (t: string) => Boolean(window.__e2e.byRole("dialog", t)),
      { args: [CONFIRM_DIALOG] as never[] },
    );
    const plainLook = await confirmText(page);
    check(
      "deleting with 2FA off offers an emailed code, no authenticator code",
      plainLook.includes("We'll email a 6-digit code") &&
        !plainLook.includes("authenticator"),
      plainLook.replace(/\s+/g, " ").slice(0, 160),
    );
    await shot(page, "19-delete-account-email-code");
    await confirmByEmail(page, USER_EMAIL);
    await landedOn(page, "/");
    await page.waitFor(() => location.pathname === "/");
    check(
      "without 2FA, deleted with the emailed confirmation code",
      (await session(page)) === null,
    );

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
        join(SHOTS, `fail-${RUN}.png`),
        Buffer.from(data, "base64"),
      );
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
