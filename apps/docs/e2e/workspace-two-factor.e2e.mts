// "Require two-step verification" for a workspace, end to end against a
// running dev server and a THROWAWAY local database, over the Chrome
// DevTools Protocol:
//
//   - the setting on Settings → Team (an owner needs two-step verification
//     first; it warns who'd be shut out and asks "Confirm it's you"), and the
//     members list's On / Off for owners and admins;
//   - a member without it sees a calm screen instead of the workspace, and
//     the app's routes and Better Auth's workspace endpoints refuse them,
//     while their own workspace works; "Turn on two-step verification" goes
//     to Profile & security and back;
//   - an admin without it is shut out too, and nobody changes the setting
//     over HTTP;
//   - below Business it stops applying (and shows as off); turning it off
//     opens the workspace again.
//
// It writes to the database (test users, a Business subscription, a
// workspace), so it refuses to run unless DATABASE_URL in .env.local points
// at localhost.
//
//   bun x next dev -p <port> > <dev.log>
//   WS2FA_E2E_BASE_URL=http://localhost:<port> \
//   WS2FA_E2E_DEV_LOG=<dev.log> \
//   WS2FA_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   WS2FA_E2E_SHOTS=<dir> bun x tsx e2e/workspace-two-factor.e2e.mts
//
// Each new screen is captured in light and dark, at desktop and phone widths.
/** biome-ignore-all lint/performance/useDomNodeTextContent: checks must only match text a person can see */
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cspEnforced, launch, recordCspViolations, sleep } from "./cdp.mjs";

const env = (name: string) => process.env[`WS2FA_E2E_${name}`] ?? "";
const BASE = env("BASE_URL").replace(/\/$/, "");
const DEV_LOG = env("DEV_LOG");
const PSQL = env("PSQL");
const SHOTS = env("SHOTS");
const RUN = Date.now().toString(36);
const ADA = `ada-${RUN}@qrdx.test`; // owner, pays for Business
const BOB = `bob-${RUN}@qrdx.test`; // member
const CY = `cy-${RUN}@qrdx.test`; // admin
const SLUG = `team-${RUN}`;
const ORG = `org-${RUN}`;
const TEAM_NAME = `Team ${RUN}`;

