// More actions ask "Confirm it's you" (lib/account/confirmation.ts), end to
// end against a running dev server and a THROWAWAY local database, over the
// Chrome DevTools Protocol: changing someone's role, inviting an admin (and
// not a member), a join link that adds admins, removing someone, creating an
// API key, creating an OAuth app and making it a new client secret, linking
// GitHub and unlinking Google, deleting a workspace; signing out other
// sessions never asks. Better Auth's own endpoints for the same refuse an
// HTTP request without a confirmation (packages/auth/confirm-gate.ts). It
// writes to the database (test users, a Business subscription, a
// workspace), so it refuses to run unless DATABASE_URL in .env.local points
// at localhost.
//
// "Link" needs a GitHub app configured. Give the dev server a fake one
// (GITHUB_CLIENT_ID=e2e-fake-client, GITHUB_CLIENT_SECRET=anything): the
// browser's trip to github.com is intercepted here and never leaves the
// machine.
//
//   bun x next dev -p <port> > <dev.log>
//   CONFIRM_ACTIONS_E2E_BASE_URL=http://localhost:<port> \
//   CONFIRM_ACTIONS_E2E_DEV_LOG=<dev.log> \
//   CONFIRM_ACTIONS_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   CONFIRM_ACTIONS_E2E_SHOTS=<dir> bun x tsx e2e/confirm-actions.e2e.mts
//
// Each dialog is captured in light and dark, at desktop and phone widths.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cspEnforced, launch, recordCspViolations, sleep } from "./cdp.mjs";

const env = (name: string) => process.env[`CONFIRM_ACTIONS_E2E_${name}`] ?? "";
const BASE = env("BASE_URL").replace(/\/$/, "");
const DEV_LOG = env("DEV_LOG");
const PSQL = env("PSQL");
const SHOTS = env("SHOTS");
const RUN = Date.now().toString(36);
const ADA = `ada-${RUN}@qrdx.test`;
const BOB = `bob-${RUN}@qrdx.test`;
const SLUG = `team-${RUN}`;
const ORG = `org-${RUN}`;

for (const [name, value] of Object.entries({
  BASE_URL: BASE,
  DEV_LOG,
  PSQL,
})) {
  if (!value) throw new Error(`Set CONFIRM_ACTIONS_E2E_${name}`);
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

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const browser = await launch(DESKTOP);
const { cdp, evaluate, goto, waitFor } = browser;
const csp = await recordCspViolations(browser);
const cspOn = await cspEnforced(BASE);

/** A click outside a dialog closes it, so only while none is open. */
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

async function viewport(size: { width: number; height: number }) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    ...size,
    deviceScaleFactor: size === PHONE ? 2 : 1,
    mobile: size === PHONE,
  });
  await sleep(500);
}

