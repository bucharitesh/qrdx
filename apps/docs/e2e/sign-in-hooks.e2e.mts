// Account creation and sign-in hooks, end to end against a running dev server
// and a THROWAWAY local database, over the Chrome DevTools Protocol:
//
//   refused    a GitHub sign-up whose address GitHub hasn't verified is
//              refused, back on /sign-in with a message; no account is made
//   verified   a verified GitHub sign-up makes the account; that sign-in
//              counts as "Confirm it's you" (a security change doesn't ask)
//   proof      an account made from an unverified address (seeded) with a
//              passkey, two-step verification, a trusted device, an API key,
//              an OAuth grant, a known browser and a session: an email-code
//              sign-in proves the address, isn't asked for a second step,
//              and everything the earlier holder left is gone
//   two-step   with two-step verification on, a sign-in finished with an
//              authenticator code counts as confirming; one where a trusted
//              device skipped the second step doesn't, so it asks
//
// GitHub never runs: the dev server answers GitHub's API from
// e2e/social/github-stub.cjs, and this script sends the browser from the
// authorize page straight back to Better Auth's callback. Sign-in codes are
// read from the dev server's log. Needs, all local:
//
//   NODE_OPTIONS="--require $PWD/e2e/social/github-stub.cjs" \
//   GITHUB_CLIENT_ID=e2e-github-client GITHUB_CLIENT_SECRET=e2e-github-secret \
//     pnpm exec next dev -p <port> > <dev.log>
//
//   HOOKS_E2E_BASE_URL=http://localhost:<port> HOOKS_E2E_DEV_LOG=<dev.log> \
//   HOOKS_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   HOOKS_E2E_SHOTS=<dir> pnpm exec tsx e2e/sign-in-hooks.e2e.mts
//
// It writes to the database (test users and their rows), so it refuses to
// run unless DATABASE_URL in .env.local and the psql command are local.
/** biome-ignore-all lint/performance/useDomNodeTextContent: checks must only match text a person can see */
import { execSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const BASE = (process.env.HOOKS_E2E_BASE_URL ?? "").replace(/\/$/, "");
const DEV_LOG = process.env.HOOKS_E2E_DEV_LOG ?? "";
const PSQL = process.env.HOOKS_E2E_PSQL ?? "";
const SHOTS = process.env.HOOKS_E2E_SHOTS ?? "";
const RUN = Date.now().toString(36);

for (const [name, value] of Object.entries({ BASE, DEV_LOG, PSQL })) {
  if (!value)
    throw new Error(`Set HOOKS_E2E_${name === "BASE" ? "BASE_URL" : name}`);
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
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

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

async function waitForLogLine(
  pattern: RegExp,
  since: number,
  timeout = 20_000,
) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const text = readFileSync(DEV_LOG).subarray(since).toString("utf8");
    const match = text.match(pattern);
    if (match) return match;
    await sleep(250);
  }
  throw new Error(`No log line matching ${pattern}`);
}

// ─── The browser ────────────────────────────────────────────────────────────

const page = await launch({ width: 1280, height: 900 });
const { cdp, evaluate, goto, waitFor } = page;

/** The code the next GitHub authorize page answers with (a profile). */
let githubProfile = { id: "1", email: "", verified: false };
await cdp.send("Fetch.enable", {
  patterns: [{ urlPattern: "https://github.com/*", requestStage: "Request" }],
});
cdp.on((message: { method: string; params: Record<string, unknown> }) => {
  if (message.method !== "Fetch.requestPaused") return;
  const { requestId, request } = message.params as {
    requestId: string;
    request: { url: string };
  };
  const url = new URL(request.url);
  const back = new URL(url.searchParams.get("redirect_uri") ?? "");
  back.searchParams.set(
    "code",
    Buffer.from(JSON.stringify(githubProfile)).toString("base64url"),
  );
  back.searchParams.set("state", url.searchParams.get("state") ?? "");
  void cdp.send("Fetch.fulfillRequest", {
    requestId,
    responseCode: 302,
    responseHeaders: [{ name: "Location", value: back.href }],
  });
});

async function viewport(mobile: boolean) {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    mobile
      ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
      : { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
  );
  await sleep(300);
}

