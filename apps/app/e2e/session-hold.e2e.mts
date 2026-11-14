// The stolen-session check (lib/account/session-origin.ts, packages/auth/
// session-origin.ts), end to end against a running dev server and a
// THROWAWAY local database, over the Chrome DevTools Protocol. The browser's
// user agent and the platform's country header are set per step, as if the
// same session cookie were used from different places. It writes to the
// database (test users), so it refuses to run unless DATABASE_URL in
// .env.local points at localhost.
//
//   bun x next dev -p <port> > <dev.log>   (CSP_DEV=1 to check the CSP)
//
//   SESSION_E2E_BASE_URL=http://localhost:<port> SESSION_E2E_DEV_LOG=<dev.log> \
//   SESSION_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   SESSION_E2E_SHOTS=<dir> bun x tsx e2e/session-hold.e2e.mts
//
// Covers: a sign-in records its country and browser; travel alone or a new
// browser alone changes nothing; both at once send every app page to the
// check, where "Confirm it's you" opens over a blank page and says why;
// meanwhile the browser reads as signed out and Better Auth's endpoints
// refuse it; cancelling leaves a way back in and a way out; confirming with
// an emailed code goes back to the page and makes the new place the
// session's own (and the old one then asks); signing out from the check
// ends the session; admin pages are checked too. Screenshots of each new
// screen in light and dark, desktop and phone.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cspEnforced, launch, recordCspViolations, sleep } from "./cdp.mjs";

const BASE = (process.env.SESSION_E2E_BASE_URL ?? "").replace(/\/$/, "");
const DEV_LOG = process.env.SESSION_E2E_DEV_LOG ?? "";
const PSQL = process.env.SESSION_E2E_PSQL ?? "";
const SHOTS = process.env.SESSION_E2E_SHOTS ?? "";
const RUN = Date.now().toString(36);

for (const [name, value] of Object.entries({ BASE, DEV_LOG, PSQL })) {
  if (!value)
    throw new Error(`Set SESSION_E2E_${name === "BASE" ? "BASE_URL" : name}`);
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

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// The country header the app reads (lib/request-geo.ts).
const COUNTRY_HEADER = "cf-ipcountry";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const CHROME_MAC_UPDATED =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7012.88 Safari/537.36";
const FIREFOX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";

const browser = await launch({ width: 1280, height: 900 });
const { cdp, evaluate, goto, waitFor } = browser;
const csp = await recordCspViolations(browser);
const cspOn = await cspEnforced(BASE);
await cdp.send("Network.enable");

/** Every request from here on comes with this user agent and country. */
async function at(userAgent: string, country: string | null) {
  await cdp.send("Network.setUserAgentOverride", { userAgent });
  await cdp.send("Network.setExtraHTTPHeaders", {
    headers: country ? { [COUNTRY_HEADER]: country } : {},
  });
}

async function viewport(width: number, height: number, mobile: boolean) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
  });
}

async function dismissCookieBanner() {
  await evaluate(() => {
    if (document.querySelector('[role="dialog"]')) return;
    const reject = window.__e2e.byRole("button", "Reject all", { exact: true });
    if (reject) window.__e2e.click(reject);
  });
  await sleep(300);
}

async function shot(name: string) {
  if (!SHOTS) return;
  await dismissCookieBanner();
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
    await sleep(400);
    const captured = (await Promise.race([
      cdp.send("Page.captureScreenshot", { format: "png" }),
      sleep(15_000).then(() => null),
    ])) as { data: string } | null;
    if (!captured) {
      console.log(`  (screenshot ${name}-${scheme} timed out)`);
      continue;
    }
    writeFileSync(
      join(SHOTS, `${name}-${scheme}.png`),
      Buffer.from(captured.data, "base64"),
    );
  }
  await evaluate(() => document.documentElement.classList.remove("dark"));
}

const href = () => evaluate(() => location.href as string);
const path = async () => {
  const url = new URL(await href());
  return `${url.pathname}${url.search}`;
};
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

/** A code from the dev log written after `since` (a byte offset). */
async function codeSince(pattern: RegExp, since: number): Promise<string> {
  for (let i = 0; i < 80; i++) {
    const log = readFileSync(DEV_LOG).subarray(since).toString("utf8");
    const found = log.match(pattern)?.[1];
    if (found) return found;
    await sleep(250);
  }
  throw new Error(`Nothing in the dev log matching ${pattern}`);
}
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Email-code sign-in through the same endpoints the panel calls. */
async function emailSignIn(email: string) {
  await cdp.send("Network.clearBrowserCookies");
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
  const otp = await codeSince(
    new RegExp(`sign-in code for ${escapeRegExp(email)}: (\\d{6})`),
    since,
  );
  const status = await evaluate(
    async (e: string, code: string) => {
      const r = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, otp: code }),
      });
      return r.status;
    },
    email,
    otp,
  );
  if (status !== 200) throw new Error(`sign in ${status}`);
}

