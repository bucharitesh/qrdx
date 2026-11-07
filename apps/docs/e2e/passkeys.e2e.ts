// Settings → Two-step verification and "Confirm it's you" end to end against
// a running dev server, in headless Chrome with a CDP virtual authenticator
// (WebAuthn domain), no Playwright:
//
//   sign up with an email code → Turn on → "Confirm it's you" with an
//   emailed code → the stepper: Passkey → name → browser prompt → backup
//   codes → on, passkeys only (TOTP refused, no authenticator option to
//   confirm with) → add the authenticator app as a second method (no new
//   codes, no second confirmation within 10 minutes) → rename a passkey →
//   new backup codes, confirmed with the passkey → remove the app,
//   confirmed with an authenticator code after "Use another method" → remove
//   the last passkey (the dialog says it turns off) → turn on again with the
//   app first (the session swap keeps the confirmation) → add a passkey →
//   turn off (passkeys stay) → "Your passkey is ready" → turn on with it →
//   change the email and delete the account, each through the dialog.
//   The management endpoints are checked to be off over HTTP. Screenshots
//   of each screen, light and dark, go to E2E_SHOTS.
//
//   E2E_BASE_URL=http://localhost:3230 \
//   E2E_CODE_LOG=<the dev server's log file> \
//   E2E_SHOTS=<directory> \
//   E2E_DB_SQL='<command that runs SQL on the LOCAL database, reading stdin>' \
//   [E2E_MOBILE=1] pnpm --filter docs test:e2e:passkeys
//
// Codes are only printed by `next dev` (never emailed there), so this runs
// against a local dev server only; it skips (exit 0) without a server,
// Chrome or E2E_CODE_LOG. E2E_DB_SQL ends confirmations early ("10 minutes
// later") and reads the two_factor row; without it those checks are
// skipped and say so. Each run signs up a new passkey-e2e-<run>@qrdx.test
// account. Signing in with a passkey and the passkey second step are
// e2e/two-factor.e2e.ts's.

/** biome-ignore-all lint/performance/useDomNodeTextContent: checks must only match text a person can see */
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const CODE_LOG = process.env.E2E_CODE_LOG;
const SHOTS = process.env.E2E_SHOTS;
/**
 * E2E_MOBILE=1: a 390 x 844 phone (deviceScaleFactor 2, mobile, touch).
 * Every screenshot then also checks the layout (LAYOUT_CHECK below).
 */
const MOBILE = process.env.E2E_MOBILE === "1";
const DB_SQL = process.env.E2E_DB_SQL;
const RUN = Date.now().toString(36);
const EMAIL = `passkey-e2e-${RUN}@qrdx.test`;
const NEW_EMAIL = `passkey-e2e-${RUN}-new@qrdx.test`;
const CONFIRM = "Confirm it's you";

// The authenticator app (RFC 6238, SHA-1, 6 digits, 30 s), as in
// e2e/two-factor.e2e.ts.
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

type Page = Awaited<ReturnType<typeof launch>>;

const results: { name: string; ok: boolean; detail?: string }[] = [];

/** Set once the browser is up: what a failed step leaves on screen. */
let onFailure: ((name: string) => Promise<void>) | null = null;

