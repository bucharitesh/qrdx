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
//   passkey    a second account with a passkey (Chrome's virtual
//              authenticator): its prompt opens on its own after the email
//              code; the authenticator code and backup code still work from
//              "Use another method" links; the last method is remembered; a
//              browser that won't open the prompt gets a button; an assertion
//              without user verification is refused; "Don't ask again" works
//              for a passkey; /sign-in/two-factor too; and "Continue with
//              passkey", last on /sign-in, signs in on its own. (Google and
//              GitHub can't sign in locally; their callbacks end on the same
//              /sign-in/two-factor page.)
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
const PASSKEY_EMAIL = `e2e-2fa-passkey-${RUN}@qrdx.test`;

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

type SecondStep = "passkey" | "totp" | "backup";

/** The second step's method on screen, once it has loaded. */
async function secondStepShown(page: Page): Promise<SecondStep | "over"> {
  await page.waitFor(() =>
    Boolean(
      window.__e2e.byLabel("Authenticator code") ||
        window.__e2e.byLabel("Backup code") ||
        window.__e2e.byRole("button", "Continue with passkey") ||
        window.__e2e.byRole("button", "Sign in again"),
    ),
  );
  return (await page.evaluate(() =>
    window.__e2e.byLabel("Authenticator code")
      ? "totp"
      : window.__e2e.byLabel("Backup code")
        ? "backup"
        : window.__e2e.byRole("button", "Continue with passkey")
          ? "passkey"
          : "over",
  )) as SecondStep | "over";
}

const SWITCH_TO: Record<SecondStep, string> = {
  passkey: "Use your passkey",
  totp: "Use an authenticator code",
  backup: "Use a backup code",
};

/**
 * Shows `step` in the second step. It opens with the passkey or
 * authenticator code used last in this browser (a backup code is never
 * remembered), so the others are a click away ("Use a backup code").
 */
async function pickMethod(page: Page, step: SecondStep) {
  if ((await secondStepShown(page)) !== step) {
    await clickButton(page, SWITCH_TO[step]);
  }
}

async function enterTotp(page: Page, code: string) {
  await pickMethod(page, "totp");
  await fill(page, "Authenticator code", code);
}

async function landedOn(page: Page, path: string, timeout = 20_000) {
  await page.waitFor((p: string) => location.pathname.startsWith(p), {
    args: [path] as never[],
    timeout,
  });
}

// ─── A passkey as the second step ───────────────────────────────────────────

/** Chrome's virtual authenticator (internal, resident keys, PIN/biometrics). */
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
 * The same passkey on a new authenticator (Chrome allows one internal one at
 * a time), e.g. one that doesn't verify the person.
 */
async function swapAuthenticator(
  page: Page,
  current: string,
  options: { userVerified?: boolean },
): Promise<string> {
  const { credentials } = (await page.cdp.send("WebAuthn.getCredentials", {
    authenticatorId: current,
  })) as { credentials: unknown[] };
  await page.cdp.send("WebAuthn.removeVirtualAuthenticator", {
    authenticatorId: current,
  });
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

async function dialogOrMainText(page: Page) {
  return (await page.evaluate(
    () =>
      (
        (document.querySelector('[role="dialog"]') ??
          document.querySelector("main") ??
          document.body) as HTMLElement
      ).innerText,
  )) as string;
}

/**
 * Turns on two-step verification with an authenticator app in Settings and
 * adds a passkey (it asks for a current code). Settings' own flows, as on
 * this branch: e2e/passkeys.e2e.ts and the setup above cover them.
 */
async function setUpPasskeyAccount(page: Page) {
  await page.goto(`${BASE_URL}/settings/account#two-factor`);
  await waitForText(page, "Two-step verification");
  await clickButton(page, "Turn on");
  await waitForText(page, "Set up your authenticator app");
  const secret = (
    (await page.evaluate(
      () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
    )) as string
  ).replace(/\s+/g, "");
  await fill(page, "Code from your authenticator app", totp(secret));
  await waitForText(page, "Save these backup codes");
  const codes = (await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Backup codes"] li')].map(
      (li) => li.textContent?.trim() ?? "",
    ),
  )) as string[];
  await page.evaluate(() => {
    const box = window.__e2e.byLabel("I've saved my backup codes");
    if (box) window.__e2e.click(box);
  });
  await clickInDialog(page, "Done");
  await waitForText(page, "10 of 10 backup codes left");

  await page.goto(`${BASE_URL}/settings/account`);
  await clickButton(page, "Add passkey");
  await waitForText(page, "Add a passkey");
  await page.evaluate((code: string) => {
    const dialog = document.querySelector('[role="dialog"]');
    const input = window.__e2e.byLabel(
      "Code from your authenticator app, or a backup code",
      dialog ?? undefined,
    ) as HTMLInputElement;
    input.focus();
    window.__e2e.setValue(input, code);
  }, totp(secret));
  await clickInDialog(page, "Continue");
  await waitForText(page, "Passkey added");
  return { secret, backupCodes: codes };
}

