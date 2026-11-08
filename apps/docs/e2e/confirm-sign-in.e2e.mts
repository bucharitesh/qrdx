// "Confirm it's you" by signing in again (lib/account/confirmation-sign-in-
// server.ts, packages/auth/confirm-sign-in.ts), end to end through workspace
// SSO (OIDC) against the local mock identity provider: the same Better Auth
// callback and database hooks Google and GitHub go through. Also: a changed
// email signs out the other sessions, and support's "Change email". Against
// a running dev server and a THROWAWAY local database, over the Chrome
// DevTools Protocol. It writes to the database (test users, a Business
// subscription, an SSO connection), so it refuses to run unless DATABASE_URL
// in .env.local points at localhost.
//
// Needs, all local (the same set-up as e2e/sso.e2e.mts):
//   node e2e/sso/dns-stub.mjs <records.json> 5399
//   node e2e/sso/mock-idp.mjs 4455
//   NODE_OPTIONS="--require $PWD/e2e/sso/dns-preload.cjs" \
//   BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4455 \
//     pnpm exec next dev -p <port> > <dev.log>
//
//   CONFIRM_E2E_BASE_URL=http://localhost:<port> CONFIRM_E2E_DEV_LOG=<dev.log> \
//   CONFIRM_E2E_DNS_FILE=<records.json> \
//   CONFIRM_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   CONFIRM_E2E_SHOTS=<dir> pnpm exec tsx e2e/confirm-sign-in.e2e.mts
//
// Covers: the dialog offers signing in again through SSO to someone who
// signs in that way (and not to anyone else); the round trip confirms the
// new session, signs out the one it replaced and leaves nothing behind; the
// change then goes ahead without asking again; signing in at the identity
// provider as someone new (no account is made) or as someone else (no
// switch) changes nothing and says why; a confirmed email change signs out
// the account's other sessions; support's "Change email" in the admin panel.
// Screenshots of each screen in light and dark.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cspEnforced, launch, recordCspViolations, sleep } from "./cdp.mjs";

const BASE = (process.env.CONFIRM_E2E_BASE_URL ?? "").replace(/\/$/, "");
const DEV_LOG = process.env.CONFIRM_E2E_DEV_LOG ?? "";
const DNS_FILE = process.env.CONFIRM_E2E_DNS_FILE ?? "";
const PSQL = process.env.CONFIRM_E2E_PSQL ?? "";
const SHOTS = process.env.CONFIRM_E2E_SHOTS ?? "";
const IDP = "http://localhost:4455";
const RUN = Date.now().toString(36);
const DOMAIN = `acme-${RUN}.test`;

for (const [name, value] of Object.entries({ BASE, DEV_LOG, DNS_FILE, PSQL })) {
  if (!value)
    throw new Error(`Set CONFIRM_E2E_${name === "BASE" ? "BASE_URL" : name}`);
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

const browser = await launch({ width: 1280, height: 900 });
const { cdp, evaluate, goto, waitFor } = browser;
const csp = await recordCspViolations(browser);
const cspOn = await cspEnforced(BASE);

/**
 * The cookie banner would cover the page. Never while a dialog is open: a
 * click outside a dialog closes it.
 */
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
    await sleep(300);
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
async function waitText(needle: string, timeout = 20_000) {
  // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
  return waitFor((n: string) => document.body.innerText.includes(n), {
    args: [needle] as never[],
    timeout,
  });
}

function latestCode(email: string): string {
  const log = readFileSync(DEV_LOG, "utf8");
  const matches = [...log.matchAll(/sign-in code for (\S+): (\d{6})/g)].filter(
    (m) => m[1] === email,
  );
  const code = matches.at(-1)?.[2];
  if (!code) throw new Error(`No code in the dev log for ${email}`);
  return code;
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
  const sent = await evaluate(async (e: string) => {
    const r = await fetch("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: e, type: "sign-in" }),
    });
    return r.status;
  }, email);
  if (sent !== 200) throw new Error(`send code ${sent}`);
  await sleep(500);
  const status = await evaluate(
    async (e: string, otp: string) => {
      const r = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e, otp }),
      });
      return r.status;
    },
    email,
    latestCode(email),
  );
  if (status !== 200) throw new Error(`sign in ${status}`);
}