const sessionRow = (email: string) =>
  sql(
    `select s.id, s.user_agent from session s join "user" u on u.id = s.user_id where u.email = ${q(email)} order by s.created_at desc limit 1`,
  ).split("|");
const originOf = (sessionId: string) =>
  sql(
    `select value from verification where identifier = ${q(`qrdx-session-origin-${sessionId}`)} and expires_at > now()`,
  );

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
const clickButton = (label: string) =>
  waitFor(
    (l: string) => {
      if (document.querySelector('[role="dialog"]')) return false;
      const button = window.__e2e.byRole("button", l, { exact: true });
      if (!button || (button as HTMLButtonElement).disabled) return false;
      window.__e2e.click(button);
      return true;
    },
    { args: [label] as never[] },
  );
const dialogGone = () =>
  waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
    args: [CONFIRM] as never[],
  });

async function confirmByEmail(email: string) {
  if (!(await confirmAsked(20_000))) throw new Error(`${CONFIRM} didn't open`);
  const since = statSync(DEV_LOG).size;
  await clickInConfirm("Send code");
  const code = await codeSince(
    new RegExp(`confirmation code for ${escapeRegExp(email)}: (\\d{6})`),
    since,
  );
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
}

/** What the browser's own requests get while it's held. */
async function apiFromHere() {
  return evaluate(async () => {
    const session = await fetch("/api/auth/get-session").then((r) => r.json());
    const list = await fetch("/api/auth/list-sessions");
    const listBody = await list.json().catch(() => null);
    const settings = await fetch("/settings/account");
    return {
      session,
      listStatus: list.status,
      listCode: listBody?.code ?? null,
      settingsUrl: new URL(settings.url).pathname,
    };
  });
}