const heading = (page: Page) =>
  page.evaluate(
    () =>
      document.querySelector('[role="dialog"] h2, main h1, h1')?.textContent ??
      "",
  ) as Promise<string>;

async function forgetSecondStep(page: Page) {
  await page.evaluate(() => {
    try {
      localStorage.removeItem("qrdx:second-step");
    } catch {}
  });
}

/** An assertion without user verification, sent to the second step as is. */
const FORGED_SECOND_STEP = `async () => {
  const b64 = (s) =>
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    );
  const enc = (buf) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\\+/g, "-")
      .replace(/\\//g, "_")
      .replace(/=+$/, "");
  const options = await (
    await fetch("/api/auth/two-factor/passkey/options", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
  ).json();
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: b64(options.challenge),
      rpId: options.rpId,
      allowCredentials: options.allowCredentials.map((c) => ({
        type: "public-key",
        id: b64(c.id),
      })),
      userVerification: "discouraged",
    },
  });
  const response = credential.response;
  const flags = new Uint8Array(response.authenticatorData)[32];
  const res = await fetch("/api/auth/two-factor/passkey/verify", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      response: {
        id: credential.id,
        rawId: enc(credential.rawId),
        type: credential.type,
        clientExtensionResults: {},
        response: {
          clientDataJSON: enc(response.clientDataJSON),
          authenticatorData: enc(response.authenticatorData),
          signature: enc(response.signature),
        },
      },
    }),
  });
  return {
    userVerifiedFlag: Boolean(flags & 0x04),
    status: res.status,
    body: await res.json().catch(() => null),
  };
}`;

/**
 * Its own account (2FA with an authenticator app, plus a passkey), so the
 * TOTP account's run above and below is unaffected. Leaves no
 * authenticator, cookie or remembered method behind.
 */
/**
 * A signed-out browser, from a blank page: clearing cookies under an open
 * app page makes it react (a redirect, a server action) while the next
 * navigation cuts it off, which logs errors that aren't the app's.
 */
async function leaveSignedIn(page: Page) {
  await page.goto("about:blank");
  await clearCookies(page);
}