const CONFIRM = "Confirm it's you";
const confirmAsked = (timeout = 10_000) =>
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
/** Clicks a button inside "Confirm it's you". */
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

/** "Confirm it's you" with an emailed code (no two-step verification). */
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
  await waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
    args: [CONFIRM] as never[],
  });
}

/** At the mock IdP's form: sign in as `email`. */
async function idpSignIn(email: string) {
  await waitFor(() => location.host === "localhost:4455", { timeout: 20_000 });
  await waitFor(() => Boolean(window.__e2e.byLabel("Sign in as")));
  await evaluate((e: string) => {
    window.__e2e.setValue(window.__e2e.byLabel("Sign in as") as HTMLElement, e);
    window.__e2e.click(
      window.__e2e.byRole("button", "Sign in", { exact: true }) as HTMLElement,
    );
  }, email);
  await waitFor(() => location.host !== "localhost:4455", { timeout: 20_000 });
  await sleep(2500);
}

/** "Sign in with SSO" on /sign-in, then the IdP. */
async function ssoSignIn(email: string) {
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Sign in with SSO", {
        exact: true,
      }) as HTMLElement,
    ),
  );
  await waitFor(() => Boolean(window.__e2e.byLabel("Work email")));
  await evaluate((e: string) => {
    window.__e2e.setValue(window.__e2e.byLabel("Work email") as HTMLElement, e);
    window.__e2e.click(
      window.__e2e.byRole("button", "Continue", { exact: true }) as HTMLElement,
    );
  }, email);
  await idpSignIn(email);
}

/** Settings → Profile & security → Email → Change, then the new address. */
async function startEmailChange(newEmail: string) {
  await goto(`${BASE}/settings/account`, { wait: 2500 });
  // The dialog starts with the method that worked last in this browser.
  await evaluate(() => localStorage.removeItem("qrdx:confirm-method"));
  await dismissCookieBanner();
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Change", { exact: true }) as HTMLElement,
    ),
  );
  await waitFor(() => Boolean(window.__e2e.byLabel("New email")));
  await evaluate((value: string) => {
    window.__e2e.setValue(
      window.__e2e.byLabel("New email") as HTMLElement,
      value,
    );
    const dialog = window.__e2e.byRole("dialog", "Change your email");
    window.__e2e.click(
      window.__e2e.byRole("button", "Send code", {
        exact: true,
        root: dialog ?? document,
      }) as HTMLElement,
    );
  }, newEmail);
}

const userId = (email: string) =>
  sql(`select id from "user" where email=${q(email)}`);
const browserSession = () =>
  evaluate(async () => {
    const response = await fetch("/api/auth/get-session");
    return response.ok ? await response.json() : null;
  }) as Promise<{
    user?: { email?: string };
    session?: { id?: string };
  } | null>;
const intentRows = () =>
  sql(
    "select count(*) from verification where identifier like 'qrdx-confirm-sign-in-%'",
  );
async function browserCookie(name: string): Promise<string> {
  const { cookies } = (await cdp.send("Network.getCookies", {
    urls: [BASE],
  })) as { cookies: { name: string; value: string }[] };
  return cookies.find((cookie) => cookie.name === name)?.value ?? "";
}
/** The toast's text once one shows. */
const toastText = async () => {
  await waitFor(() => Boolean(document.querySelector("[data-sonner-toast]")), {
    timeout: 20_000,
  });
  return evaluate(
    () =>
      // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
      (document.querySelector("[data-sonner-toast]") as HTMLElement).innerText,
  ) as Promise<string>;
};
const dismissToasts = () =>
  evaluate(() => {
    for (const toast of document.querySelectorAll("[data-sonner-toast]")) {
      toast.remove();
    }
  });