/** The screen in light and dark, at desktop and phone widths. */
async function shot(name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  for (const [width, size] of [
    ["desktop", DESKTOP],
    ["phone", PHONE],
  ] as const) {
    await viewport(size);
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

const href = () => evaluate(() => location.href as string);
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

/** A real mouse click (Radix menus and selects ignore synthetic ones). */
async function mouseClick(find: string) {
  const box = await evaluate((source: string) => {
    const el = new Function(`return (${source})()`)() as Element | null;
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, find);
  if (!box) throw new Error(`Nothing to click: ${find}`);
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
const clickButton = (label: string, root = "document") =>
  evaluate(
    (l: string, r: string) => {
      const scope =
        r === "document"
          ? document
          : (document.querySelector(r) as HTMLElement | null);
      const button = scope
        ? window.__e2e.byRole("button", l, { exact: true, root: scope })
        : null;
      if (!button) return false;
      window.__e2e.click(button);
      return true;
    },
    label,
    root,
  );

function latestCode(email: string): string {
  const log = readFileSync(DEV_LOG, "utf8");
  const matches = [...log.matchAll(/sign-in code for (\S+): (\d{6})/g)].filter(
    (m) => m[1] === email,
  );
  const code = matches.at(-1)?.[2];
  if (!code) throw new Error(`No code in the dev log for ${email}`);
  return code;
}
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

/** Answers the open "Confirm it's you" with an emailed code. */
async function confirmByEmail() {
  const since = statSync(DEV_LOG).size;
  await clickInConfirm("Send code");
  const code = await codeSince(
    new RegExp(`confirmation code for ${escapeRegExp(ADA)}: (\\d{6})`),
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

/**
 * The dialog opened for `action` ("Before you <action>, …"): checked, shot,
 * then answered (or closed, leaving nothing changed).
 */
async function asked(action: string, shotName: string | null) {
  const open = await confirmAsked();
  // The dialog loads the account's methods first.
  if (open) {
    await waitFor(
      (t: string) =>
        Boolean(
          window.__e2e.byRole("button", "Send code", {
            exact: true,
            root: window.__e2e.byRole("dialog", t) ?? document,
          }),
        ),
      { args: [CONFIRM] as never[] },
    ).catch(() => null);
  }
  const body = open ? await dialogText() : "";
  check(
    `"${CONFIRM}" asks before you ${action}`,
    open && body.includes(`Before you ${action}, we need to check it's you.`),
    body.replace(/\s+/g, " ").slice(0, 160),
  );
  if (open && shotName) await shot(shotName);
  return open;
}
async function closeConfirm() {
  await clickInConfirm("Close");
  await waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
    args: [CONFIRM] as never[],
  });
}

/** As if 10 minutes had passed: this session's confirmation is gone. */
const forgetConfirmation = () =>
  sql(
    `delete from verification where identifier like 'qrdx-confirmed-%' and value=${q(userId(ADA))}`,
  );
const userId = (email: string) =>
  sql(`select id from "user" where email=${q(email)}`);

async function toastText() {
  await waitFor(() => Boolean(document.querySelector("[data-sonner-toast]")), {
    timeout: 20_000,
  }).catch(() => null);
  const read = () => {
    const toast = document.querySelector(
      "[data-sonner-toast]",
    ) as HTMLElement | null;
    // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
    return toast?.innerText ?? "";
  };
  return (await evaluate(read)) as string;
}

const api = (path: string, body: unknown) =>
  evaluate(
    async (p: string, b: unknown) => {
      const response = await fetch(`/api/auth${p}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(b),
      });
      const json = await response.json().catch(() => null);
      return { status: response.status, code: json?.code ?? null };
    },
    path,
    body,
  ) as Promise<{ status: number; code: string | null }>;

try {
  console.log("set-up");
  await emailSignIn(BOB);
  await emailSignIn(ADA);
  const adaId = userId(ADA);
  const bobId = userId(BOB);
  sql(
    `insert into subscription (id, created_at, amount, currency, recurring_interval, status, current_period_start, current_period_end, started_at, customer_id, product_id, checkout_id, user_id) values ('sub-${RUN}', now(), 1500, 'usd', 'month', 'active', now(), now() + interval '30 days', now(), 'cus-${RUN}', 'local-business-monthly', 'chk-${RUN}', ${q(adaId)})`,
  );
  sql(
    `insert into organization (id, name, slug, created_at) values (${q(ORG)}, 'Team ${RUN}', ${q(SLUG)}, now())`,
  );
  sql(
    `insert into member (id, organization_id, user_id, role, created_at) values ('m-ada-${RUN}', ${q(ORG)}, ${q(adaId)}, 'owner', now()), ('m-bob-${RUN}', ${q(ORG)}, ${q(bobId)}, 'member', now())`,
  );
  forgetConfirmation();
  check(
    "A fresh sign-in has no confirmation yet",
    sql(
      `select count(*) from verification where identifier like 'qrdx-confirmed-%' and value=${q(adaId)}`,
    ) === "0",
  );

  console.log("Better Auth over HTTP, without a confirmation");
  const bobRole = () =>
    sql(`select role from member where id='m-bob-${RUN}'`) || "(gone)";
  for (const [label, path, body] of [
    ["link GitHub", "/link-social", { provider: "github" }],
    ["unlink an account", "/unlink-account", { accountId: "acc-none" }],
    [
      "change a role",
      "/organization/update-member-role",
      { memberId: `m-bob-${RUN}`, role: "admin", organizationId: ORG },
    ],
    [
      "remove a member",
      "/organization/remove-member",
      { memberIdOrEmail: `m-bob-${RUN}`, organizationId: ORG },
    ],
    ["delete the workspace", "/organization/delete", { organizationId: ORG }],
    [
      "invite an admin",
      "/organization/invite-member",
      { email: `cy-${RUN}@qrdx.test`, role: "admin", organizationId: ORG },
    ],
  ] as const) {
    const result = await api(path, body);
    check(
      `HTTP ${path} (${label}) refused: CONFIRMATION_REQUIRED`,
      result.status === 403 && result.code === "CONFIRMATION_REQUIRED",
      JSON.stringify(result),
    );
  }
  check("…and nothing changed", bobRole() === "member");
  check(
    "…no invitation made",
    sql(`select count(*) from invitation where email='cy-${RUN}@qrdx.test'`) ===
      "0",
  );
  const memberInvite = await api("/organization/invite-member", {
    email: `dee-${RUN}@qrdx.test`,
    role: "member",
    organizationId: ORG,
  });
  check(
    "HTTP invite as a member isn't gated",
    memberInvite.code !== "CONFIRMATION_REQUIRED",
    JSON.stringify(memberInvite),
  );
  const signOutOthers = await api("/revoke-other-sessions", {});
  check(
    "HTTP sign out other sessions isn't gated",
    signOutOthers.status === 200,
    JSON.stringify(signOutOthers),
  );

  console.log(
    "Better Auth's admin endpoints over HTTP: not there, even for an admin",
  );
  // packages/auth/admin-http.ts: the admin panel calls them server-side
  // only, after its own checks and audit log.
  const adaRole = sql(
    `select coalesce(role, '') from "user" where id=${q(adaId)}`,
  );
  sql(`update "user" set role='admin' where id=${q(adaId)}`);
  const raw = (method: "GET" | "POST", path: string, body?: unknown) =>
    evaluate(
      async (m: string, p: string, b: unknown) => {
        const response = await fetch(p, {
          method: m,
          headers: b == null ? {} : { "content-type": "application/json" },
          body: b == null ? undefined : JSON.stringify(b),
        });
        return response.status;
      },
      method,
      path,
      body,
    ) as Promise<number>;
  for (const [method, path, body] of [
    ["GET", "/api/auth/admin/list-users", undefined],
    ["GET", "/api/auth/admin/get-user?id=x", undefined],
    ["POST", "/api/auth/admin/set-role", { userId: bobId, role: "admin" }],
    ["POST", "/api/auth/admin/update-user", { userId: bobId, data: {} }],
    ["POST", "/api/auth/admin/impersonate-user", { userId: bobId }],
    // One a later version might add, another case, an encoded slash.
    ["POST", "/api/auth/admin/some-future-endpoint", {}],
    ["GET", "/api/auth/Admin/list-users", undefined],
    ["GET", "/api/auth/admin%2Flist-users", undefined],
  ] as const) {
    const status = await raw(method, path, body);
    check(`${method} ${path}: 404`, status === 404, String(status));
  }
  check(
    "…and Bob is still not an admin",
    sql(`select coalesce(role, '') from "user" where id=${q(bobId)}`) !==
      "admin",
  );
  sql(
    `update "user" set role=${adaRole ? q(adaRole) : "null"} where id=${q(adaId)}`,
  );

  console.log("team: change a role");
  const team = `${BASE}/dashboard/${SLUG}/settings/team`;
  await goto(team, { wait: 3000 });
  await dismissCookieBanner();
  await mouseClick(
    `() => window.__e2e.byLabel("Role for ${BOB}") ?? document.querySelector('[aria-label="Role for ${BOB}"]')`,
  );
  await sleep(600);
  await mouseClick(`() => window.__e2e.byRole("option", "Admin")`);
  if (await asked("change someone's role", "01-change-role")) {
    check("Not changed while asking", bobRole() === "member");
    await confirmByEmail();
    check(
      "Confirmed: the role changes",
      (await toastText()).includes("is now admin") && bobRole() === "admin",
      bobRole(),
    );
  }
  const afterConfirm = await api("/organization/update-member-role", {
    memberId: `m-bob-${RUN}`,
    role: "member",
    organizationId: ORG,
  });
  check(
    "HTTP gate lets the same session through for 10 minutes",
    afterConfirm.status === 200 && bobRole() === "member",
    JSON.stringify(afterConfirm),
  );

  console.log("team: only exact role names, even when confirmed");
  // A role with spaces, another case or several parts must never be stored:
  // one that reads as "owner" anywhere would make an owner.
  const oddRoles = [
    " owner",
    "owner ",
    "Owner",
    "OWNER",
    "member,owner",
    "member, owner",
    "owner,member",
  ];
  for (const role of oddRoles) {
    const result = await api("/organization/update-member-role", {
      memberId: `m-bob-${RUN}`,
      role,
      organizationId: ORG,
    });
    check(
      `HTTP change a role to ${JSON.stringify(role)}: refused, unchanged`,
      result.status >= 400 && bobRole() === "member",
      `${JSON.stringify(result)} role=${bobRole()}`,
    );
  }
  for (const [index, role] of oddRoles.entries()) {
    const email = `odd${index}-${RUN}@qrdx.test`;
    const result = await api("/organization/invite-member", {
      email,
      role,
      organizationId: ORG,
    });
    check(
      `HTTP invite as ${JSON.stringify(role)}: refused, nobody invited`,
      result.status >= 400 &&
        sql(`select count(*) from invitation where email=${q(email)}`) === "0",
      JSON.stringify(result),
    );
  }
  // So a failure above can't spill into the checks below.
  sql(`update member set role='member' where id='m-bob-${RUN}'`);

  console.log("team: invite an admin, then a member");
  forgetConfirmation();
  await goto(team, { wait: 3000 });
  const fillInvite = async (email: string, role: string) => {
    await evaluate((e: string) => {
      window.__e2e.setValue(
        document.getElementById("invite-email") as HTMLElement,
        e,
      );
    }, email);
    await mouseClick(`() => document.getElementById("invite-role")`);
    await sleep(600);
    await mouseClick(`() => window.__e2e.byRole("option", "${role}")`);
    await sleep(400);
    await clickButton("Create invite link");
  };
  await fillInvite(`eli-${RUN}@qrdx.test`, "Admin");
  if (await asked("invite an admin", "02-invite-admin")) {
    await closeConfirm();
    await sleep(800);
    check(
      "Closing the dialog invites nobody",
      sql(
        `select count(*) from invitation where email='eli-${RUN}@qrdx.test'`,
      ) === "0",
    );
    await clickButton("Create invite link");
    if (await confirmAsked()) await confirmByEmail();
    await waitText(`eli-${RUN}@qrdx.test`);
    check(
      "Confirmed: the admin is invited",
      sql(`select role from invitation where email='eli-${RUN}@qrdx.test'`) ===
        "admin",
    );
  }
  forgetConfirmation();
  await goto(team, { wait: 3000 });
  await fillInvite(`fay-${RUN}@qrdx.test`, "Member");
  await sleep(2500);
  check("Inviting a member doesn't ask", !(await confirmAsked(2000)));
  check(
    "…and invites them",
    sql(`select role from invitation where email='fay-${RUN}@qrdx.test'`) ===
      "member",
  );

  console.log("team: a join link that adds admins");
  forgetConfirmation();
  await goto(team, { wait: 3000 });
  await mouseClick(`() => document.getElementById("join-role")`);
  await sleep(600);
  await mouseClick(`() => window.__e2e.byRole("option", "Admin")`);
  await sleep(400);
  await clickButton("Create join link");
  if (await asked("let a join link add admins", "03-admin-join-link")) {
    check(
      "No link while asking",
      sql(
        `select count(*) from workspace_join_link where organization_id=${q(ORG)}`,
      ) === "0",
    );
    await confirmByEmail();
    await waitText("Join link created");
    check(
      "Confirmed: the admin link exists",
      sql(
        `select role from workspace_join_link where organization_id=${q(ORG)}`,
      ) === "admin",
    );
  }

  console.log("team: remove someone");
  forgetConfirmation();
  await goto(team, { wait: 3000 });
  await evaluate((email: string) => {
    const row = [...document.querySelectorAll("tr")].find((tr) =>
      tr.textContent?.includes(email),
    );
    const button = row
      ? window.__e2e.byRole("button", "Remove", { exact: true, root: row })
      : null;
    if (button) window.__e2e.click(button);
  }, BOB);
  await sleep(600);
  await clickButton("Remove member", '[role="alertdialog"]');
  if (await asked("remove someone from this workspace", "04-remove-member")) {
    check("Still a member while asking", bobRole() === "member");
    await confirmByEmail();
    await waitText("Removed");
    check("Confirmed: removed", bobRole() === "(gone)", bobRole());
  }

  console.log("developers: an API key");
  forgetConfirmation();
  const developers = `${BASE}/dashboard/${SLUG}/settings/developers`;
  await goto(developers, { wait: 3000 });
  await dismissCookieBanner();
  await clickButton("Create key");
  await waitFor(() => Boolean(window.__e2e.byRole("dialog", "Create API key")));
  await clickButton("Create key", '[role="dialog"]');
  const keys = () =>
    sql(`select count(*) from api_key where organization_id=${q(ORG)}`);
  if (await asked("create an API key", "05-create-api-key")) {
    check("No key while asking", keys() === "0");
    await confirmByEmail();
    check("Confirmed: the key is shown once", await waitText("qrdx_"));
    check("…and saved", keys() === "1");
  }

  console.log("developers: an OAuth app and a new client secret");
  forgetConfirmation();
  await goto(`${developers}/new`, { wait: 3000 });
  await evaluate((run: string) => {
    const e = window.__e2e;
    e.setValue(e.byLabel("Name") as HTMLElement, `E2E app ${run}`);
    e.setValue(e.byLabel("Website") as HTMLElement, "https://example.com");
    e.setValue(
      e.byLabel("Redirect URIs") as HTMLElement,
      "https://example.com/callback",
    );
  }, RUN);
  await clickButton("Create app");
  const apps = () =>
    sql(`select count(*) from oauth_app where organization_id=${q(ORG)}`);
  if (await asked("create an OAuth app", "06-create-oauth-app")) {
    check("No app while asking", apps() === "0");
    await confirmByEmail();
    check("Confirmed: the app and its secret", await waitText("App created"));
    check("…and saved", apps() === "1");
  }
  const appId = sql(`select id from oauth_app where organization_id=${q(ORG)}`);
  const secretHash = () =>
    sql(`select client_secret_hash from oauth_app where id=${q(appId)}`);
  if (appId) {
    forgetConfirmation();
    const before = secretHash();
    await goto(`${developers}/${appId}`, { wait: 3000 });
    await dismissCookieBanner();
    await clickButton("Regenerate secret");
    await sleep(500);
    await clickButton("Regenerate secret", '[role="alertdialog"]');
    if (await asked("make a new client secret", "07-new-client-secret")) {
      check("Same secret while asking", secretHash() === before);
      await confirmByEmail();
      check("Confirmed: a new secret", await waitText("New client secret"));
      check("…and the old one is gone", secretHash() !== before);
    }
  }

  console.log("account: link GitHub, unlink Google, sign out others");
  forgetConfirmation();
  const accountPage = `${BASE}/settings/account`;
  await goto(accountPage, { wait: 3000 });
  await dismissCookieBanner();
  await evaluate(() => {
    const row = [...document.querySelectorAll("li")].find(
      (li) =>
        li.textContent?.includes("GitHub") &&
        li.textContent?.includes("Not linked"),
    );
    const button = row
      ? window.__e2e.byRole("button", "Link", { exact: true, root: row })
      : null;
    if (button) window.__e2e.click(button);
  });
  if (await asked("link a sign-in method", "08-link-sign-in")) {
    // The provider's page never loads: answered here, off the network.
    let providerUrl = "";
    await cdp.send("Fetch.enable", {
      patterns: [{ urlPattern: "https://github.com/*" }],
    });
    const intercept = (message: {
      method: string;
      params?: { requestId: string; request: { url: string } };
    }) => {
      if (message.method !== "Fetch.requestPaused" || !message.params) return;
      const url = message.params.request.url;
      // The authorize page; the stub's favicon follows it.
      if (url.includes("/login/oauth/authorize")) providerUrl = url;
      void cdp.send("Fetch.fulfillRequest", {
        requestId: message.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: "content-type", value: "text/html" }],
        body: Buffer.from("<p>stub provider</p>").toString("base64"),
      });
    };
    cdp.on(intercept as never);
    await confirmByEmail();
    for (let i = 0; i < 60 && !providerUrl; i++) await sleep(250);
    cdp.off(intercept as never);
    await cdp.send("Fetch.disable");
    const url = providerUrl ? new URL(providerUrl) : null;
    check(
      "Confirmed: off to GitHub with the app's client id and a state",
      url?.host === "github.com" &&
        url.searchParams.get("client_id") === "e2e-fake-client" &&
        Boolean(url.searchParams.get("state")),
      providerUrl.slice(0, 120),
    );
    const { cookies } = (await cdp.send("Network.getCookies", {
      urls: [BASE],
    })) as { cookies: { name: string }[] };
    check(
      "…holding the link flow's state cookie",
      cookies.some((cookie) => cookie.name.endsWith("better-auth.state")),
    );
  }

  sql(
    `insert into account (id, account_id, provider_id, user_id, created_at, updated_at) values ('acc-g-${RUN}', 'g-${RUN}', 'google', ${q(adaId)}, now(), now())`,
  );
  forgetConfirmation();
  await goto(accountPage, { wait: 3000 });
  await dismissCookieBanner();
  await evaluate(() => {
    const row = [...document.querySelectorAll("li")].find(
      (li) =>
        li.textContent?.includes("Google") &&
        li.textContent?.includes("Linked"),
    );
    const button = row
      ? window.__e2e.byRole("button", "Unlink", { exact: true, root: row })
      : null;
    if (button) window.__e2e.click(button);
  });
  await sleep(600);
  await clickButton("Unlink", '[role="alertdialog"]');
  const google = () =>
    sql(`select count(*) from account where id='acc-g-${RUN}'`);
  if (await asked("unlink a sign-in method", "09-unlink-sign-in")) {
    check("Still linked while asking", google() === "1");
    await confirmByEmail();
    check(
      "Confirmed: unlinked",
      (await toastText()).includes("Google is no longer linked") &&
        google() === "0",
    );
  }

  forgetConfirmation();
  sql(
    `insert into session (id, token, user_id, created_at, updated_at, expires_at) values ('s-other-${RUN}', 'tok-other-${RUN}', ${q(adaId)}, now(), now(), now() + interval '1 day')`,
  );
  await goto(accountPage, { wait: 3000 });
  await dismissCookieBanner();
  await clickButton("Sign out everywhere else");
  await sleep(500);
  await clickButton("Sign out others", '[role="alertdialog"]');
  await sleep(2500);
  check("Signing out others doesn't ask", !(await confirmAsked(1500)));
  check(
    "…and signs them out",
    sql(`select count(*) from session where id='s-other-${RUN}'`) === "0",
  );

  console.log("workspace: delete it");
  forgetConfirmation();
  await goto(`${BASE}/dashboard/${SLUG}/settings`, { wait: 3000 });
  await dismissCookieBanner();
  await clickButton("Delete workspace");
  await waitFor(() => Boolean(document.getElementById("confirm-team-slug")));
  await evaluate((slug: string) => {
    window.__e2e.setValue(
      document.getElementById("confirm-team-slug") as HTMLElement,
      slug,
    );
  }, SLUG);
  await sleep(300);
  await clickButton("Delete workspace", '[role="alertdialog"]');
  const orgs = () =>
    sql(`select count(*) from organization where id=${q(ORG)}`);
  if (await asked("delete this workspace", "10-delete-workspace")) {
    check("Still there while asking", orgs() === "1");
    await confirmByEmail();
    await waitFor(() => !location.pathname.includes("/settings"), {
      timeout: 20_000,
    }).catch(() => null);
    check("Confirmed: deleted", orgs() === "0", await href());
  }

  check(
    "No uncaught page errors",
    browser.consoleErrors.length === 0,
    browser.consoleErrors.slice(0, 3).join(" | "),
  );
} catch (error) {
  failures++;
  console.log(`  ✗ stopped: ${(error as Error).message}`);
  await shot("zz-stopped").catch(() => {});
} finally {
  await browser.close();
}
const cspResult = csp.result(cspOn);
if (cspResult.skipped) {
  console.log(`\n  - no CSP violations: skipped (${cspResult.note})`);
} else {
  check("no CSP violations", cspResult.ok, cspResult.lines.join("\n      "));
}

console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);