async function shot(name: string) {
  if (!SHOTS) return;
  for (const scheme of ["light", "dark"] as const) {
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: "reduce" },
        { name: "prefers-color-scheme", value: scheme },
      ],
    });
    await sleep(400);
    const { data } = (await cdp.send("Page.captureScreenshot", {
      format: "png",
    })) as { data: string };
    writeFileSync(
      join(SHOTS, `${name}-${scheme}.png`),
      Buffer.from(data, "base64"),
    );
  }
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-color-scheme", value: "light" },
    ],
  });
}

const text = () => evaluate(() => document.body.innerText) as Promise<string>;

async function waitForText(value: string, timeout = 20_000) {
  await waitFor((t: string) => document.body.innerText.includes(t), {
    args: [value] as never[],
    timeout,
  });
}

async function clickButton(name: string) {
  const ok = await evaluate((n: string) => {
    const el =
      window.__e2e.byRole("button", n, { exact: true }) ??
      window.__e2e.byRole("button", n);
    if (!el) return false;
    window.__e2e.click(el);
    return true;
  }, name);
  if (!ok) throw new Error(`No button "${name}"`);
}

async function clickInDialog(name: string) {
  await waitFor(
    (n: string) => {
      const dialog = document.querySelector(
        '[role="dialog"], [role="alertdialog"]',
      );
      const button = [...(dialog?.querySelectorAll("button") ?? [])].find(
        (b) =>
          b.textContent?.trim() === n && !(b as HTMLButtonElement).disabled,
      );
      if (!button) return false;
      window.__e2e.click(button);
      return true;
    },
    { args: [name] as never[] },
  );
}

async function fill(label: string, value: string) {
  await waitFor(
    (l: string, v: string) => {
      const el = window.__e2e.byLabel(l);
      if (!el) return false;
      el.focus();
      window.__e2e.setValue(el, v);
      return true;
    },
    { args: [label, value] as never[] },
  );
}

async function rejectCookies() {
  await evaluate(() => {
    const button = window.__e2e.byRole("button", "Reject all", { exact: true });
    if (button) window.__e2e.click(button);
  });
}

async function session(): Promise<{
  user?: { id: string };
  session?: { id: string };
} | null> {
  return evaluate(async () => {
    const response = await fetch("/api/auth/get-session", {
      credentials: "include",
    });
    return response.ok ? response.json() : null;
  });
}

async function signOutKeepingCookies() {
  await evaluate(async () => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  });
}

async function landedOn(path: string, timeout = 30_000) {
  await waitFor((p: string) => location.pathname.startsWith(p), {
    args: [path] as never[],
    timeout,
  });
}

/** /sign-in → email → code (read from the dev log). */
async function emailCodeStep(email: string, next = "/dashboard") {
  await goto(`${BASE}/sign-in?next=${encodeURIComponent(next)}`);
  await waitForText("Email me a code");
  await rejectCookies();
  const since = logSize();
  await fill("Email address", email);
  await clickButton("Email me a code");
  const [, code] = await waitForLogLine(
    new RegExp(`sign-in code for ${escapeRegExp(email)}: (\\d{6})`),
    since,
  );
  await waitForText("Check your email");
  await fill("Sign-in code", code);
}

// Better Auth stores times as UTC without a zone; compare in UTC.
const confirmationsFor = (sessionId: string) =>
  Number(
    sql(
      `select count(*) from verification where identifier = ${q(`qrdx-confirmed-${sessionId}`)} and expires_at > (now() at time zone 'utc')`,
    ),
  );

/**
 * The probe for "Confirm it's you": Settings → Email → Change, a new
 * address, Send code. Without a recent confirmation the dialog asks;
 * with one the code goes straight to the new address.
 */
async function emailChangeAsks(newEmail: string): Promise<"asks" | "sent"> {
  await goto(`${BASE}/settings/account`);
  await waitForText("Profile");
  await waitFor(() => {
    const change = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Change" && window.__e2e.visible(b),
    );
    if (!change) return false;
    window.__e2e.click(change);
    return true;
  });
  await waitForText("Change your email");
  await waitFor(
    (v: string) => {
      const input = document.querySelector(
        '[role="dialog"] input[type="email"]',
      ) as HTMLInputElement | null;
      if (!input) return false;
      input.focus();
      window.__e2e.setValue(input, v);
      return true;
    },
    { args: [newEmail] as never[] },
  );
  const since = logSize();
  await clickInDialog("Send code");
  const outcome = (await waitFor(
    (address: string) =>
      window.__e2e.byRole("dialog", "Confirm it's you")
        ? "asks"
        : document.body.innerText.includes(address) &&
            document.body.innerText.includes("Enter the")
          ? "sent"
          : false,
    { args: [newEmail] as never[], timeout: 20_000 },
  ).catch(() => null)) as "asks" | "sent" | null;
  if (outcome === "sent") return "sent";
  if (outcome === "asks") return "asks";
  // Fall back to the log: the change code went out.
  const sent = readFileSync(DEV_LOG)
    .subarray(since)
    .toString("utf8")
    .includes(newEmail);
  return sent ? "sent" : "asks";
}