try {
  const email = `hold-${RUN}@qrdx.test`;

  console.log("Signing in records where");
  await at(CHROME_MAC, "IN");
  await emailSignIn(email);
  const [sessionId, startedUa] = sessionRow(email);
  check("the session's browser is the sign-in's", startedUa === CHROME_MAC);
  check("its country is the sign-in's", originOf(sessionId) === "IN");
  const logStart = statSync(DEV_LOG).size;
  await goto(`${BASE}/dashboard`);
  await waitFor(() => /^\/dashboard\/[^/]+/.test(location.pathname));
  // Answered once here, so the banner stays out of the check's screenshots.
  await dismissCookieBanner();
  const workspacePath = new URL(await href()).pathname
    .split("/")
    .slice(0, 3)
    .join("/");
  check(
    "the dashboard opens",
    workspacePath.startsWith("/dashboard/"),
    workspacePath,
  );
  const codesPath = `${workspacePath}/codes`;

  console.log("One change alone isn't enough");
  await at(CHROME_MAC_UPDATED, "US");
  await goto(`${BASE}${codesPath}`);
  check(
    "travel with the same browser, updated",
    (await path()) === codesPath,
    await path(),
  );
  await at(FIREFOX_WINDOWS, "IN");
  await goto(`${BASE}${codesPath}`);
  check(
    "a new browser in the same country",
    (await path()) === codesPath,
    await path(),
  );
  await at(FIREFOX_WINDOWS, null);
  await goto(`${BASE}${codesPath}`);
  check(
    "a new browser where the country is unknown",
    (await path()) === codesPath,
    await path(),
  );

  console.log("Both at once: the check");
  await at(FIREFOX_WINDOWS, "US");
  const target = `${codesPath}?view=grid`;
  await goto(`${BASE}${target}`, { wait: 2500 });
  const checkPath = `/session-check?next=${encodeURIComponent(target)}`;
  check(
    "the page goes to the check, and back after",
    (await path()) === checkPath,
    await path(),
  );
  check("Confirm it's you opens by itself", await confirmAsked());
  const text = await dialogText();
  check(
    "it says what it's for",
    text.includes("Before you continue, we need to check it's you."),
    text.slice(0, 120),
  );
  await evaluate((t: string) => {
    const dialog = window.__e2e.byRole("dialog", t);
    const why = dialog
      ? window.__e2e.byRole("button", "Why am I asked?", {
          exact: true,
          root: dialog,
        })
      : null;
    if (why) window.__e2e.click(why);
  }, CONFIRM);
  await sleep(400);
  check(
    "and why",
    (await dialogText()).includes("different country and a different browser"),
  );
  const behind = await evaluate(
    // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
    () => document.querySelector("main")?.innerText ?? "",
  );
  check(
    "nothing of the app behind it",
    !/Codes|Analytics|Dashboard/i.test(behind),
    behind.slice(0, 80),
  );
  await shot("check-dialog-desktop");

  const api = await apiFromHere();
  check("the browser reads as signed out", api.session === null);
  check(
    "Better Auth's other endpoints refuse it",
    api.listStatus === 403 && api.listCode === "CONFIRMATION_REQUIRED",
    `${api.listStatus} ${api.listCode}`,
  );
  check(
    "other app pages go to the check too",
    api.settingsUrl === "/session-check",
    api.settingsUrl,
  );

  console.log("Cancelling");
  await clickInConfirm("Cancel");
  await dialogGone();
  check("the page offers a way back in", await waitText("Continue"));
  check("and a way out", await waitText("Sign out"));
  await shot("check-card-desktop");

  console.log("On a phone");
  await viewport(390, 844, true);
  await goto(`${BASE}${checkPath}`, { wait: 2500 });
  check("the check opens on a phone", await confirmAsked());
  await shot("check-dialog-phone");
  await clickInConfirm("Cancel");
  await dialogGone();
  await shot("check-card-phone");
  await viewport(1280, 900, false);
  await goto(`${BASE}${checkPath}`, { wait: 2500 });
  await confirmAsked();
  await clickInConfirm("Cancel");
  await dialogGone();

  console.log("Confirming");
  await clickButton("Continue");
  await confirmByEmail(email);
  await waitFor((p: string) => `${location.pathname}${location.search}` === p, {
    args: [target] as never[],
    timeout: 30_000,
  }).catch(() => null);
  check("it goes back to the page", (await path()) === target, await path());
  const [, movedUa] = sessionRow(email);
  check("the session's browser is now this one", movedUa === FIREFOX_WINDOWS);
  check("and its country", originOf(sessionId) === "US");
  const after = await apiFromHere();
  check("the browser is signed in again", after.session !== null);
  check(
    "and Better Auth answers it",
    after.listStatus === 200,
    String(after.listStatus),
  );

  console.log("Back where it started, both changed again");
  await at(CHROME_MAC, "IN");
  await goto(`${BASE}${workspacePath}`, { wait: 2500 });
  check(
    "the check asks again",
    (await path()) ===
      `/session-check?next=${encodeURIComponent(workspacePath)}`,
    await path(),
  );
  await confirmAsked();
  await clickInConfirm("Cancel");
  await dialogGone();
  await clickButton("Sign out");
  await waitFor(() => location.pathname === "/sign-in", {
    timeout: 20_000,
  }).catch(() => null);
  check(
    "signing out from the check goes to sign in",
    (await path()).startsWith("/sign-in"),
    await path(),
  );
  check(
    "and ends the session",
    sql(`select count(*) from session where id = ${q(sessionId)}`) === "0",
  );

  console.log("Admin pages");
  await at(CHROME_MAC, "IN");
  await emailSignIn("admin@qrdx.test");
  await at(FIREFOX_WINDOWS, "US");
  await goto(`${BASE}/admin/users`, { wait: 2500 });
  check(
    "are checked too",
    (await path()) === "/session-check?next=%2Fadmin%2Fusers",
    await path(),
  );
  await cdp.send("Network.clearBrowserCookies");

  const serverLog = readFileSync(DEV_LOG).subarray(logStart).toString("utf8");
  const guardLines = serverLog
    .split("\n")
    .filter((line) => line.includes('"auth.session_origin"'));
  check(
    "the server logged the holds, with no ids or addresses",
    guardLines.length > 0 &&
      guardLines.every(
        (line) => !line.includes(sessionId) && !line.includes("@"),
      ),
    `${guardLines.length} lines`,
  );
  check(
    "the reader was there from the start",
    !serverLog.includes('"no-reader"'),
  );

  const cspResult = csp.result(cspOn);
  if (cspResult.skipped) console.log(`  (CSP: ${cspResult.note})`);
  else check("no CSP violations", cspResult.ok, cspResult.lines.join("\n"));
  check(
    "no page errors",
    browser.consoleErrors.length === 0,
    browser.consoleErrors.join("\n").slice(0, 400),
  );
} catch (error) {
  failures++;
  console.log(`  ✗ ${(error as Error).stack ?? error}`);
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);
