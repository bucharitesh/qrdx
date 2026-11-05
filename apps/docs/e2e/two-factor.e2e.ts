// Two-step verification end to end, in headless Chrome against a running dev
// server and its local database (CDP, no Playwright; see ./cdp.mjs):
//
//   setup      sign up with an email code, turn it on in Settings (QR code,
//              key, first code, backup codes saved)
//   challenge  email-code sign-in asks for a code; a TOTP finishes it
//   wrong      5 wrong codes end the challenge ("Sign in again")
//   backup     a backup code works once and only once
//   trust      "Don't ask again on this device" skips the next challenge
//   page       /sign-in/two-factor (where Google, GitHub and SSO land) finishes
//              a pending challenge and returns to `next`; without one it says
//              to sign in again
//   plain      someone without 2FA is never asked
//   manage     new backup codes and turning it off need a current code
//   admin      an admin turns it off from the user's 360 page (audited)
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
import { findChrome, launch, serverIsUp, sleep } from "./cdp.mjs";

const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const DEV_LOG = process.env.E2E_DEV_LOG ?? "";
const SHOTS = process.env.E2E_SHOTS ?? "";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@qrdx.test";
const RUN = Date.now().toString(36);
const USER_EMAIL = `e2e-2fa-${RUN}@qrdx.test`;
const PLAIN_EMAIL = `e2e-plain-${RUN}@qrdx.test`;

type Page = Awaited<ReturnType<typeof launch>>;

/** cdp.mjs installs these in every page (PAGE_HELPERS). */
declare global {
  interface Window {
    __e2e: {
      byRole: (
        role: string,
        name: string,
        options?: { exact?: boolean },
      ) => HTMLElement | null;
      byLabel: (text: string) => HTMLElement | null;
      click: (element: Element) => void;
      setValue: (element: Element, value: string) => void;
    };
  }
}

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

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
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
    const dialog = document.querySelector('[role="dialog"]');
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
    await fill(page, "Backup code", backupCodes[1].replace("-", ""));
    await clickButton(page, "Verify");
    await landedOn(page, "/dashboard");
    check(
      "another backup code (typed without the dash) works",
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
    await waitForText(page, "backup codes left");
    const leftText = await pageText(page);
    check(
      "settings count used backup codes",
      leftText.includes("8 of 10 backup codes left"),
    );

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

  console.log(`\n${results.length - failures} passed, ${failures} failed`);
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