try {
  // ── refused ──
  console.log("refused");
  const refusedEmail = `e2e-unverified-${RUN}@qrdx.test`;
  githubProfile = { id: `${Date.now()}`, email: refusedEmail, verified: false };
  await goto(`${BASE}/sign-in?next=${encodeURIComponent("/dashboard/codes")}`);
  await waitForText("Email me a code");
  await rejectCookies();
  await clickButton("GitHub");
  await waitForText("GitHub hasn't verified this email address", 30_000);
  const refusedUrl = new URL((await evaluate(() => location.href)) as string);
  check(
    "lands back on /sign-in",
    refusedUrl.pathname === "/sign-in",
    refusedUrl.pathname + refusedUrl.search,
  );
  check(
    "keeps where it was going",
    refusedUrl.searchParams.get("next") === "/dashboard/codes",
  );
  check(
    "names the refusal",
    refusedUrl.searchParams.get("error") === "github_email_unverified" &&
      refusedUrl.searchParams.get("via") === "github",
  );
  check(
    "no account was made",
    sql(`select count(*) from "user" where email = ${q(refusedEmail)}`) === "0",
  );
  check("signed out", (await session()) === null);
  check(
    "the message is the one the page owns",
    (await text()).includes(
      "GitHub hasn't verified this email address, so QRdx can't create an account with it. Verify it in your GitHub email settings and try again, or sign in with an email code.",
    ),
  );
  await shot("01-refused-desktop");
  await viewport(true);
  await goto(refusedUrl.href);
  await waitForText("GitHub hasn't verified this email address");
  const overflow = await evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  check("phone: no horizontal scroll", overflow === false);
  await shot("02-refused-phone");
  await viewport(false);

  // ── verified ──
  console.log("verified");
  const verifiedEmail = `e2e-verified-${RUN}@qrdx.test`;
  githubProfile = {
    id: `${Date.now() + 1}`,
    email: verifiedEmail,
    verified: true,
  };
  await page.cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in?next=${encodeURIComponent("/settings/account")}`);
  await waitForText("Email me a code");
  await rejectCookies();
  await clickButton("GitHub");
  await landedOn("/settings/account");
  const verified = await session();
  check(
    "a verified GitHub sign-up makes the account and signs in",
    Boolean(verified?.user?.id),
  );
  check(
    "the account's address is verified",
    sql(
      `select email_verified from "user" where email = ${q(verifiedEmail)}`,
    ) === "t",
  );
  check(
    "the sign-in started this session's confirmation",
    confirmationsFor(verified?.session?.id ?? "") === 1,
  );
  check(
    "so changing the email doesn't ask \"Confirm it's you\"",
    (await emailChangeAsks(`e2e-verified-new-${RUN}@qrdx.test`)) === "sent",
  );
  await shot("03-verified-no-confirm");
  // The same session once its 10 minutes are up: it asks again.
  sql(
    `delete from verification where identifier = ${q(`qrdx-confirmed-${verified?.session?.id}`)}`,
  );
  check(
    "once that confirmation is gone, it asks",
    (await emailChangeAsks(`e2e-verified-new2-${RUN}@qrdx.test`)) === "asks",
  );
  await shot("04-verified-confirm-again");

  // ── proof ──
  console.log("proof");
  const heldEmail = `e2e-held-${RUN}@qrdx.test`;
  const held = `e2e_held_${RUN}`;
  const now = "now()";
  const appId = `e2e_app_${RUN}`;
  sql(
    `insert into "user" (id, name, email, email_verified, two_factor_enabled, created_at, updated_at) values (${q(held)}, 'Earlier holder', ${q(heldEmail)}, false, true, ${now}, ${now})`,
  );
  sql(
    `insert into account (id, account_id, provider_id, user_id, created_at, updated_at) values (${q(`acc_${RUN}`)}, ${q(`gh_${RUN}`)}, 'github', ${q(held)}, ${now}, ${now})`,
  );
  sql(
    `insert into two_factor (id, secret, backup_codes, user_id, verified) values (${q(`tf_${RUN}`)}, 'x', 'x', ${q(held)}, true)`,
  );
  sql(
    `insert into passkey (id, name, public_key, user_id, credential_id, counter, device_type, backed_up, created_at) values (${q(`pk_${RUN}`)}, 'Earlier', 'pk', ${q(held)}, ${q(`cred_${RUN}`)}, 0, 'singleDevice', false, ${now})`,
  );
  sql(
    `insert into verification (id, identifier, value, expires_at, created_at, updated_at) values (${q(randomUUID())}, ${q(`trust-device-${RUN}`)}, ${q(held)}, now() + interval '30 days', ${now}, ${now})`,
  );
  sql(
    `insert into known_device (id, user_id, device_hash, created_at, last_seen_at) values (${q(`kd_${RUN}`)}, ${q(held)}, ${q(`hash_${RUN}`)}, ${now}, ${now})`,
  );
  sql(
    `insert into session (id, expires_at, token, created_at, updated_at, user_id) values (${q(`s_${RUN}`)}, now() + interval '7 days', ${q(`tok_${RUN}`)}, ${now}, ${now}, ${q(held)})`,
  );
  sql(
    `insert into api_key (id, name, key_hash, start, user_id, scopes, created_at, updated_at) values (${q(`key_${RUN}`)}, 'Earlier', ${q(`hash_${RUN}`)}, 'qrdx_e2e', ${q(held)}, '[]', ${now}, ${now})`,
  );
  sql(
    `insert into oauth_app (id, name, client_id, client_secret_hash, redirect_uris, scopes, owner_user_id, created_at, updated_at) values (${q(appId)}, 'E2E app', ${q(`client_${RUN}`)}, 'x', '[]', '[]', null, ${now}, ${now})`,
  );
  sql(
    `insert into oauth_token (id, access_token_hash, app_id, user_id, scopes, access_token_expires_at, created_at, updated_at) values (${q(`otok_${RUN}`)}, ${q(`ath_${RUN}`)}, ${q(appId)}, ${q(held)}, '[]', now() + interval '1 hour', ${now}, ${now})`,
  );
  await page.cdp.send("Network.clearBrowserCookies");
  await emailCodeStep(heldEmail);
  await landedOn("/dashboard");
  const proven = await session();
  check(
    "the email-code sign-in isn't asked for a second step",
    proven?.user?.id === held,
  );
  check(
    "the address is now proven",
    sql(`select email_verified from "user" where id = ${q(held)}`) === "t",
  );
  check(
    "two-step verification is off",
    sql(
      `select coalesce(two_factor_enabled, false) from "user" where id = ${q(held)}`,
    ) === "f",
  );
  check(
    "its secret and backup codes are gone",
    sql(`select count(*) from two_factor where user_id = ${q(held)}`) === "0",
  );
  check(
    "its passkey is gone",
    sql(`select count(*) from passkey where user_id = ${q(held)}`) === "0",
  );
  check(
    "its trusted device is forgotten",
    sql(
      `select count(*) from verification where identifier like 'trust-device-%' and value = ${q(held)}`,
    ) === "0",
  );
  check(
    "its GitHub link is gone",
    sql(`select count(*) from account where user_id = ${q(held)}`) === "0",
  );
  check(
    "its API key is revoked",
    sql(
      `select revoked_at is not null from api_key where id = ${q(`key_${RUN}`)}`,
    ) === "t",
  );
  check(
    "its OAuth grant is revoked",
    sql(
      `select revoked_at is not null from oauth_token where id = ${q(`otok_${RUN}`)}`,
    ) === "t",
  );
  check(
    "the earlier session is gone",
    sql(`select count(*) from session where id = ${q(`s_${RUN}`)}`) === "0",
  );
  check(
    "the earlier browser is forgotten",
    sql(`select count(*) from known_device where id = ${q(`kd_${RUN}`)}`) ===
      "0",
  );
  check(
    "only the new session is left",
    sql(`select count(*) from session where user_id = ${q(held)}`) === "1",
  );
  const logged =
    readFileSync(DEV_LOG, "utf8")
      .split("\n")
      .filter((line) => line.includes("auth.unproven_access_removed"))
      .at(-1) ?? "";
  check(
    "logged as counts, without the address",
    logged.includes('"passkeys":1') && !logged.includes(heldEmail),
    logged.slice(0, 200),
  );
  await goto(`${BASE}/settings/account#two-factor`);
  await waitForText("Two-step verification");
  await evaluate(() =>
    document.getElementById("two-factor")?.scrollIntoView({ block: "center" }),
  );
  await sleep(500);
  await shot("05-proof-settings");

  // ── two-step ──
  console.log("two-step");
  const twoEmail = `e2e-two-step-${RUN}@qrdx.test`;
  await page.cdp.send("Network.clearBrowserCookies");
  await emailCodeStep(twoEmail);
  await landedOn("/dashboard");
  await goto(`${BASE}/settings/account#two-factor`);
  await waitForText("Two-step verification");
  await clickButton("Turn on");
  // Just signed in: no "Confirm it's you" first.
  const opened = (await waitFor(() =>
    window.__e2e.byRole("dialog", "Confirm it's you")
      ? "asks"
      : document.querySelector('[role="dialog"] [role="radio"][value="app"]')
        ? "stepper"
        : false,
  )) as string;
  check(
    "turning it on right after signing in goes straight to setup",
    opened === "stepper",
  );
  await waitFor(() => {
    const radio = document.querySelector(
      '[role="dialog"] [role="radio"][value="app"]',
    ) as HTMLElement | null;
    if (!radio) return false;
    window.__e2e.click(radio);
    return radio.getAttribute("aria-checked") === "true";
  });
  await clickInDialog("Continue");
  await waitFor(() => Boolean(document.querySelector('[role="dialog"] code')));
  const secret = (
    (await evaluate(
      () => document.querySelector('[role="dialog"] code')?.textContent ?? "",
    )) as string
  ).replace(/\s+/g, "");
  await fill("Code from your authenticator app", totp(secret));
  await waitForText("Save your backup codes");
  await evaluate(() => {
    const box = window.__e2e.byLabel("I've saved my backup codes");
    if (box) window.__e2e.click(box);
  });
  await clickInDialog("Done");
  await waitForText("10 of 10 left");

  // A sign-in finished with an authenticator code counts.
  await page.cdp.send("Network.clearBrowserCookies");
  await emailCodeStep(twoEmail);
  await waitForText("Your account asks for a second step");
  await evaluate(() => {
    const box = window.__e2e.byLabel("Don't ask again on this device");
    if (box) window.__e2e.click(box);
  });
  // A fresh code: the one used to turn it on can't be used twice.
  await sleep(Math.max(0, 30_000 - (Date.now() % 30_000)) + 1_000);
  await fill("Authenticator code", totp(secret));
  await landedOn("/dashboard");
  const stepped = await session();
  check(
    "a sign-in finished with an authenticator code counts",
    confirmationsFor(stepped?.session?.id ?? "") === 1,
  );
  check(
    "so changing the email doesn't ask",
    (await emailChangeAsks(`e2e-two-step-new-${RUN}@qrdx.test`)) === "sent",
  );

  // A trusted device skipping the second step doesn't.
  await signOutKeepingCookies();
  await emailCodeStep(twoEmail);
  await landedOn("/dashboard");
  const trusted = await session();
  check(
    "the trusted device skipped the second step",
    Boolean(trusted?.session?.id) &&
      trusted?.session?.id !== stepped?.session?.id,
  );
  check(
    "that sign-in didn't count",
    confirmationsFor(trusted?.session?.id ?? "") === 0,
  );
  check(
    'so changing the email asks "Confirm it\'s you"',
    (await emailChangeAsks(`e2e-two-step-new2-${RUN}@qrdx.test`)) === "asks",
  );
  await shot("06-trusted-device-confirm");
} catch (error) {
  failures++;
  console.error("Stopped:", error);
  if (SHOTS) {
    const { data } = (await cdp.send("Page.captureScreenshot", {
      format: "png",
    })) as { data: string };
    writeFileSync(join(SHOTS, "zz-failure.png"), Buffer.from(data, "base64"));
  }
} finally {
  await page.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