try {
  const owner = `owner@${DOMAIN}`;
  const stranger = `new-${RUN}@${DOMAIN}`; // never had an account
  const bob = `bob@${DOMAIN}`; // has an account of his own
  const plain = `plain-${RUN}@other.test`; // no SSO

  // ─── Set-up: a Business workspace with a verified OIDC connection ───────
  console.log("set-up");
  await emailSignIn(plain);
  await emailSignIn(owner);
  const ownerId = userId(owner);
  const slug = sql(
    `select o.slug from organization o join member m on m.organization_id=o.id where m.user_id=${q(ownerId)} and m.role='owner' limit 1`,
  );
  const orgId = sql(`select id from organization where slug=${q(slug)}`);
  sql(
    `insert into subscription (id, created_at, amount, currency, recurring_interval, status, current_period_start, current_period_end, started_at, customer_id, product_id, checkout_id, user_id) values ('sub-${RUN}', now(), 1500, 'usd', 'month', 'active', now(), now() + interval '30 days', now(), 'cus-${RUN}', 'local-business-monthly', 'chk-${RUN}', ${q(ownerId)})`,
  );
  await goto(`${BASE}/dashboard/${slug}/settings/sso`, { wait: 3000 });
  await evaluate(
    (domain: string, idp: string) => {
      const e = window.__e2e;
      e.setValue(e.byLabel("Email domain") as HTMLElement, domain);
      e.setValue(e.byLabel("Issuer URL") as HTMLElement, idp);
      e.setValue(e.byLabel("Client ID") as HTMLElement, "qrdx-test-client");
      e.setValue(e.byLabel("Client secret") as HTMLElement, "qrdx-test-secret");
      e.click(
        e.byRole("button", "Save connection", { exact: true }) as HTMLElement,
      );
    },
    DOMAIN,
    IDP,
  );
  await confirmByEmail(owner);
  await waitText(`Verify ${DOMAIN}`);
  const providerId = sql(
    `select provider_id from sso_provider where organization_id=${q(orgId)}`,
  );
  const token = await evaluate(() => {
    const label = [...document.querySelectorAll("div")].find(
      (el) => el.textContent === "Value" && el.children.length === 0,
    );
    return label?.nextElementSibling?.querySelector("code")?.textContent ?? "";
  });
  writeFileSync(
    DNS_FILE,
    JSON.stringify({ [`_qrdx-${providerId}.${DOMAIN}`]: [token] }),
  );
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Verify", { exact: true }) as HTMLElement,
    ),
  );
  await waitText("Verified");
  check(
    "Set-up: the connection is verified",
    sql(
      `select domain_verified from sso_provider where provider_id=${q(providerId)}`,
    ) === "t",
  );

  // Bob signs in through SSO once, so he has an account of his own.
  await ssoSignIn(bob);
  check("Set-up: Bob has an account", Boolean(userId(bob)));

  // ─── Who is offered SSO ─────────────────────────────────────────────────
  console.log("who is offered signing in again through SSO");
  // The owner has never signed in through SSO yet: no account row for it.
  await emailSignIn(owner);
  await startEmailChange(`owner-new-${RUN}@other.test`);
  check("The email change asks to confirm it's you", await confirmAsked());
  await sleep(800);
  check(
    "Without an SSO sign-in of their own, only the emailed code",
    !(await dialogText()).includes("Use another method"),
    (await dialogText()).replace(/\s+/g, " ").slice(0, 160),
  );
  await clickInConfirm("Cancel");

  // Now the owner signs in through SSO once (links it).
  await ssoSignIn(owner);
  check(
    "The owner's SSO sign-in is linked to their account",
    sql(
      `select count(*) from account where user_id=${q(ownerId)} and provider_id=${q(providerId)}`,
    ) === "1",
  );

  // ─── The round trip ─────────────────────────────────────────────────────
  console.log("confirming by signing in again through SSO");
  await emailSignIn(owner);
  const before = await browserSession();
  const oldSessionId = before?.session?.id ?? "";
  await startEmailChange(`owner-new-${RUN}@other.test`);
  check("Asks to confirm it's you", await confirmAsked());
  await sleep(600);
  check(
    "Starts with the emailed code",
    (await dialogText()).includes("We'll email a 6-digit code"),
  );
  await clickInConfirm("Use another method");
  await sleep(500);
  const choices = await dialogText();
  check(
    "Offers signing in again through SSO",
    choices.includes("Sign in with SSO"),
    choices.replace(/\s+/g, " ").slice(0, 200),
  );
  await shot("01-confirm-choose");
  await clickInConfirm("Sign in with SSO");
  await sleep(500);
  const ssoStep = await dialogText();
  check(
    "Explains the round trip",
    ssoStep.includes("Sign in with your company's SSO again") &&
      ssoStep.includes("make your change once more"),
    ssoStep.replace(/\s+/g, " ").slice(0, 200),
  );
  await shot("02-confirm-sso");
  await clickInConfirm("Continue with SSO");
  await idpSignIn(owner);
  const toast = await toastText();
  check(
    "Back on the same page, confirmed",
    toast.includes("Thanks, that's confirmed") &&
      new URL(await href()).pathname === "/settings/account",
    toast,
  );
  check(
    "The address bar is cleaned up",
    !(await href()).includes("confirm="),
    await href(),
  );
  await shot("03-confirmed");
  const after = await browserSession();
  const newSessionId = after?.session?.id ?? "";
  check(
    "Still the owner, in a new session",
    after?.user?.email === owner && newSessionId !== oldSessionId,
  );
  check(
    "The new session is confirmed",
    sql(
      // Timestamps are stored in UTC without a zone.
      `select count(*) from verification where identifier=${q(`qrdx-confirmed-${newSessionId}`)} and value=${q(ownerId)} and expires_at > (now() at time zone 'utc')`,
    ) === "1",
  );
  check(
    "The session it replaced is signed out",
    sql(`select count(*) from session where id=${q(oldSessionId)}`) === "0",
  );
  check("Nothing is left behind", intentRows() === "0", intentRows());
  check(
    "The cookie is gone",
    (await browserCookie("qrdx_confirm_sign_in")) === "",
  );
  await dismissToasts();

  console.log("the change then goes ahead without asking");
  const newAddress = `owner-new-${RUN}@other.test`;
  const changeSince = statSync(DEV_LOG).size;
  await startEmailChange(newAddress);
  check("Doesn't ask again within 10 minutes", !(await confirmAsked(2500)));
  await waitFor(() =>
    Boolean(window.__e2e.byLabel("Code from the new address")),
  );
  // A session elsewhere (Bob's browser isn't the owner's: make one directly).
  sql(
    `insert into session (id, expires_at, token, created_at, updated_at, user_id) values ('other-${RUN}', now() + interval '1 day', 'other-token-${RUN}', now(), now(), ${q(ownerId)})`,
  );
  const changeCode = await codeSince(
    new RegExp(`email-change code for ${escapeRegExp(newAddress)}: (\\d{6})`),
    changeSince,
  );
  await waitFor(
    (value: string) => {
      const dialog = window.__e2e.byRole("dialog", "Change your email");
      const input = dialog?.querySelector(
        "[data-input-otp]",
      ) as HTMLInputElement | null;
      if (!input || input.disabled) return false;
      input.focus();
      window.__e2e.setValue(input, value);
      return true;
    },
    { args: [changeCode] as never[] },
  );
  await waitFor(() => {
    const dialog = window.__e2e.byRole("dialog", "Change your email");
    const button = dialog
      ? window.__e2e.byRole("button", "Change email", {
          exact: true,
          root: dialog,
        })
      : null;
    if (!button || (button as HTMLButtonElement).disabled) return false;
    window.__e2e.click(button);
    return true;
  });
  await sleep(3500);
  check(
    "The email changed",
    sql(`select email from "user" where id=${q(ownerId)}`) === newAddress,
  );
  check(
    "The other session is signed out",
    sql(`select count(*) from session where id='other-${RUN}'`) === "0",
  );
  check(
    "This session stays",
    sql(`select count(*) from session where id=${q(newSessionId)}`) === "1",
  );
  sql(`update "user" set email=${q(owner)} where id=${q(ownerId)}`);

  // ─── Signing in at the IdP as someone else ──────────────────────────────
  console.log("someone new at the identity provider: no account is made");
  await emailSignIn(owner);
  const ownerSession = (await browserSession())?.session?.id ?? "";
  await startEmailChange(`owner-other-${RUN}@other.test`);
  await confirmAsked();
  await clickInConfirm("Use another method");
  await clickInConfirm("Sign in with SSO");
  await clickInConfirm("Continue with SSO");
  await idpSignIn(stranger);
  const notLinked = await toastText();
  check(
    "Says that account isn't linked",
    notLinked.includes("isn't linked to your QRdx account"),
    notLinked,
  );
  await shot("04-not-linked");
  check("No account was made", userId(stranger) === "", userId(stranger));
  check(
    "Still signed in as the owner, in the same session",
    (await browserSession())?.session?.id === ownerSession,
  );
  check(
    "Not confirmed",
    sql(
      `select count(*) from verification where identifier=${q(`qrdx-confirmed-${ownerSession}`)}`,
    ) === "0",
  );
  check("Nothing is left behind", intentRows() === "0", intentRows());
  await dismissToasts();

  console.log("someone else at the identity provider: no switch");
  const bobSessions = sql(
    `select count(*) from session where user_id=${q(userId(bob))}`,
  );
  await startEmailChange(`owner-other-${RUN}@other.test`);
  await confirmAsked();
  await clickInConfirm("Use another method");
  await clickInConfirm("Sign in with SSO");
  await clickInConfirm("Continue with SSO");
  await idpSignIn(bob);
  const other = await toastText();
  check(
    "Says that account isn't linked",
    other.includes("isn't linked to your QRdx account"),
    other,
  );
  check(
    "Still the owner, same session",
    (await browserSession())?.session?.id === ownerSession,
  );
  check(
    "No session was made for Bob",
    sql(`select count(*) from session where user_id=${q(userId(bob))}`) ===
      bobSessions,
  );
  await dismissToasts();

  console.log("someone without SSO isn't offered it");
  await emailSignIn(plain);
  await startEmailChange(`plain-new-${RUN}@other.test`);
  await confirmAsked();
  await sleep(800);
  const plainMethods = await dialogText();
  check(
    "Only the emailed code: no other method",
    !plainMethods.includes("Use another method"),
    plainMethods.replace(/\s+/g, " ").slice(0, 160),
  );
  await clickInConfirm("Cancel");

  // ─── Support's "Change email" ───────────────────────────────────────────
  console.log("support moves an account");
  const admin = "admin@qrdx.test";
  await emailSignIn(admin);
  const plainId = userId(plain);
  await goto(`${BASE}/admin/users/${plainId}`, { wait: 3000 });
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Change email", {
        exact: true,
      }) as HTMLElement,
    ),
  );
  await waitFor(() =>
    Boolean(window.__e2e.byRole("dialog", "Move this account to a new email")),
  );
  const moved = `plain-moved-${RUN}@other.test`;
  const supportSince = statSync(DEV_LOG).size;
  await evaluate((value: string) => {
    const e = window.__e2e;
    e.setValue(e.byLabel("New email address") as HTMLElement, value);
    e.setValue(
      e.byLabel("Reason") as HTMLElement,
      "Lost-email policy: invoice matched, 7 days passed, e2e",
    );
  }, moved);
  await shot("05-admin-change-email");
  await evaluate(() => {
    const dialog = window.__e2e.byRole(
      "dialog",
      "Move this account to a new email",
    );
    window.__e2e.click(
      window.__e2e.byRole("button", "Change email", {
        exact: true,
        root: dialog ?? document,
      }) as HTMLElement,
    );
  });
  await waitText("Email changed and every session signed out");
  check(
    "Support moved the account",
    sql(`select email from "user" where id=${q(plainId)}`) === moved,
  );
  check(
    "Every session of that account is signed out",
    sql(`select count(*) from session where user_id=${q(plainId)}`) === "0",
  );
  check(
    "The audit log has it",
    sql(
      `select count(*) from admin_audit_log where action='user.change_email' and target_id=${q(plainId)}`,
    ) === "1",
  );
  await sleep(1500);
  const notice = readFileSync(DEV_LOG).subarray(supportSince).toString("utf8");
  check(
    "The old address is told (logged in dev)",
    notice.includes(`email-change notice for ${plain}`),
  );
} catch (error) {
  failures++;
  console.log(`  ✗ stopped: ${(error as Error).message}`);
  await shot("zz-failure").catch(() => {});
} finally {
  await browser.close();
}
const cspResult = csp.result(cspOn);
if (cspResult.skipped) {
  console.log(`\n  - no CSP violations: skipped (${cspResult.note})`);
} else {
  check("no CSP violations", cspResult.ok, cspResult.lines.join("\n      "));
}

console.log(failures === 0 ? "\nAll passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