async function step(name: string, fn: () => Promise<true | string>) {
  let ok = false;
  try {
    const outcome = await fn();
    ok = outcome === true;
    results.push({
      name,
      ok,
      detail: outcome === true ? undefined : outcome,
    });
    console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : ` — ${outcome}`}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  ✗ ${name} — ${detail}`);
  }
  if (!ok && onFailure) await onFailure(name).catch(() => {});
  return ok;
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The last code of a kind the dev server logged for an address. */
function latestLogged(kind: string, email: string): string | null {
  if (!CODE_LOG) return null;
  const log = readFileSync(CODE_LOG, "utf8");
  const pattern = new RegExp(
    `QRdx ${kind} for ${escapeRegExp(email)}: (\\d{6})`,
    "g",
  );
  let code: string | null = null;
  for (const match of log.matchAll(pattern)) code = match[1];
  return code;
}

async function nextLogged(
  kind: string,
  email: string,
  previous: string | null,
): Promise<string> {
  for (let i = 0; i < 80; i++) {
    const latest = latestLogged(kind, email);
    if (latest && latest !== previous) return latest;
    await sleep(250);
  }
  throw new Error(`no new ${kind} in the dev server log`);
}

/** Runs SQL on the local database (E2E_DB_SQL), returning its output. */
function sql(statement: string): string {
  if (!DB_SQL) throw new Error("E2E_DB_SQL not set");
  return execSync(DB_SQL, {
    input: statement,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });
}

/**
 * "10 minutes later": this account's confirmations end now. The app stores
 * UTC wall times in `timestamp` columns, so `now()` is taken in UTC (the
 * database's own time zone may be local).
 */
function expireConfirmations() {
  sql(
    `update "verification" set expires_at = (now() at time zone 'utc') - interval '1 second' where identifier like 'qrdx-confirmed-%';`,
  );
}

/**
 * In the page, for the mobile pass: horizontal page scroll, an open dialog
 * that runs past the screen with no way to scroll it, and tap targets
 * under 40 px in this lane's UI (the Two-step verification section and its
 * dialogs, "Confirm it's you"); other small targets on the same screen are
 * listed for the report. Plain JS source (tsx would add helpers that don't
 * exist in the page).
 */
const LAYOUT_CHECK = `() => {
  const root = document.documentElement;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== "hidden";
  };
  const label = (el) =>
    (el.getAttribute("aria-label") || el.textContent || el.tagName)
      .replace(/\\s+/g, " ")
      .trim()
      .slice(0, 40);
  const dialogs = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(visible);
  const dialog = dialogs[dialogs.length - 1];
  let dialogOverflow = null;
  if (dialog) {
    const r = dialog.getBoundingClientRect();
    const scrolls = dialog.scrollHeight > dialog.clientHeight + 1 &&
      /(auto|scroll)/.test(getComputedStyle(dialog).overflowY);
    if ((r.bottom > innerHeight + 1 || r.top < -1 || r.right > innerWidth + 1 || r.left < -1) && !scrolls) {
      dialogOverflow = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
    }
  }
  const lane = (el) =>
    Boolean(el.closest("#two-factor") || (dialog && dialog.contains(el)));
  const small = [];
  const others = [];
  const targets = document.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), [role="checkbox"], [role="radio"]',
  );
  for (const el of targets) {
    if (!visible(el)) continue;
    // input-otp's real input is a transparent overlay across the slots.
    if (el.hasAttribute("data-input-otp")) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
    // Radio and checkbox dots are labelled by a 40 px row around them.
    if (/^(radio|checkbox)$/.test(el.getAttribute("role") || "") && el.closest("label, [class*=after]")) continue;
    if (r.height >= 40 && r.width >= 40) continue;
    const item = label(el) + " " + Math.round(r.width) + "x" + Math.round(r.height);
    (lane(el) ? small : others).push(item);
  }
  return {
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    dialogOverflow,
    small,
    others,
  };
}`;

interface LayoutReport {
  scrollWidth: number;
  clientWidth: number;
  dialogOverflow: object | null;
  small: string[];
  others: string[];
}

/** Mobile pass findings, by screenshot name. */
const layout = new Map<string, LayoutReport>();

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  // The cookie banner would cover the bottom of every screenshot: decline
  // it (remembered for the rest of the run).
  await page.evaluate(() => {
    const button = window.__e2e.byRole("button", "Reject all", {
      exact: true,
    });
    if (button) window.__e2e.click(button);
  });
  for (const scheme of ["light", "dark"] as const) {
    await page.cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: scheme },
        { name: "prefers-reduced-motion", value: "reduce" },
      ],
    });
    await sleep(400);
    if (MOBILE && scheme === "light") {
      layout.set(
        name,
        (await page.evaluate(LAYOUT_CHECK as never)) as LayoutReport,
      );
    }
    const { data } = await page.cdp.send("Page.captureScreenshot", {
      format: "png",
    });
    writeFileSync(join(SHOTS, `${name}-${scheme}.png`), data, "base64");
  }
  await page.cdp.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });
}

async function session(page: Page): Promise<{ email?: string } | null> {
  return page.evaluate(async () => {
    const res = await fetch("/api/auth/get-session", { cache: "no-store" });
    const json = await res.json();
    return json?.user ? { email: json.user.email } : null;
  });
}

/** Clicks a button, inside the open dialog titled `dialog` when given. */
const clickButton = (page: Page, text: string, dialog?: string) =>
  page.waitFor(
    (label: string, title: string | null) => {
      const root = title ? window.__e2e.byRole("dialog", title) : undefined;
      if (title && !root) return false;
      const el = window.__e2e.byRole("button", label, { exact: true, root });
      if (!el || (el as HTMLButtonElement).disabled) return false;
      window.__e2e.click(el);
      return true;
    },
    { args: [text, dialog ?? null] as never[] },
  );

/** Clicks a button in a row of the Two-step verification section. */
const clickInSection = (page: Page, text: string, row: string) =>
  page.waitFor(
    (label: string, rowTitle: string) => {
      const section = document.getElementById("two-factor");
      if (!section) return false;
      const rows = [...section.querySelectorAll("p.text-sm.font-medium")];
      const title = rows.find((el) => el.textContent?.trim() === rowTitle);
      const container = title?.closest(".flex.flex-col") as HTMLElement | null;
      const el = container
        ? window.__e2e.byRole("button", label, { exact: true, root: container })
        : null;
      if (!el || (el as HTMLButtonElement).disabled) return false;
      window.__e2e.click(el);
      return true;
    },
    { args: [text, row] as never[] },
  );

const dialogOpen = (page: Page, title: string, timeout = 20_000) =>
  page.waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
    args: [title] as never[],
    timeout,
  });

const dialogClosed = (page: Page, title: string, timeout = 20_000) =>
  page.waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
    args: [title] as never[],
    timeout,
  });

const dialogText = (page: Page, title: string) =>
  page.evaluate(
    (t: string) => window.__e2e.byRole("dialog", t)?.textContent ?? "",
    title,
  ) as Promise<string>;

/** Types a code into the 6-digit field of the dialog titled `title`. */
async function typeCode(page: Page, title: string, code: string) {
  await page.waitFor(
    (t: string, value: string) => {
      const dialog = window.__e2e.byRole("dialog", t);
      const input = dialog?.querySelector(
        "[data-input-otp]",
      ) as HTMLInputElement | null;
      if (!input || input.disabled) return false;
      input.focus();
      window.__e2e.setValue(input, value);
      return true;
    },
    { args: [title, code] as never[] },
  );
}

const sectionText = (page: Page) =>
  page.evaluate(
    () => document.getElementById("two-factor")?.textContent ?? "",
  ) as Promise<string>;

const waitForSection = (page: Page, text: string, timeout = 20_000) =>
  page.waitFor(
    (t: string) =>
      (document.getElementById("two-factor")?.textContent ?? "").includes(t),
    { args: [text] as never[], timeout },
  );

async function showSection(page: Page) {
  await page.evaluate(() =>
    document.getElementById("two-factor")?.scrollIntoView({ block: "start" }),
  );
  await sleep(200);
}

/** The last confirmation method this browser used (localStorage). */
const preferMethod = (page: Page, method: string) =>
  page.evaluate(
    (m: string) => window.localStorage.setItem("qrdx:confirm-method", m),
    method,
  );

/** /sign-in → email → the code from the log. */
async function signInWithCode(page: Page, email: string) {
  await page.goto(`${BASE_URL}/sign-in?next=/settings/account`);
  await page.waitFor(() => Boolean(window.__e2e.byLabel("Email address")));
  await page.evaluate((value: string) => {
    const input = window.__e2e.byLabel("Email address") as HTMLInputElement;
    window.__e2e.setValue(input, value);
  }, email);
  const previous = latestLogged("sign-in code", email);
  await clickButton(page, "Email me a code");
  const code = await nextLogged("sign-in code", email, previous);
  await page.waitFor(() => Boolean(document.querySelector("[data-input-otp]")));
  await page.evaluate((value: string) => {
    const input = document.querySelector(
      "[data-input-otp]",
    ) as HTMLInputElement;
    window.__e2e.setValue(input, value);
  }, code);
  await page.waitFor(() => location.pathname === "/settings/account", {
    timeout: 30_000,
  });
}

/** Finishes "Confirm it's you" with a code emailed to `email`. */
async function confirmWithEmail(page: Page, email: string, shots?: string) {
  await dialogOpen(page, CONFIRM);
  const previous = latestLogged("confirmation code", email);
  if (shots) await shot(page, `${shots}-send`);
  await clickButton(page, "Send code", CONFIRM);
  const code = await nextLogged("confirmation code", email, previous);
  await page.waitFor(() =>
    /Enter the code we sent/.test(
      window.__e2e.byRole("dialog", "Confirm it's you")?.textContent ?? "",
    ),
  );
  if (shots) await shot(page, `${shots}-code`);
  await typeCode(page, CONFIRM, code);
  await dialogClosed(page, CONFIRM);
}

async function main() {
  if (!CODE_LOG) {
    console.log("SKIP: set E2E_CODE_LOG to the dev server's log file");
    return;
  }
  if (!findChrome()) {
    console.log("SKIP: Chrome not found (set CHROME_PATH)");
    return;
  }
  if (!(await serverIsUp(BASE_URL))) {
    console.log(`SKIP: no server at ${BASE_URL}`);
    return;
  }
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  console.log(
    `Two-step settings e2e against ${BASE_URL} as ${EMAIL}${MOBILE ? " (phone)" : ""}`,
  );
  if (!DB_SQL) {
    console.log(
      "  - E2E_DB_SQL not set: confirmations can't be ended early, so the dialog shows only where one is due",
    );
  }

  const page = await launch({ width: 1280, height: 900 });
  const { cdp } = page;
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
  let secret = "";
  try {
    await cdp.send("WebAuthn.enable", { enableUI: false });
    const { authenticatorId } = await cdp.send(
      "WebAuthn.addVirtualAuthenticator",
      {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      },
    );
    const listCredentials = async () =>
      (
        (await cdp.send("WebAuthn.getCredentials", { authenticatorId })) as {
          credentials: { signCount: number }[];
        }
      ).credentials;
    const credentials = async () => (await listCredentials()).length;
    /** Goes up each time a passkey answers a prompt. */
    const signCount = async () =>
      (await listCredentials()).reduce((sum, c) => sum + c.signCount, 0);

    const csp = await recordCspViolations(page);
    const enforced = await cspEnforced(BASE_URL);
    onFailure = async (name) => {
      const open = (await page.evaluate(() =>
        window.__e2e
          .all("dialog")
          .map((el) =>
            (el.textContent ?? "").replace(/\s+/g, " ").slice(0, 160),
          ),
      )) as string[];
      console.log(`      open dialogs: ${JSON.stringify(open)}`);
      if (!SHOTS) return;
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png",
      });
      const slug = name.replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
      writeFileSync(join(SHOTS, `FAIL-${slug}.png`), data, "base64");
    };

    await step("management endpoints are off over HTTP (404)", async () => {
      const statuses: Record<string, number> = {};
      for (const [method, path] of [
        ["GET", "/passkey/generate-register-options"],
        ["POST", "/passkey/verify-registration"],
        ["POST", "/passkey/update-passkey"],
        ["POST", "/passkey/delete-passkey"],
        ["POST", "/two-factor/enable"],
        ["POST", "/two-factor/disable"],
        ["POST", "/two-factor/generate-backup-codes"],
      ]) {
        const res = await fetch(`${BASE_URL}/api/auth${path}`, {
          method,
          headers: { origin: BASE_URL, "content-type": "application/json" },
          body: method === "POST" ? "{}" : undefined,
        });
        statuses[path] = res.status;
      }
      return Object.values(statuses).every((status) => status === 404)
        ? true
        : JSON.stringify(statuses);
    });

    await step("sign up with an email code; the section is off", async () => {
      await signInWithCode(page, EMAIL);
      const user = await session(page);
      if (user?.email !== EMAIL) return `session: ${JSON.stringify(user)}`;
      await waitForSection(page, "Off");
      await showSection(page);
      await shot(page, "01-settings-off");
      const order = await page.evaluate(() =>
        [...document.querySelectorAll("section[id]")].map((s) => s.id),
      );
      // Passkeys live inside Two-step verification now.
      if (order.includes("passkeys")) return "a separate Passkeys section";
      const anchor = await page.evaluate(() =>
        Boolean(document.querySelector("#two-factor #passkeys")),
      );
      return anchor ? true : "no #passkeys anchor in the section";
    });

    await step(
      "Turn on asks to confirm it's you with an emailed code",
      async () => {
        await clickInSection(page, "Turn on", "Two-step verification");
        await dialogOpen(page, CONFIRM);
        const text = await dialogText(page, CONFIRM);
        if (!text.includes("Before you turn on two-step verification")) {
          return `dialog: ${text}`;
        }
        if (!/We'll email a 6-digit code to p…@qrdx\.test/.test(text)) {
          return `no masked address: ${text}`;
        }
        // The explanation is folded away until asked for.
        await clickButton(page, "Why am I asked again?", CONFIRM);
        await page.waitFor(() =>
          /before changes to your account's security/.test(
            window.__e2e.byRole("dialog", "Confirm it's you")?.textContent ??
              "",
          ),
        );
        await confirmWithEmail(page, EMAIL, "02-confirm-email");
        return true;
      },
    );

    await step(
      "the stepper: choose Passkey, name it, prompt, backup codes",
      async () => {
        await dialogOpen(page, "Turn on two-step verification");
        const choose = await dialogText(page, "Turn on two-step verification");
        if (!/Step 1 of 3/.test(choose)) return `no stepper: ${choose}`;
        if (!/Recommended/.test(choose)) return "passkey not recommended";
        await shot(page, "03-turn-on-choose");
        await clickButton(page, "Continue", "Turn on two-step verification");
        await dialogOpen(page, "Add a passkey");
        const name = (await page.evaluate(() => {
          const dialog = window.__e2e.byRole("dialog", "Add a passkey");
          return (
            window.__e2e.byLabel(
              "Name",
              dialog ?? undefined,
            ) as HTMLInputElement
          )?.value;
        })) as string;
        if (!/Chrome on/.test(name)) return `default name: ${name}`;
        await shot(page, "04-turn-on-passkey-name");
        await clickButton(page, "Continue", "Add a passkey");
        await dialogOpen(page, "Save your backup codes");
        const codes = (await page.evaluate(() =>
          [...document.querySelectorAll('[aria-label="Backup codes"] li')].map(
            (li) => li.textContent?.trim() ?? "",
          ),
        )) as string[];
        if (codes.length !== 10) return `${codes.length} backup codes`;
        await shot(page, "05-turn-on-backup-codes");
        const doneDisabled = await page.evaluate(
          () =>
            (
              window.__e2e.byRole("button", "Done", {
                exact: true,
              }) as HTMLButtonElement
            )?.disabled,
        );
        if (!doneDisabled) return "Done works before 'I've saved'";
        await page.evaluate(() => {
          const box = window.__e2e.byLabel("I've saved my backup codes");
          if (box) window.__e2e.click(box);
        });
        await clickButton(page, "Done", "Save your backup codes");
        await waitForSection(page, "10 of 10 left");
        if ((await credentials()) !== 1) return "no credential";
        await showSection(page);
        await shot(page, "06-settings-on-passkey");
        const text = await sectionText(page);
        return /asks for your passkey/.test(text) &&
          !/authenticator app\./.test(text)
          ? true
          : `section: ${text}`;
      },
    );

    await step(
      "passkey-only: no app secret, and no authenticator option to confirm",
      async () => {
        if (!DB_SQL) return "SKIPPED: E2E_DB_SQL not set";
        const row = sql(
          `select secret = '' as blank, verified from two_factor where user_id = (select id from "user" where email = '${EMAIL}');`,
        );
        if (!/^\s*t\|f\s*$/m.test(row.replace(/ /g, ""))) {
          // psql's -tA isn't set by every E2E_DB_SQL; accept both layouts.
          if (!/\bt\b[\s|]+\bf\b/.test(row)) return `row: ${row}`;
        }
        expireConfirmations();
        await preferMethod(page, "backup");
        await clickInSection(page, "New codes", "Backup codes");
        await dialogOpen(page, "Make new backup codes?");
        await clickButton(page, "Make new codes", "Make new backup codes?");
        await dialogOpen(page, CONFIRM);
        await page.waitFor(() =>
          Boolean(
            window.__e2e.byLabel(
              "Backup code",
              window.__e2e.byRole("dialog", "Confirm it's you") ?? undefined,
            ),
          ),
        );
        await clickButton(page, "Use another method", CONFIRM);
        const options = await dialogText(page, CONFIRM);
        await shot(page, "07-confirm-other-methods-passkey-only");
        await clickButton(page, "Cancel", CONFIRM);
        await dialogClosed(page, CONFIRM);
        await clickButton(page, "Cancel", "Make new backup codes?").catch(
          () => {},
        );
        if (/authenticator code/i.test(options)) {
          return "offers an authenticator code";
        }
        return /Use your passkey/.test(options) ? true : `options: ${options}`;
      },
    );

    await step(
      "add the authenticator app as a second method (keeps the codes)",
      async () => {
        // Confirm again (the last step cancelled), with the passkey.
        await preferMethod(page, "passkey");
        const before = await signCount();
        await clickInSection(page, "Set up", "Authenticator app");
        await dialogOpen(page, "Set up your authenticator app", 30_000);
        await page.waitFor(() =>
          Boolean(
            window.__e2e
              .byRole("dialog", "Set up your authenticator app")
              ?.querySelector("code"),
          ),
        );
        const text = await dialogText(page, "Set up your authenticator app");
        if (/Step \d of/.test(text)) return "a stepper for a second method";
        secret = (
          (await page.evaluate(
            () =>
              window.__e2e
                .byRole("dialog", "Set up your authenticator app")
                ?.querySelector("code")?.textContent ?? "",
          )) as string
        ).replace(/\s+/g, "");
        await shot(page, "08-add-app");
        await typeCode(page, "Set up your authenticator app", totp(secret));
        await dialogClosed(page, "Set up your authenticator app");
        await waitForSection(page, "6-digit codes from the app");
        const after = await sectionText(page);
        await showSection(page);
        await shot(page, "09-settings-passkey-and-app");
        if (DB_SQL && (await signCount()) === before) {
          return "confirmed without the passkey";
        }
        return /10 of 10 left/.test(after) ? true : `section: ${after}`;
      },
    );

    await step("rename a passkey from its menu", async () => {
      await page.waitFor(() => {
        const button = document.querySelector(
          '#two-factor [aria-label^="Options for"]',
        ) as HTMLElement | null;
        if (!button) return false;
        button.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
        );
        return true;
      });
      await page.waitFor(() => {
        const item = window.__e2e.byRole("menuitem", "Rename", { exact: true });
        if (!item) return false;
        window.__e2e.click(item);
        return true;
      });
      await dialogOpen(page, "Rename passkey");
      await page.evaluate(() => {
        const dialog = window.__e2e.byRole("dialog", "Rename passkey");
        window.__e2e.setValue(
          window.__e2e.byLabel("Name", dialog ?? undefined) as HTMLInputElement,
          "Work laptop",
        );
      });
      await shot(page, "10-rename-passkey");
      await clickButton(page, "Save", "Rename passkey");
      await dialogClosed(page, "Rename passkey");
      await waitForSection(page, "Work laptop");
      return true;
    });

    await step(
      "new backup codes, confirmed with the passkey (prompt opens on its own)",
      async () => {
        if (!DB_SQL) return "SKIPPED: E2E_DB_SQL not set";
        expireConfirmations();
        await preferMethod(page, "passkey");
        const before = await signCount();
        await clickInSection(page, "New codes", "Backup codes");
        await dialogOpen(page, "Make new backup codes?");
        await shot(page, "11-new-codes-ask");
        await clickButton(page, "Make new codes", "Make new backup codes?");
        // The passkey prompt answers by itself (virtual authenticator), so
        // the confirmation closes and the codes show.
        await dialogOpen(page, "Your new backup codes", 30_000);
        await shot(page, "12-new-codes");
        await page.evaluate(() => {
          const box = window.__e2e.byLabel("I've saved my backup codes");
          if (box) window.__e2e.click(box);
        });
        await clickButton(page, "Done", "Your new backup codes");
        await dialogClosed(page, "Your new backup codes");
        return (await signCount()) > before ? true : "the passkey wasn't used";
      },
    );

    await step(
      "remove the app: confirmed with an authenticator code via 'Use another method'",
      async () => {
        if (!DB_SQL) return "SKIPPED: E2E_DB_SQL not set";
        expireConfirmations();
        await preferMethod(page, "backup");
        await clickInSection(page, "Remove", "Authenticator app");
        await dialogOpen(page, "Remove your authenticator app?");
        const ask = await dialogText(page, "Remove your authenticator app?");
        if (!/ask for your passkey or a backup code instead/.test(ask)) {
          return `dialog: ${ask}`;
        }
        await shot(page, "13-remove-app-ask");
        await clickButton(page, "Remove", "Remove your authenticator app?");
        await dialogOpen(page, CONFIRM);
        await page.waitFor(() =>
          Boolean(
            window.__e2e.byLabel(
              "Backup code",
              window.__e2e.byRole("dialog", "Confirm it's you") ?? undefined,
            ),
          ),
        );
        await shot(page, "14-confirm-backup");
        await clickButton(page, "Use another method", CONFIRM);
        await shot(page, "15-confirm-choose");
        await clickButton(page, "Use an authenticator code", CONFIRM);
        await page.waitFor(() =>
          /Enter the code from your authenticator app/.test(
            window.__e2e.byRole("dialog", "Confirm it's you")?.textContent ??
              "",
          ),
        );
        await shot(page, "16-confirm-totp");
        // A wrong code first: refused, the dialog stays.
        await typeCode(
          page,
          CONFIRM,
          totp(secret) === "000000" ? "111111" : "000000",
        );
        await page.waitFor(() =>
          /isn't right/.test(
            window.__e2e.byRole("dialog", "Confirm it's you")?.textContent ??
              "",
          ),
        );
        await shot(page, "17-confirm-totp-wrong");
        await typeCode(page, CONFIRM, totp(secret));
        await dialogClosed(page, CONFIRM);
        await waitForSection(page, "Use any authenticator app");
        const text = await sectionText(page);
        return /On/.test(text) && /asks for your passkey/.test(text)
          ? true
          : `section: ${text}`;
      },
    );

    await step(
      "remove the last passkey: the dialog says it turns off, then it's off",
      async () => {
        await page.waitFor(() => {
          const button = document.querySelector(
            '#two-factor [aria-label^="Options for"]',
          ) as HTMLElement | null;
          if (!button) return false;
          button.dispatchEvent(
            new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
          );
          return true;
        });
        await page.waitFor(() => {
          const item = window.__e2e.byRole("menuitem", "Remove", {
            exact: true,
          });
          if (!item) return false;
          window.__e2e.click(item);
          return true;
        });
        await dialogOpen(page, "Remove Work laptop?");
        const ask = await dialogText(page, "Remove Work laptop?");
        if (!/only second step, so two-step verification turns off/.test(ask)) {
          return `dialog: ${ask}`;
        }
        await shot(page, "18-remove-last-passkey");
        // Within 10 minutes of the last confirmation: no dialog this time.
        await clickButton(page, "Remove", "Remove Work laptop?");
        await dialogClosed(page, "Remove Work laptop?");
        await waitForSection(page, "Add a passkey or an authenticator app");
        await showSection(page);
        await shot(page, "19-settings-off-again");
        return true;
      },
    );

    await step(
      "turn on with the app first; the confirmation survives the session swap",
      async () => {
        await clickInSection(page, "Turn on", "Two-step verification");
        await dialogOpen(page, "Turn on two-step verification");
        await page.evaluate(() => {
          const radio = document.querySelector(
            '[role="dialog"] [role="radio"][value="app"]',
          ) as HTMLElement | null;
          if (radio) window.__e2e.click(radio);
        });
        await clickButton(page, "Continue", "Turn on two-step verification");
        await dialogOpen(page, "Set up your authenticator app");
        await page.waitFor(() =>
          Boolean(
            window.__e2e
              .byRole("dialog", "Set up your authenticator app")
              ?.querySelector("code"),
          ),
        );
        const text = await dialogText(page, "Set up your authenticator app");
        if (!/Step 2 of 3/.test(text)) return `stepper: ${text}`;
        secret = (
          (await page.evaluate(
            () =>
              window.__e2e
                .byRole("dialog", "Set up your authenticator app")
                ?.querySelector("code")?.textContent ?? "",
          )) as string
        ).replace(/\s+/g, "");
        await shot(page, "20-turn-on-app");
        await typeCode(page, "Set up your authenticator app", totp(secret));
        await dialogOpen(page, "Save your backup codes");
        await page.evaluate(() => {
          const box = window.__e2e.byLabel("I've saved my backup codes");
          if (box) window.__e2e.click(box);
        });
        await clickButton(page, "Done", "Save your backup codes");
        await waitForSection(page, "10 of 10 left");
        const user = await session(page);
        if (user?.email !== EMAIL) return "signed out by the swap";
        // Adding a passkey right after doesn't ask again.
        await clickInSection(page, "Add passkey", "Passkeys");
        await dialogOpen(page, "Add a passkey");
        const asked = await page.evaluate(() =>
          Boolean(window.__e2e.byRole("dialog", "Confirm it's you")),
        );
        await clickButton(page, "Continue", "Add a passkey");
        await dialogClosed(page, "Add a passkey");
        await page.waitFor(
          () =>
            document.querySelectorAll('#two-factor [aria-label^="Options for"]')
              .length === 1,
        );
        if ((await credentials()) !== 2) return "no new credential";
        return asked ? "asked again after the swap" : true;
      },
    );

    await step(
      "turn off: passkeys stay; 'ready to be your second step'",
      async () => {
        if (!DB_SQL) return "SKIPPED: E2E_DB_SQL not set";
        expireConfirmations();
        await preferMethod(page, "passkey");
        const before = await signCount();
        await clickInSection(page, "Turn off", "Two-step verification");
        await dialogOpen(page, "Turn off two-step verification?");
        const ask = await dialogText(page, "Turn off two-step verification?");
        await shot(page, "21-turn-off-ask");
        await clickButton(page, "Turn off", "Turn off two-step verification?");
        // Confirmed with the passkey, on its own.
        await waitForSection(
          page,
          "Your passkey is ready to be your second step",
        );
        await showSection(page);
        await shot(page, "22-settings-passkey-ready");
        if ((await signCount()) === before)
          return "confirmed without the passkey";
        return /Your passkeys stay/.test(ask) ? true : `dialog: ${ask}`;
      },
    );

    await step(
      "turn on with the existing passkey (emailed code, prompt, codes)",
      async () => {
        if (!DB_SQL) return "SKIPPED: E2E_DB_SQL not set";
        expireConfirmations();
        await preferMethod(page, "email");
        const before = await signCount();
        await clickInSection(page, "Turn on", "Two-step verification");
        await confirmWithEmail(page, EMAIL);
        await dialogOpen(page, "Save your backup codes", 30_000);
        await shot(page, "23-turn-on-existing-passkey-codes");
        await page.evaluate(() => {
          const box = window.__e2e.byLabel("I've saved my backup codes");
          if (box) window.__e2e.click(box);
        });
        await clickButton(page, "Done", "Save your backup codes");
        await waitForSection(page, "10 of 10 left");
        if ((await signCount()) === before) return "the passkey wasn't used";
        return (await credentials()) === 2 ? true : "credentials changed";
      },
    );

    await step("change the email through the dialog", async () => {
      if (!DB_SQL) return "SKIPPED: E2E_DB_SQL not set";
      expireConfirmations();
      await preferMethod(page, "passkey");
      const before = await signCount();
      await page.evaluate(() => window.scrollTo(0, 0));
      await clickButton(page, "Change");
      await dialogOpen(page, "Change your email");
      await page.evaluate((value: string) => {
        const dialog = window.__e2e.byRole("dialog", "Change your email");
        window.__e2e.setValue(
          window.__e2e.byLabel(
            "New email",
            dialog ?? undefined,
          ) as HTMLInputElement,
          value,
        );
      }, NEW_EMAIL);
      const previous = latestLogged("email-change code", NEW_EMAIL);
      await clickButton(page, "Send code", "Change your email");
      // 2FA is on, so the passkey confirms (no emailed confirmation code).
      const code = await nextLogged("email-change code", NEW_EMAIL, previous);
      await page.waitFor(() =>
        /Enter the 6-digit code we sent/.test(
          window.__e2e.byRole("dialog", "Change your email")?.textContent ?? "",
        ),
      );
      await shot(page, "24-change-email-code");
      await typeCode(page, "Change your email", code);
      await clickButton(page, "Change email", "Change your email");
      await dialogClosed(page, "Change your email");
      const user = await session(page);
      if ((await signCount()) === before)
        return "confirmed without the passkey";
      return user?.email === NEW_EMAIL
        ? true
        : `session: ${JSON.stringify(user)}`;
    });

    await step("delete the account through the dialog", async () => {
      if (!DB_SQL) return "SKIPPED: E2E_DB_SQL not set";
      expireConfirmations();
      await preferMethod(page, "backup");
      await page.evaluate(() =>
        document.getElementById("danger")?.scrollIntoView({ block: "center" }),
      );
      await clickButton(page, "Delete account…");
      await page.waitFor(() =>
        Boolean(window.__e2e.byRole("dialog", "Delete your account?")),
      );
      await page.evaluate(() => {
        const dialog = window.__e2e.byRole("dialog", "Delete your account?");
        const input = dialog?.querySelector("input") as HTMLInputElement;
        window.__e2e.setValue(input, "delete");
      });
      await clickButton(page, "Delete account", "Delete your account?");
      await dialogOpen(page, CONFIRM);
      await shot(page, "25-delete-confirm");
      // Switch to the passkey: picking it opens the prompt.
      await clickButton(page, "Use another method", CONFIRM);
      await clickButton(page, "Use your passkey", CONFIRM);
      await page.waitFor(() => location.pathname === "/", { timeout: 30_000 });
      const gone = sql(
        `select count(*) from "user" where email in ('${EMAIL}', '${NEW_EMAIL}');`,
      );
      return /\b0\b/.test(gone) && (await session(page)) === null
        ? true
        : `rows: ${gone.trim()}`;
    });

    if (MOBILE) {
      await step(
        "mobile: no horizontal page scroll on any screen",
        async () => {
          const wide = [...layout]
            .filter(([, r]) => r.scrollWidth > r.clientWidth)
            .map(([name, r]) => `${name} ${r.scrollWidth}>${r.clientWidth}`);
          return layout.size > 0 && wide.length === 0
            ? true
            : wide.join(", ") || "no screens measured";
        },
      );
      await step("mobile: dialogs fit the screen or scroll", async () => {
        const bad = [...layout]
          .filter(([, r]) => r.dialogOverflow)
          .map(([name, r]) => `${name} ${JSON.stringify(r.dialogOverflow)}`);
        return bad.length === 0 ? true : bad.join(", ");
      });
      await step("mobile: tap targets are at least 40 px", async () => {
        const bad = [...layout]
          .filter(([, r]) => r.small.length)
          .map(([name, r]) => `${name}: ${r.small.join("; ")}`);
        const others = [...layout]
          .filter(([, r]) => r.others.length)
          .map(([name, r]) => `${name}: ${r.others.join("; ")}`);
        if (others.length) {
          console.log(
            `      small targets outside this lane:\n        ${others.join("\n        ")}`,
          );
        }
        return bad.length === 0 ? true : bad.join("\n        ");
      });
    }

    const cspResult = csp.result(enforced);
    if (cspResult.skipped) {
      console.log(`  - no CSP violations: skipped (${cspResult.note})`);
    } else {
      await step("no CSP violations", async () =>
        cspResult.ok
          ? true
          : `${cspResult.lines.length}:\n        ${cspResult.lines.join("\n        ")}`,
      );
    }

    await step("no page errors in the browser", async () =>
      page.consoleErrors.length === 0
        ? true
        : `${page.consoleErrors.length}:\n  ${page.consoleErrors.join("\n  ")}`,
    );
  } finally {
    await page.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length} passed, ${failed.length} failed`,
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