for (const [name, value] of Object.entries({
  BASE_URL: BASE,
  DEV_LOG,
  PSQL,
})) {
  if (!value) throw new Error(`Set WS2FA_E2E_${name}`);
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
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function codeSince(pattern: RegExp, since: number): Promise<string> {
  for (let i = 0; i < 80; i++) {
    const log = readFileSync(DEV_LOG).subarray(since).toString("utf8");
    const found = log.match(pattern)?.[1];
    if (found) return found;
    await sleep(250);
  }
  throw new Error(`Nothing in the dev log matching ${pattern}`);
}

// ─── The browser ────────────────────────────────────────────────────────────

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const browser = await launch(DESKTOP);
const { cdp, evaluate, goto, waitFor } = browser;
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

/**
 * The screen in light and dark, at desktop and phone widths; `focus` is
 * scrolled to the top of the view first.
 */
async function shot(name: string, focus?: string) {
  for (const [width, size] of [
    ["desktop", DESKTOP],
    ["phone", PHONE],
  ] as const) {
    await viewport(size);
    if (focus) {
      await evaluate((s: string) => {
        document.querySelector(s)?.scrollIntoView({ block: "start" });
      }, focus);
      await sleep(200);
    }
    if (size === PHONE) {
      const fits = (await evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      )) as boolean;
      check(`${name}: no sideways scroll at 390 px`, fits);
    }
    if (!SHOTS) continue;
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
      await sleep(300);
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

const path = () => evaluate(() => location.pathname as string);
async function waitText(needle: string, timeout = 20_000) {
  return waitFor((n: string) => document.body.innerText.includes(n), {
    args: [needle] as never[],
    timeout,
  }).then(
    () => true,
    () => false,
  );
}
const pageText = () =>
  evaluate(() => document.body.innerText) as Promise<string>;

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

/** A real mouse click (Radix switches and dialogs ignore synthetic ones). */
async function mouseClick(selector: string) {
  const box = (await evaluate((s: string) => {
    const el = document.querySelector(s);
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector)) as { x: number; y: number } | null;
  if (!box) throw new Error(`Nothing to click: ${selector}`);
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

async function clickLink(name: string) {
  await waitFor(
    (n: string) => {
      const el = [...document.querySelectorAll("a")].find(
        (a) => a.textContent?.trim() === n,
      );
      if (!el) return false;
      window.__e2e.click(el);
      return true;
    },
    { args: [name] as never[] },
  );
}
async function clickInDialog(name: string) {
  await waitFor(
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
async function fill(label: string, value: string) {
  await waitFor(
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

async function toastText() {
  await waitFor(() => Boolean(document.querySelector("[data-sonner-toast]")), {
    timeout: 20_000,
  }).catch(() => null);
  return (await evaluate(
    () =>
      (document.querySelector("[data-sonner-toast]") as HTMLElement | null)
        ?.innerText ?? "",
  )) as string;
}

// ─── Signing in ─────────────────────────────────────────────────────────────

async function post(path: string, body: unknown) {
  return (await evaluate(
    async (p: string, b: unknown) => {
      const response = await fetch(p, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(b),
      });
      const json = await response.json().catch(() => null);
      return { status: response.status, json };
    },
    path,
    body,
  )) as { status: number; json: Record<string, unknown> | null };
}
async function get(path: string, headers: Record<string, string> = {}) {
  return (await evaluate(
    async (p: string, h: Record<string, string>) => {
      const response = await fetch(p, { headers: h });
      const json = await response.json().catch(() => null);
      return { status: response.status, code: json?.code ?? null };
    },
    path,
    headers,
  )) as { status: number; code: string | null };
}

/** Email-code sign-in through the same endpoints the panel calls. */
async function emailSignIn(email: string, secret?: string) {
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  const since = logSize();
  const sent = await post("/api/auth/email-otp/send-verification-otp", {
    email,
    type: "sign-in",
  });
  if (sent.status !== 200) throw new Error(`send code ${sent.status}`);
  const code = await codeSince(
    new RegExp(`sign-in code for ${escapeRegExp(email)}: (\\d{6})`),
    since,
  );
  const first = await post("/api/auth/sign-in/email-otp", { email, otp: code });
  if (first.status !== 200) throw new Error(`sign in ${first.status}`);
  if (first.json?.twoFactorRedirect !== true) return;
  if (!secret) throw new Error(`${email}: asked for a second step`);
  const second = await post("/api/auth/two-factor/verify-totp", {
    code: totp(secret),
  });
  if (second.status !== 200) throw new Error(`second step ${second.status}`);
}

// ─── "Confirm it's you" ─────────────────────────────────────────────────────

const CONFIRM = "Confirm it's you";
const confirmOpen = (timeout = 15_000) =>
  waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
    args: [CONFIRM] as never[],
    timeout,
  }).then(
    () => true,
    () => false,
  );
const confirmText = () =>
  evaluate(
    (t: string) =>
      (window.__e2e.byRole("dialog", t) as HTMLElement | null)?.innerText ?? "",
    CONFIRM,
  ) as Promise<string>;
async function clickInConfirm(label: string) {
  await waitFor(
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
}
async function confirmByEmail(email: string) {
  await confirmOpen();
  const since = logSize();
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
  await waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
    args: [CONFIRM] as never[],
  });
}
async function confirmByBackupCode(code: string) {
  await waitFor(
    (t: string) =>
      !/Loading/.test(window.__e2e.byRole("dialog", t)?.textContent ?? ""),
    { args: [CONFIRM] as never[] },
  );
  const showing = (await evaluate(
    (t: string) =>
      Boolean(
        window.__e2e.byLabel(
          "Backup code",
          window.__e2e.byRole("dialog", t) ?? undefined,
        ),
      ),
    CONFIRM,
  )) as boolean;
  if (!showing) {
    await clickInConfirm("Use another method");
    await clickInConfirm("Use a backup code");
  }
  await waitFor(
    (t: string, v: string) => {
      const input = window.__e2e.byLabel(
        "Backup code",
        window.__e2e.byRole("dialog", t) ?? undefined,
      ) as HTMLInputElement | null;
      if (!input || input.disabled) return false;
      input.focus();
      window.__e2e.setValue(input, v);
      return true;
    },
    { args: [CONFIRM, code] as never[] },
  );
  await clickInConfirm("Confirm");
  await waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
    args: [CONFIRM] as never[],
  });
}

/** As if 10 minutes had passed: this account's confirmations are gone. */
const forgetConfirmation = (email: string) =>
  sql(
    `delete from verification where identifier like 'qrdx-confirmed-%' and value=${q(userId(email))}`,
  );

/**
 * Profile & security → Turn on → (confirm by email) → authenticator app.
 * Returns the app's secret and the backup codes.
 */
async function turnOnTwoFactor(email: string) {
  // A fresh sign-in counts as confirming; this asks again, as later on.
  forgetConfirmation(email);
  await waitText("Two-step verification");
  await evaluate(() => {
    const button = [...document.querySelectorAll("#two-factor button")].find(
      (b) => b.textContent?.trim() === "Turn on",
    );
    if (button) window.__e2e.click(button);
  });
  await confirmByEmail(email);
  await waitFor(() => {
    const radio = document.querySelector(
      '[role="dialog"] [role="radio"][value="app"]',
    ) as HTMLElement | null;
    if (!radio) return true; // straight to the app (no passkeys here)
    window.__e2e.click(radio);
    return radio.getAttribute("aria-checked") === "true";
  });
  if (
    await evaluate(() =>
      Boolean(document.querySelector('[role="dialog"] [role="radio"]')),
    )
  ) {
    await clickInDialog("Continue");
  }
  await waitFor(() => Boolean(document.querySelector('[role="dialog"] code')));
  const secret = (
    (await evaluate(
      () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
    )) as string
  ).replace(/\s+/g, "");
  await fill("Code from your authenticator app", totp(secret));
  await waitText("Save your backup codes");
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
  await clickInDialog("Done");
  await waitFor(() => !document.querySelector('[role="dialog"]'));
  return { secret, codes };
}

const teamUrl = (rest = "") => `${BASE}/dashboard/${SLUG}${rest}`;
const shutOutShown = () =>
  waitText(`${TEAM_NAME} requires two-step verification`);
const appShellShown = () =>
  evaluate(() =>
    Boolean(document.querySelector('nav[aria-label="Breadcrumb"]')),
  ) as Promise<boolean>;
/** The way-back notice is on screen (the link lands on it). */
const noticeInView = () =>
  evaluate(() => {
    const box = document
      .getElementById("workspace-two-factor")
      ?.getBoundingClientRect();
    return Boolean(box && box.top >= 0 && box.bottom <= window.innerHeight);
  }) as Promise<boolean>;
const metadata = () =>
  sql(`select coalesce(metadata, '') from organization where id=${q(ORG)}`);

try {
  console.log("set-up");
  await emailSignIn(BOB);
  await emailSignIn(CY);
  await emailSignIn(ADA);
  const adaId = userId(ADA);
  sql(
    `insert into subscription (id, created_at, amount, currency, recurring_interval, status, current_period_start, current_period_end, started_at, customer_id, product_id, checkout_id, user_id) values ('sub-${RUN}', now(), 1500, 'usd', 'month', 'active', now(), now() + interval '30 days', now(), 'cus-${RUN}', 'local-business-monthly', 'chk-${RUN}', ${q(adaId)})`,
  );
  sql(
    `insert into organization (id, name, slug, created_at, metadata) values (${q(ORG)}, ${q(TEAM_NAME)}, ${q(SLUG)}, now(), '{"ssoJoinRole":"viewer"}')`,
  );
  sql(
    `insert into member (id, organization_id, user_id, role, created_at) values ('m-ada-${RUN}', ${q(ORG)}, ${q(adaId)}, 'owner', now()), ('m-bob-${RUN}', ${q(ORG)}, ${q(userId(BOB))}, 'member', now()), ('m-cy-${RUN}', ${q(ORG)}, ${q(userId(CY))}, 'admin', now())`,
  );

  // ── An owner without two-step verification can't turn it on ──
  console.log("owner without two-step verification");
  await goto(teamUrl("/settings/team"));
  await dismissCookieBanner();
  check(
    "Team shows the setting",
    await waitText("Require two-step verification"),
  );
  check(
    "…and says to turn it on yourself first",
    await waitText("Turn on two-step verification for your own account first."),
  );
  check(
    "…with the switch disabled",
    (await evaluate(
      () =>
        (document.getElementById("require-two-factor") as HTMLButtonElement)
          ?.disabled,
    )) === true,
  );
  check(
    "the members list shows who has two-step verification on",
    (await evaluate(() =>
      [...document.querySelectorAll("th")].some(
        (th) => th.textContent?.trim() === "Two-step verification",
      ),
    )) as boolean,
  );
  await shot("01-team-owner-without-two-factor");

  // ── The owner turns it on for herself ──
  await goto(`${BASE}/settings/account#two-factor`);
  const ada = await turnOnTwoFactor(ADA);
  check(
    "the owner turned on two-step verification",
    sql(`select two_factor_enabled from "user" where id=${q(adaId)}`) === "t",
  );

  // ── Requiring it: the warning, then "Confirm it's you" ──
  console.log("requiring it");
  forgetConfirmation(ADA);
  await goto(teamUrl("/settings/team"));
  await waitText("Require two-step verification");
  const rows = (await evaluate(() =>
    [...document.querySelectorAll("tbody tr")].map((tr) =>
      (tr as HTMLElement).innerText.replace(/\s+/g, " "),
    ),
  )) as string[];
  check(
    "members list: the owner On, the member and the admin Off",
    rows.some((r) => r.includes(ADA) && /\bOn\b/.test(r)) &&
      rows.some((r) => r.includes(BOB) && /\bOff\b/.test(r)) &&
      rows.some((r) => r.includes(CY) && /\bOff\b/.test(r)),
    rows.join(" | ").slice(0, 300),
  );
  await shot("02-team-setting-off");
  await mouseClick("#require-two-factor");
  check(
    "turning it on warns who'd be shut out first",
    await waitText("2 members haven't turned on two-step verification yet."),
  );
  await shot("03-require-warning");
  await clickInDialog("Require");
  const asked = await confirmOpen();
  const confirmBody = asked ? await confirmText() : "";
  check(
    `"${CONFIRM}" asks before you require two-step verification`,
    confirmBody.includes(
      "Before you require two-step verification, we need to check it's you.",
    ),
    confirmBody.replace(/\s+/g, " ").slice(0, 160),
  );
  check("…and nothing changed yet", !metadata().includes("requireTwoFactor"));
  await shot("04-require-confirm");
  await confirmByBackupCode(ada.codes[0] ?? "");
  const saved = await toastText();
  check(
    "saved: two-step verification is now required",
    saved.includes("Two-step verification is now required"),
    saved,
  );
  check(
    "stored in the workspace's metadata, next to its other settings",
    JSON.stringify(JSON.parse(metadata())) ===
      JSON.stringify({ ssoJoinRole: "viewer", requireTwoFactor: true }),
    metadata(),
  );
  await goto(teamUrl("/settings/team"));
  check(
    "the card says who hasn't turned it on",
    await waitText(
      "2 members haven't turned on two-step verification yet. They're asked to turn it on when they next open the workspace.",
    ),
  );
  await shot("05-team-setting-on");

  console.log("nobody changes it over HTTP");
  const before = metadata();
  const overHttp = await post("/api/auth/organization/update", {
    organizationId: ORG,
    data: { metadata: { ssoJoinRole: "viewer" } },
  });
  check(
    "HTTP /organization/update with metadata: refused",
    overHttp.status === 403 &&
      overHttp.json?.code === "WORKSPACE_SETTINGS_IN_APP",
    JSON.stringify(overHttp),
  );
  check("…and the setting stayed", metadata() === before);

  // ── A member without it ──
  console.log("a member without two-step verification");
  await emailSignIn(BOB);
  await goto(`${BASE}/dashboard`);
  const bobOwnSlug = sql(
    `select o.slug from organization o join member m on m.organization_id=o.id where m.user_id=${q(userId(BOB))} and o.id <> ${q(ORG)}`,
  );
  check(
    "/dashboard opens their own workspace",
    (await path()) === `/dashboard/${bobOwnSlug}`,
    await path(),
  );
  await goto(teamUrl());
  await dismissCookieBanner();
  check("the team shows the calm screen", await shutOutShown());
  const screen = await pageText();
  check(
    "…which says what to do",
    screen.includes(
      "Turn on two-step verification for your account to open this workspace. Your other workspaces work as usual.",
    ) && screen.includes("Turn on two-step verification"),
  );
  check(
    "…offers their own workspace",
    /Open .+/.test(screen) && !(await appShellShown()),
  );
  check(
    "…and shows nothing of the workspace (no app shell, no members)",
    !screen.includes(ADA) && !screen.includes("Codes"),
  );
  await shot("06-shut-out");
  await goto(teamUrl("/codes"));
  check("every page of it shows the same screen", await shutOutShown());

  console.log("routes refuse them too");
  const v1 = await get("/api/v1/codes", { "x-qrdx-workspace": SLUG });
  check(
    "GET /api/v1/codes in the team (session): 403 TWO_FACTOR_REQUIRED",
    v1.status === 403 && v1.code === "TWO_FACTOR_REQUIRED",
    JSON.stringify(v1),
  );
  for (const [label, url] of [
    [
      "list-members",
      `/api/auth/organization/list-members?organizationId=${ORG}`,
    ],
    [
      "get-full-organization",
      `/api/auth/organization/get-full-organization?organizationSlug=${SLUG}`,
    ],
  ] as const) {
    const result = await get(url);
    check(
      `HTTP ${label}: 403 TWO_FACTOR_REQUIRED`,
      result.status === 403 && result.code === "TWO_FACTOR_REQUIRED",
      JSON.stringify(result),
    );
  }
  const switched = await post("/api/auth/organization/set-active", {
    organizationId: ORG,
  });
  check(
    "switching the session to it is allowed",
    switched.status === 200,
    String(switched.status),
  );
  const fallback = await get("/api/v1/codes");
  check(
    "…and a route without a workspace uses one they can open",
    fallback.status === 200,
    JSON.stringify(fallback),
  );
  const own = await get("/api/v1/codes", { "x-qrdx-workspace": bobOwnSlug });
  check(
    "their own workspace works as usual",
    own.status === 200,
    JSON.stringify(own),
  );

  console.log("turn it on, and back");
  await goto(teamUrl("/codes"));
  await shutOutShown();
  await clickLink("Turn on two-step verification");
  await waitFor(() => location.pathname === "/settings/account");
  const settingsHref = (await evaluate(() => location.href)) as string;
  check(
    "it goes to Profile & security with the way back",
    settingsHref.includes(
      `next=${encodeURIComponent(`/dashboard/${SLUG}/codes`)}`,
    ),
    settingsHref,
  );
  check(
    "Profile & security says why",
    await waitText(`${TEAM_NAME} requires two-step verification. Turn it on`),
  );
  check("…with the app around it as usual", await appShellShown());
  await sleep(500);
  check("…in view where the link lands", await noticeInView());
  await shot("07-settings-notice", "#workspace-two-factor");
  await turnOnTwoFactor(BOB);
  check(
    "once it's on, the notice offers the way back",
    await waitText(`Two-step verification is on, so you can open ${TEAM_NAME}`),
  );
  check("…still in view", await noticeInView());
  await shot("08-settings-back", "#workspace-two-factor");
  await clickLink(`Back to ${TEAM_NAME}`);
  await waitFor((p: string) => location.pathname === p, {
    args: [`/dashboard/${SLUG}/codes`] as never[],
  });
  await sleep(1500);
  check(
    "back in the workspace, on the page they were on",
    (await appShellShown()) &&
      !(await pageText()).includes("requires two-step verification"),
  );

  // ── An admin without it ──
  console.log("an admin without two-step verification");
  await emailSignIn(CY);
  await goto(teamUrl("/settings/team"));
  check("an admin is shut out too", await shutOutShown());
  const rename = await post("/api/auth/organization/update", {
    organizationId: ORG,
    data: { name: "Renamed" },
  });
  check(
    "HTTP rename by that admin: 403 TWO_FACTOR_REQUIRED",
    rename.status === 403 && rename.json?.code === "TWO_FACTOR_REQUIRED",
    JSON.stringify(rename),
  );
  check(
    "…and the name stayed",
    sql(`select name from organization where id=${q(ORG)}`) === TEAM_NAME,
  );

  // ── Below Business it stops applying ──
  console.log("below Business");
  sql(
    `update subscription set product_id='local-pro-monthly' where id='sub-${RUN}'`,
  );
  await goto(teamUrl());
  check(
    "on Pro, the admin opens the workspace",
    (await appShellShown()) &&
      !(await pageText()).includes("requires two-step verification"),
  );
  await goto(teamUrl("/settings/team"));
  check(
    "the setting shows as off, and why",
    await waitText(
      "It's off while this workspace isn't on Business, and applies again if it moves back.",
    ),
  );
  check(
    "…with the switch off",
    (await evaluate(
      () =>
        document
          .getElementById("require-two-factor")
          ?.getAttribute("aria-checked") ?? "",
    )) === "false",
  );
  await shot("09-below-business");
  sql(
    `update subscription set product_id='local-business-monthly' where id='sub-${RUN}'`,
  );
  await goto(teamUrl());
  check("back on Business, it applies again", await shutOutShown());

  // ── Turning it off ──
  console.log("turning it off");
  await emailSignIn(ADA, ada.secret);
  await goto(teamUrl("/settings/team"));
  await waitText("Require two-step verification");
  await mouseClick("#require-two-factor");
  // A sign-in that answered the second step counts as confirming.
  const off = await toastText();
  check(
    "turned off (the sign-in's second step counts as confirming)",
    off.includes("Two-step verification is no longer required"),
    off,
  );
  check(
    "only its own key left the metadata",
    JSON.stringify(JSON.parse(metadata())) ===
      JSON.stringify({ ssoJoinRole: "viewer" }),
    metadata(),
  );
  await emailSignIn(CY);
  await goto(teamUrl());
  check(
    "the admin opens the workspace again",
    (await appShellShown()) &&
      !(await pageText()).includes("requires two-step verification"),
  );

  const cspResult = csp.result(cspOn);
  if (cspResult.skipped) {
    console.log(`  - no CSP violations: skipped (${cspResult.note})`);
  } else {
    check("no CSP violations", cspResult.ok, cspResult.lines.join(" | "));
  }
  const errors = browser.consoleErrors.filter(
    (e: string) => !/Failed to load resource/.test(e),
  );
  check(
    "no uncaught errors in the browser",
    errors.length === 0,
    errors.join(" | ").slice(0, 300),
  );
} catch (error) {
  failures++;
  console.log(`  ✗ stopped: ${(error as Error).stack ?? error}`);
  if (SHOTS) {
    const captured = (await cdp.send("Page.captureScreenshot", {
      format: "png",
    })) as { data: string };
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(
      join(SHOTS, "zz-failure.png"),
      Buffer.from(captured.data, "base64"),
    );
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