async function passkeySecondStep(page: Page) {
  await leaveSignedIn(page);
  await page.cdp.send("WebAuthn.enable", { enableUI: false });
  let authenticatorId = await addAuthenticator(page);
  try {
    await emailCodeStep(page, PASSKEY_EMAIL);
    await landedOn(page, "/dashboard");
    await forgetSecondStep(page);
    const passkeyUser = (await session(page))?.user?.id ?? "";
    const { secret, backupCodes } = await setUpPasskeyAccount(page);
    const { credentials } = (await page.cdp.send("WebAuthn.getCredentials", {
      authenticatorId,
    })) as { credentials: unknown[] };
    check(
      "passkey: the account has 2FA and a passkey",
      Boolean(passkeyUser) && credentials.length === 1,
      `${credentials.length} credentials`,
    );

    // The prompt opens on its own after the email code (held open here).
    await leaveSignedIn(page);
    await holdPrompt(page, authenticatorId, true);
    await emailCodeStep(page, PASSKEY_EMAIL, "/settings/account");
    await waitForText(page, "Waiting for your passkey");
    const waiting = await dialogOrMainText(page);
    check(
      "passkey: after the email code the passkey prompt opens on its own",
      (await heading(page)) === "Use your passkey" &&
        waiting.includes("Use an authenticator code") &&
        waiting.includes("Use a backup code") &&
        waiting.includes("Don't ask again on this device") &&
        (await session(page)) === null,
      `${await heading(page)} | ${waiting.replace(/\s+/g, " ").slice(0, 200)}`,
    );
    await shot(page, "20-passkey-step-waiting");

    // "Use an authenticator code" closes the prompt; a code still works.
    await clickButton(page, "Use an authenticator code");
    await page.waitFor(() =>
      Boolean(window.__e2e.byLabel("Authenticator code")),
    );
    check(
      "passkey: the authenticator code is a click away",
      (await heading(page)) === "Open your authenticator app" &&
        (await dialogOrMainText(page)).includes("Use your passkey"),
      await heading(page),
    );
    await shot(page, "21-passkey-step-totp-fallback");
    await holdPrompt(page, authenticatorId, false);
    await enterTotp(page, totp(secret));
    await landedOn(page, "/settings/account");
    check(
      "passkey: an authenticator code still finishes it",
      (await session(page))?.user?.id === passkeyUser,
    );

    // The method used last is remembered: the code field first, no prompt.
    await leaveSignedIn(page);
    await emailCodeStep(page, PASSKEY_EMAIL, "/settings/account");
    check(
      "passkey: the last method (authenticator code) is preselected",
      (await secondStepShown(page)) === "totp",
    );
    await clickButton(page, "Use your passkey");
    await landedOn(page, "/settings/account");
    check(
      "passkey: switching to the passkey finishes it",
      (await session(page))?.user?.id === passkeyUser,
    );

    // Remembered again: the passkey opens and finishes on its own.
    await leaveSignedIn(page);
    await emailCodeStep(page, PASSKEY_EMAIL, "/settings/account");
    await landedOn(page, "/settings/account");
    check(
      "passkey: email code, then the passkey finishes it without a click",
      (await session(page))?.user?.id === passkeyUser,
    );

    // A backup code from the passkey screen, with format errors first.
    await leaveSignedIn(page);
    await holdPrompt(page, authenticatorId, true);
    await emailCodeStep(page, PASSKEY_EMAIL, "/settings/account");
    await waitForText(page, "Waiting for your passkey");
    await clickButton(page, "Use a backup code");
    await fill(page, "Backup code", "ABCD0-FGH2");
    await clickButton(page, "Verify");
    await waitForText(page, "Backup codes have 10 characters");
    await fill(page, "Backup code", "ABCD0-FGH23");
    await clickButton(page, "Verify");
    await waitForText(page, 'Backup codes never use "0"');
    check(
      "passkey: a mistyped backup code says what's wrong",
      (await session(page)) === null,
    );
    await shot(page, "22-backup-code-format-error");
    await holdPrompt(page, authenticatorId, false);
    await fill(page, "Backup code", backupCodes[0]);
    await clickButton(page, "Verify");
    await landedOn(page, "/settings/account");
    check(
      "passkey: a backup code still finishes it",
      (await session(page))?.user?.id === passkeyUser,
    );
    // The backup code isn't remembered: the passkey still opens first.
    const rememberedAfterBackup = await page.evaluate(() => {
      try {
        return localStorage.getItem("qrdx:second-step");
      } catch {
        return null;
      }
    });
    check(
      "passkey: a backup-code sign-in keeps the passkey as the remembered method",
      rememberedAfterBackup === "passkey",
      String(rememberedAfterBackup),
    );

    // A browser that won't verify the person: no error when the prompt
    // opened on its own (a button instead); an error after the click; and
    // a forged assertion without user verification is refused by the server.
    await forgetSecondStep(page);
    await leaveSignedIn(page);
    authenticatorId = await swapAuthenticator(page, authenticatorId, {
      userVerified: false,
    });
    await emailCodeStep(page, PASSKEY_EMAIL, "/settings/account");
    await page.waitFor(() => {
      const button = window.__e2e.byRole(
        "button",
        "Continue with passkey",
      ) as HTMLButtonElement | null;
      return Boolean(button && !button.disabled);
    });
    await sleep(500);
    const quiet = await dialogOrMainText(page);
    check(
      "passkey: a prompt the browser won't open shows a button, not an error",
      quiet.includes(
        "Use Touch ID, Face ID, Windows Hello or a security key",
      ) && (await session(page)) === null,
      quiet.replace(/\s+/g, " ").slice(0, 200),
    );
    await shot(page, "23-passkey-step-button");
    await clickButton(page, "Continue with passkey");
    await waitForText(page, "The passkey prompt was closed or timed out");
    await shot(page, "24-passkey-step-closed");
    const forged = (await page.evaluate(FORGED_SECOND_STEP as never)) as {
      userVerifiedFlag: boolean;
      status: number;
      body: { code?: string } | null;
    };
    check(
      "passkey: an assertion without user verification is refused",
      !forged.userVerifiedFlag &&
        forged.status === 401 &&
        forged.body?.code === "PASSKEY_USER_VERIFICATION_REQUIRED" &&
        (await session(page)) === null,
      JSON.stringify(forged),
    );
    authenticatorId = await swapAuthenticator(page, authenticatorId, {
      userVerified: true,
    });
    // The forged request above used up the page's WebAuthn request (as
    // another tab would): the first answer is turned away, with fresh
    // options ready for the next click.
    await clickButton(page, "Continue with passkey");
    await waitForText(page, "That passkey request expired. Try again.");
    await page.waitFor(() => {
      const button = window.__e2e.byRole(
        "button",
        "Continue with passkey",
      ) as HTMLButtonElement | null;
      return Boolean(button && !button.disabled);
    });
    await clickButton(page, "Continue with passkey");
    await landedOn(page, "/settings/account");
    check(
      "passkey: the button finishes it",
      (await session(page))?.user?.id === passkeyUser,
    );

    // "Don't ask again on this device" with a passkey.
    await leaveSignedIn(page);
    await holdPrompt(page, authenticatorId, true);
    await emailCodeStep(page, PASSKEY_EMAIL, "/settings/account");
    await waitForText(page, "Waiting for your passkey");
    await page.evaluate(() => {
      const box = window.__e2e.byLabel("Don't ask again on this device");
      if (box) window.__e2e.click(box);
    });
    await clickButton(page, "Use an authenticator code");
    await holdPrompt(page, authenticatorId, false);
    await clickButton(page, "Use your passkey");
    await landedOn(page, "/settings/account");
    const trusted = (await page.cdp.send("Network.getCookies", {
      urls: [BASE_URL],
    })) as { cookies: { name: string }[] };
    check(
      "passkey: 'Don't ask again' trusts the device",
      trusted.cookies.some((c) => c.name.endsWith("trust_device")),
    );
    await signOutKeepingCookies(page);
    await emailCodeStep(page, PASSKEY_EMAIL);
    await landedOn(page, "/dashboard");
    check(
      "passkey: a device trusted with a passkey isn't asked again",
      (await session(page))?.user?.id === passkeyUser,
    );

    // /sign-in/two-factor (Google, GitHub and SSO land here).
    await leaveSignedIn(page);
    await page.goto(`${BASE_URL}/sign-in`);
    check(
      "passkey: a JSON sign-in answers twoFactorRedirect",
      await startPendingChallenge(page, PASSKEY_EMAIL),
    );
    await holdPrompt(page, authenticatorId, true);
    await page.goto(
      `${BASE_URL}/sign-in/two-factor?next=%2Fsettings%2Faccount`,
    );
    await waitForText(page, "Waiting for your passkey");
    check(
      "passkey: the challenge page opens the prompt too",
      (await heading(page)) === "Use your passkey",
      await heading(page),
    );
    await shot(page, "25-challenge-page-passkey");
    await clickButton(page, "Use a backup code");
    await holdPrompt(page, authenticatorId, false);
    await clickButton(page, "Use your passkey");
    await landedOn(page, "/settings/account");
    check(
      "passkey: the challenge page finishes it and opens next",
      (await session(page))?.user?.id === passkeyUser,
    );

    // The sign-in dialog over a page (the email code's second step there).
    await leaveSignedIn(page);
    await page.goto(`${BASE_URL}/playground`);
    await page.waitFor(() =>
      Boolean(window.__e2e.byRole("button", "Sign in", { exact: true })),
    );
    await rejectCookies(page);
    await clickButton(page, "Sign in");
    await page.waitFor(() =>
      Boolean(document.querySelector('[role="dialog"] input[type="email"]')),
    );
    const dialogSince = logSize();
    await fill(page, "Email address", PASSKEY_EMAIL);
    await clickInDialog(page, "Email me a code");
    const [, dialogCode] = await waitForLogLine(
      new RegExp(`sign-in code for ${escapeRegExp(PASSKEY_EMAIL)}: (\\d{6})`),
      dialogSince,
    );
    await holdPrompt(page, authenticatorId, true);
    await fill(page, "Sign-in code", dialogCode);
    await waitForText(page, "Waiting for your passkey");
    check(
      "passkey: the sign-in dialog asks for the passkey too",
      (await page.evaluate(
        () => document.querySelector('[role="dialog"] h2')?.textContent ?? "",
      )) === "Use your passkey" && (await session(page)) === null,
    );
    await shot(page, "27-dialog-passkey-step");
    await clickInDialog(page, "Use an authenticator code");
    await holdPrompt(page, authenticatorId, false);
    await clickInDialog(page, "Use your passkey");
    await page.waitFor(() => !document.querySelector('[role="dialog"]'), {
      timeout: 20_000,
    });
    check(
      "passkey: the dialog's passkey step signs in and closes",
      (await session(page))?.user?.id === passkeyUser,
    );

    // "Continue with passkey" on /sign-in: last, no autofill, both steps.
    await leaveSignedIn(page);
    await page.goto(`${BASE_URL}/sign-in?next=%2Fsettings%2Faccount`);
    await waitForText(page, "Continue with passkey");
    await rejectCookies(page);
    const layout = (await page.evaluate(() => {
      const labels = [
        ...document.querySelectorAll("main button, main input"),
      ].map(
        (el) =>
          (el as HTMLElement).innerText?.trim() ||
          el.getAttribute("autocomplete") ||
          "",
      );
      return {
        labels,
        autocomplete:
          document
            .querySelector('input[type="email"]')
            ?.getAttribute("autocomplete") ?? null,
      };
    })) as { labels: string[]; autocomplete: string | null };
    const passkeyAt = layout.labels.indexOf("Continue with passkey");
    const ssoAt = layout.labels.indexOf("Sign in with SSO");
    const emailAt = layout.labels.indexOf("Email me a code");
    check(
      "passkey: 'Continue with passkey' is the last way in",
      passkeyAt > emailAt &&
        (ssoAt === -1 || passkeyAt > ssoAt) &&
        passkeyAt === layout.labels.length - 1,
      layout.labels.join(" | "),
    );
    check(
      "passkey: the email field doesn't offer passkeys (no webauthn autofill)",
      layout.autocomplete === "email",
      String(layout.autocomplete),
    );
    await shot(page, "26-sign-in-page");
    await clickButton(page, "Continue with passkey");
    await landedOn(page, "/settings/account");
    check(
      "passkey: 'Continue with passkey' signs in on its own (both steps)",
      (await session(page))?.user?.id === passkeyUser,
    );
    await signOutKeepingCookies(page);
    await page.goto(`${BASE_URL}/sign-in`);
    await waitForText(page, "Continue with passkey");
    const lastUsed = await page.evaluate(() => {
      const button = window.__e2e.byRole("button", "Continue with passkey");
      return Boolean(button?.parentElement?.textContent?.includes("Last used"));
    });
    check("passkey: the passkey button says 'Last used'", lastUsed);
  } finally {
    await page.cdp
      .send("WebAuthn.removeVirtualAuthenticator", { authenticatorId })
      .catch(() => undefined);
    await page.cdp.send("WebAuthn.disable").catch(() => undefined);
    await forgetSecondStep(page).catch(() => undefined);
    await leaveSignedIn(page);
  }
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
    await waitForText(page, "Set up your authenticator app");
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
    await waitForText(page, "Save these backup codes");
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
    await waitForText(page, "10 of 10 backup codes left");
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
    await pickMethod(page, "backup");
    await fill(page, "Backup code", backupCodes[0]);
    await shot(page, "09-backup-code-step");
    await clickButton(page, "Verify");
    await landedOn(page, "/dashboard");
    check("a backup code signs in", (await session(page))?.user?.id === userId);

    await clearCookies(page);
    await emailCodeStep(page, USER_EMAIL);
    await waitForText(page, "Your account asks for a second step");
    await pickMethod(page, "backup");
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
    check(
      "a backup-code sign-in isn't remembered: the next one opens on the authenticator code",
      (await secondStepShown(page)) === "totp",
    );
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

    // ── passkey as the second step (its own account) ──
    await passkeySecondStep(page);

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
    await waitForText(page, "backup codes left");
    const leftText = await pageText(page);
    check(
      "settings count used backup codes",
      leftText.includes("8 of 10 backup codes left"),
    );

    // ── changing the email needs a current code too ──
    // Moved to a new address and back, so the rest of the run signs in as
    // before. A wrong authenticator code changes nothing and leaves the
    // emailed code usable.
    const movedEmail = `e2e-2fa-moved-${RUN}@qrdx.test`;
    const moves: [to: string, back: boolean][] = [
      [movedEmail, false],
      [USER_EMAIL, true],
    ];
    for (const [index, [to, back]] of moves.entries()) {
      await page.goto(`${BASE_URL}/settings/account`);
      await clickButton(page, "Change");
      await waitForText(page, "Change your email");
      const since = logSize();
      await fill(page, "New email", to);
      await clickInDialog(page, "Send code");
      const [, emailed] = await waitForLogLine(
        new RegExp(`email-change code for ${escapeRegExp(to)}: (\\d{6})`),
        since,
      );
      await waitForText(page, "Code from your authenticator app");
      await fill(page, "Code from the new address", emailed);
      if (index === 0) {
        const waits = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const button = [...(dialog?.querySelectorAll("button") ?? [])].find(
            (b) => b.textContent?.trim() === "Change email",
          );
          return button?.disabled === true;
        });
        check("Change email waits for an authenticator code", waits);
        await fill(
          page,
          "Code from your authenticator app, or a backup code",
          wrongCode(secret),
        );
        await shot(page, "13a-change-email-code");
        await clickInDialog(page, "Change email");
        await waitForText(
          page,
          "That code isn't right. Try a new code from your app.",
        );
        await shot(page, "13b-change-email-wrong-code");
        check(
          "a wrong authenticator code doesn't change the email",
          (await session(page))?.user?.email === USER_EMAIL,
        );
      }
      await fill(
        page,
        "Code from your authenticator app, or a backup code",
        totp(secret),
      );
      await clickInDialog(page, "Change email");
      await waitForText(page, `Your email is now ${to}`);
      check(
        back
          ? "and back again, with the same check"
          : "an authenticator code with the emailed code changes the email",
        (await session(page))?.user?.email === to,
      );
      // Closed (and done animating) before the next dialog is measured.
      await page.waitFor(() => !document.querySelector('[role="dialog"]'));
    }

    let noticeSince = logSize();
    await clickButton(page, "New backup codes");
    await waitForText(page, "Make new backup codes?");
    await fill(
      page,
      "Code from your authenticator app, or a backup code",
      "000000",
    );
    await shot(page, "13-verify-dialog");
    await clickInDialog(page, "Make new codes");
    await page.waitFor(() =>
      /isn't right|Too many/.test(document.body.innerText),
    );
    await fill(
      page,
      "Code from your authenticator app, or a backup code",
      totp(secret),
    );
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
    await waitForText(page, "10 of 10 backup codes left");

    noticeSince = logSize();
    await clickButton(page, "Turn off");
    await waitForText(page, "Turn off two-step verification?");
    await fill(
      page,
      "Code from your authenticator app, or a backup code",
      fresh[0],
    );
    await shot(page, "14-turn-off-dialog");
    await clickInDialog(page, "Turn off");
    await page.waitFor(() =>
      document.querySelector("#two-factor")?.textContent?.includes("Off"),
    );
    check("turned off with a backup code", true);
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
    await waitForText(page, "Set up your authenticator app");
    secret = (
      (await page.evaluate(
        () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
      )) as string
    ).replace(/\s+/g, "");
    await fill(page, "Code from your authenticator app", totp(secret));
    await waitForText(page, "Save these backup codes");

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
    await waitForText(page, "Set up your authenticator app");
    secret = (
      (await page.evaluate(
        () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
      )) as string
    ).replace(/\s+/g, "");
    await fill(page, "Code from your authenticator app", totp(secret));
    await waitForText(page, "Save these backup codes");
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
    await waitForText(page, "10 of 10 backup codes left");

    // With 2FA on, one authenticator or backup code replaces the emailed
    // code: no "Email me a code" step, and no code is sent.
    await clickButton(page, "Delete account…");
    await waitForText(page, "Delete your account?");
    const deleteSince = logSize();
    const dialogText = () =>
      page.evaluate(
        () =>
          (document.querySelector('[role="alertdialog"]') as HTMLElement | null)
            ?.innerText ?? "",
      ) as Promise<string>;
    const firstLook = await dialogText();
    check(
      "deleting with 2FA on has no emailed-code step",
      firstLook.includes(
        "Code from your authenticator app, or a backup code",
      ) &&
        !firstLook.includes("Email me a code") &&
        !firstLook.includes("Code from your email"),
      firstLook.replace(/\s+/g, " ").slice(0, 160),
    );
    await fill(page, "Type delete to confirm", "delete");
    const deleteDisabled = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('[role="alertdialog"]');
        const button = [...(dialog?.querySelectorAll("button") ?? [])].find(
          (b) => b.textContent?.trim() === "Delete account",
        ) as HTMLButtonElement | undefined;
        return button?.disabled ?? null;
      });
    const clickDelete = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('[role="alertdialog"]');
        const button = [...(dialog?.querySelectorAll("button") ?? [])].find(
          (b) => b.textContent?.trim() === "Delete account",
        );
        if (button) window.__e2e.click(button);
      });
    check(
      "deleting waits for an authenticator or backup code",
      (await deleteDisabled()) === true,
    );
    await fill(
      page,
      "Code from your authenticator app, or a backup code",
      wrongCode(secret),
    );
    await shot(page, "17-delete-account-two-factor");
    await clickDelete();
    await waitForText(page, "That code isn't right");
    check(
      "a wrong authenticator code stops the deletion",
      (await session(page))?.user?.id === userId,
    );
    await shot(page, "18-delete-account-wrong-code");
    await fill(
      page,
      "Code from your authenticator app, or a backup code",
      totp(secret),
    );
    await clickDelete();
    await landedOn(page, "/");
    await page.waitFor(() => location.pathname === "/");
    check(
      "deleted with only an authenticator code",
      (await session(page)) === null,
    );
    const deletionLog = readFileSync(DEV_LOG)
      .subarray(deleteSince)
      .toString("utf8");
    check(
      "no email code was sent for the deletion",
      !new RegExp(`sign-in code for ${escapeRegExp(USER_EMAIL)}:`).test(
        deletionLog,
      ),
    );
    // A request for an emailed code from a 2FA account is refused too
    // (the action behind "Email me a code"; covered in
    // tests/lib/account-delete-two-factor.test.ts).

    // Signing in with the address now makes a new account, without 2FA.
    await emailCodeStep(page, USER_EMAIL);
    await landedOn(page, "/dashboard");
    const after = await session(page);
    check(
      "the old account is gone (a new one, without 2FA)",
      Boolean(after?.user?.id) && after?.user?.id !== userId,
    );

    // With 2FA off, deleting still asks for the emailed code.
    await page.goto(`${BASE_URL}/settings/account#danger`);
    await waitForText(page, "Danger zone");
    await clickButton(page, "Delete account…");
    await waitForText(page, "Delete your account?");
    const plainLook = await dialogText();
    check(
      "deleting with 2FA off asks for an emailed code, no authenticator code",
      plainLook.includes("Email me a code") &&
        !plainLook.includes("authenticator app"),
      plainLook.replace(/\s+/g, " ").slice(0, 160),
    );
    await fill(page, "Type delete to confirm", "delete");
    const plainSince = logSize();
    await clickInDialog(page, "Email me a code");
    const [, plainCode] = await waitForLogLine(
      new RegExp(`sign-in code for ${escapeRegExp(USER_EMAIL)}: (\\d{6})`),
      plainSince,
    );
    await page.evaluate((v: string) => {
      const input = document.querySelector(
        '[role="alertdialog"] input[aria-labelledby]',
      );
      if (!input) return;
      (input as HTMLInputElement).focus();
      window.__e2e.setValue(input, v);
    }, plainCode);
    await shot(page, "19-delete-account-email-code");
    await clickDelete();
    await landedOn(page, "/");
    await page.waitFor(() => location.pathname === "/");
    check(
      "without 2FA, deleted with the emailed code",
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
