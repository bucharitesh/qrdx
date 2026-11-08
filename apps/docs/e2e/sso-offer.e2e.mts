// SSO offered from the sign-in email (ee/sso/sign-in-offer.ts,
// ee/sso/sso-offer.tsx): typing an address whose domain signs in with SSO
// offers "Continue with SSO" before any code is emailed, with the code still
// a click away. End to end against a running dev server, the local mock
// identity provider and a THROWAWAY local database, over the Chrome DevTools
// Protocol. It writes to the database (test users, a Business subscription,
// an SSO connection), so it refuses to run unless DATABASE_URL in .env.local
// points at localhost.
//
// Needs, all local (the same set-up as e2e/sso.e2e.mts; pick your ports):
//   node e2e/sso/dns-stub.mjs <records.json> <dns port>
//   node e2e/sso/mock-idp.mjs <idp port>
//   NODE_OPTIONS="--require $PWD/e2e/sso/dns-preload.cjs" \
//   QRDX_TEST_DNS_SERVER=127.0.0.1:<dns port> \
//   BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:<idp port> \
//     pnpm exec next dev -p <port> > <dev.log>
//
//   SSO_OFFER_E2E_BASE_URL=http://localhost:<port> \
//   SSO_OFFER_E2E_IDP=http://localhost:<idp port> \
//   SSO_OFFER_E2E_DEV_LOG=<dev.log> SSO_OFFER_E2E_DNS_FILE=<records.json> \
//   SSO_OFFER_E2E_PSQL="psql -h localhost -p <pg> -U postgres qrdx" \
//   SSO_OFFER_E2E_SHOTS=<dir> pnpm exec tsx e2e/sso-offer.e2e.mts
//
// SSO_OFFER_E2E_MOBILE=1: a 390 x 844 phone; the offer's screens only, with
// a horizontal-scroll check. SSO_OFFER_E2E_EXPECT=off: against a server
// WITHOUT QRDX_EE_LICENSE; an address at a domain with a verified
// connection gets its code straight away and nothing is looked up.
//
// Covers (licensed): the offer on /sign-in and in the dialog, with no code
// emailed until asked for; the same answer for an address with an account
// and one without; "Use a different email" keeps the address; "Email me a
// code" from the offer signs in with the code; "Continue with SSO" signs in
// through the identity provider; no offer for a domain without SSO, or when
// the workspace isn't on Business; a plan dropped after the offer says so
// and leaves the code; the separate "Sign in with SSO" link; the per-IP
// limit (60 a minute), after which the code is just sent.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, sleep } from "./cdp.mjs";

const BASE = (process.env.SSO_OFFER_E2E_BASE_URL ?? "").replace(/\/$/, "");
const IDP = (process.env.SSO_OFFER_E2E_IDP ?? "http://localhost:4455").replace(
  /\/$/,
  "",
);
const DEV_LOG = process.env.SSO_OFFER_E2E_DEV_LOG ?? "";
const DNS_FILE = process.env.SSO_OFFER_E2E_DNS_FILE ?? "";
const PSQL = process.env.SSO_OFFER_E2E_PSQL ?? "";
const SHOTS = process.env.SSO_OFFER_E2E_SHOTS ?? "";
const MOBILE = process.env.SSO_OFFER_E2E_MOBILE === "1";
const EXPECT_OFF = process.env.SSO_OFFER_E2E_EXPECT === "off";
const RUN = Date.now().toString(36);
const DOMAIN = `offer-${RUN}.test`;

for (const [name, value] of Object.entries({ BASE, DEV_LOG, PSQL })) {
  if (!value) {
    throw new Error(`Set SSO_OFFER_E2E_${name === "BASE" ? "BASE_URL" : name}`);
  }
}
if (!(EXPECT_OFF || DNS_FILE)) throw new Error("Set SSO_OFFER_E2E_DNS_FILE");
// Throwaway databases only.
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

const browser = await launch(
  MOBILE ? { width: 390, height: 844 } : { width: 1280, height: 900 },
);
const { cdp, evaluate, goto, waitFor } = browser;
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

// ─── Server action calls (the SSO check) ──────────────────────────────────

interface ActionCall {
  url: string;
  headers: Record<string, string>;
  body: string;
  response?: string;
}
const actionCalls: ActionCall[] = [];
const pending = new Map<string, ActionCall>();
await cdp.send("Network.enable");
cdp.on((message: { method: string; params: Record<string, any> }) => {
  if (message.method === "Network.requestWillBeSent") {
    const { requestId, request } = message.params;
    const headers = request.headers as Record<string, string>;
    const isAction = Object.keys(headers).some(
      (name) => name.toLowerCase() === "next-action",
    );
    if (request.method === "POST" && isAction) {
      const call = { url: request.url, headers, body: request.postData ?? "" };
      actionCalls.push(call);
      pending.set(requestId, call);
    }
  }
  if (message.method === "Network.loadingFinished") {
    const call = pending.get(message.params.requestId);
    if (!call) return;
    pending.delete(message.params.requestId);
    cdp
      .send("Network.getResponseBody", {
        requestId: message.params.requestId,
      })
      .then((result: { body: string }) => {
        call.response = result.body;
      })
      .catch(() => {});
  }
});
/** The SSO checks (server action calls whose argument is `email`). */
const checksFor = (email: string) =>
  actionCalls.filter((call) => call.body.includes(JSON.stringify(email)));
const answer = (response = "") => response.match(/"sso":(true|false)/)?.[1];

// ─── Page helpers ──────────────────────────────────────────────────────────

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
  const dir = MOBILE ? join(SHOTS, "mobile") : SHOTS;
  mkdirSync(dir, { recursive: true });
  if (MOBILE) {
    const overflow = (await evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )) as number;
    check(`${name}: no horizontal scroll at 390 px`, overflow <= 0);
  }
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
      join(dir, `${name}-${scheme}.png`),
      Buffer.from(captured.data, "base64"),
    );
  }
  await evaluate(() => document.documentElement.classList.remove("dark"));
}

// biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
const text = () => evaluate(() => document.body.innerText as string);
const href = () => evaluate(() => location.href as string);

async function waitText(needle: string, timeout = 20_000) {
  // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
  return waitFor((n: string) => document.body.innerText.includes(n), {
    args: [needle] as never[],
    timeout,
  });
}

const logSize = () => statSync(DEV_LOG).size;
/** The sign-in code for `email` logged after `since`, or "". */
function codeSince(email: string, since: number): string {
  const log = readFileSync(DEV_LOG).subarray(since).toString("utf8");
  const matches = [...log.matchAll(/sign-in code for (\S+): (\d{6})/g)].filter(
    (m) => m[1] === email,
  );
  return matches.at(-1)?.[2] ?? "";
}
async function waitCode(email: string, since: number): Promise<string> {
  for (let i = 0; i < 80; i++) {
    const code = codeSince(email, since);
    if (code) return code;
    await sleep(250);
  }
  throw new Error(`No sign-in code in the dev log for ${email}`);
}

/** Email-code sign-in through the endpoints the panel calls (set-up only). */
async function apiSignIn(email: string) {
  await cdp.send("Network.clearBrowserCookies");
  await goto(`${BASE}/sign-in`);
  const since = logSize();
  const sent = await evaluate(async (e: string) => {
    const r = await fetch("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: e, type: "sign-in" }),
    });
    return r.status;
  }, email);
  if (sent !== 200) throw new Error(`send code ${sent}`);
  const otp = await waitCode(email, since);
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

const sessionEmail = () =>
  evaluate(async () => {
    const r = await fetch("/api/auth/get-session");
    const data = await r.json().catch(() => null);
    return (data?.user?.email as string | undefined) ?? "";
  }) as Promise<string>;

/** Opens /sign-in (or the dialog over /playground) signed out. */
async function openPanel({ dialog = false } = {}) {
  await cdp.send("Network.clearBrowserCookies");
  if (!dialog) {
    await goto(`${BASE}/sign-in`);
  } else {
    await goto(`${BASE}/playground`, { wait: 2500 });
    await waitFor(() =>
      Boolean(window.__e2e.byRole("button", "Sign in", { exact: true })),
    );
    await dismissCookieBanner();
    await evaluate(() =>
      window.__e2e.click(
        window.__e2e.byRole("button", "Sign in", {
          exact: true,
        }) as HTMLElement,
      ),
    );
  }
  await waitFor(() => Boolean(window.__e2e.byLabel("Email address")), {
    timeout: 30_000,
  });
  await dismissCookieBanner();
}

/** Types `email` and clicks "Email me a code". */
async function submitEmail(email: string) {
  await evaluate((e: string) => {
    window.__e2e.setValue(
      window.__e2e.byLabel("Email address") as HTMLElement,
      e,
    );
  }, email);
  await evaluate(() =>
    window.__e2e.click(
      window.__e2e.byRole("button", "Email me a code", {
        exact: true,
      }) as HTMLElement,
    ),
  );
}

/** Which step the email led to: "sso", "code" or "" (timed out). */
async function stepAfterSubmit(timeout = 20_000): Promise<string> {
  return waitFor(
    () => {
      if (window.__e2e.byRole("button", "Continue with SSO", { exact: true }))
        return "sso";
      if (document.querySelector("[data-input-otp]")) return "code";
      return "";
    },
    { timeout },
  ).catch(() => "") as Promise<string>;
}

const clickButton = (label: string) =>
  evaluate(
    (l: string) =>
      window.__e2e.click(
        window.__e2e.byRole("button", l, { exact: true }) as HTMLElement,
      ),
    label,
  );

const visibleButton = (label: string) =>
  evaluate(
    (l: string) => Boolean(window.__e2e.byRole("button", l, { exact: true })),
    label,
  ) as Promise<boolean>;

async function enterCode(code: string) {
  await waitFor(
    (value: string) => {
      const input = document.querySelector(
        "[data-input-otp]",
      ) as HTMLInputElement | null;
      if (!input || input.disabled) return false;
      input.focus();
      window.__e2e.setValue(input, value);
      return true;
    },
    { args: [code] as never[] },
  );
}

/** "Confirm it's you" with an emailed code (an owner without two-step). */
async function confirmByEmail(email: string) {
  const title = "Confirm it's you";
  await waitFor((t: string) => Boolean(window.__e2e.byRole("dialog", t)), {
    args: [title] as never[],
    timeout: 20_000,
  });
  const since = logSize();
  await waitFor(
    (t: string) => {
      const dialog = window.__e2e.byRole("dialog", t);
      const button = dialog
        ? window.__e2e.byRole("button", "Send code", {
            exact: true,
            root: dialog,
          })
        : null;
      if (!button || (button as HTMLButtonElement).disabled) return false;
      window.__e2e.click(button);
      return true;
    },
    { args: [title] as never[] },
  );
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`confirmation code for ${escaped}: (\\d{6})`);
  let code = "";
  for (let i = 0; i < 80 && !code; i++) {
    code =
      readFileSync(DEV_LOG)
        .subarray(since)
        .toString("utf8")
        .match(pattern)?.[1] ?? "";
    if (!code) await sleep(250);
  }
  if (!code) throw new Error(`No confirmation code for ${email}`);
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
    { args: [title, code] as never[] },
  );
  await waitFor((t: string) => !window.__e2e.byRole("dialog", t), {
    args: [title] as never[],
  });
}

const userId = (email: string) =>
  sql(`select id from "user" where email=${q(email)}`);

// ─── Runs ──────────────────────────────────────────────────────────────────

async function setUpConnection(owner: string) {
  await apiSignIn(owner);
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
  await clickButton("Verify");
  await waitText("Verified");
  const verified =
    sql(
      `select domain_verified from sso_provider where provider_id=${q(providerId)}`,
    ) === "t";
  check("Set-up: a verified OIDC connection on Business", verified);
  if (!verified) throw new Error("set-up failed");
  return { orgId, ownerId };
}

const setPlan = (status: "active" | "canceled") =>
  sql(`update subscription set status=${q(status)} where id='sub-${RUN}'`);

async function licensedRun() {
  const owner = `owner@${DOMAIN}`;
  const newcomer = `new-${RUN}@${DOMAIN}`; // no account
  const bob = `bob-${RUN}@${DOMAIN}`; // has an account
  const ssoPerson = `sso-${RUN}@${DOMAIN}`;
  const plain = `plain-${RUN}@qrdx.test`; // a domain without SSO

  console.log("set-up");
  const { orgId } = await setUpConnection(owner);
  await apiSignIn(bob);
  check("Set-up: Bob has an account", Boolean(userId(bob)));

  // ─── The offer ───────────────────────────────────────────────────────
  console.log("the offer on /sign-in");
  await openPanel();
  check(
    "The separate Sign in with SSO link is still there",
    await visibleButton("Sign in with SSO"),
  );
  let since = logSize();
  const started = Date.now();
  await submitEmail(newcomer);
  const step = await stepAfterSubmit();
  const ms = Date.now() - started;
  check("An SSO domain gets the offer", step === "sso", `${step} in ${ms} ms`);
  const offerText = await text();
  check(
    "It says why, and keeps the code available",
    offerText.includes("Sign in with SSO") &&
      offerText.includes("Your company signs in with single sign-on.") &&
      (await visibleButton("Email me a code")) &&
      (await visibleButton("Use a different email")),
    offerText.replace(/\s+/g, " ").slice(0, 240),
  );
  check(
    "Google, GitHub, passkey and the SSO link step aside",
    !(
      (await visibleButton("Google")) ||
      (await visibleButton("GitHub")) ||
      (await visibleButton("Sign in with SSO")) ||
      (await visibleButton("Continue with passkey"))
    ),
  );
  check(
    "Continue with SSO has the focus",
    (await evaluate(
      // biome-ignore lint/performance/useDomNodeTextContent: the text a person sees
      () => (document.activeElement as HTMLElement | null)?.innerText ?? "",
    )) === "Continue with SSO",
  );
  await sleep(1500);
  check("No code was emailed", codeSince(newcomer, since) === "");
  await shot("01-offer");

  console.log("same answer with or without an account");
  await clickButton("Use a different email");
  await waitFor(() => Boolean(window.__e2e.byLabel("Email address")));
  const back = (await evaluate(() => {
    const input = window.__e2e.byLabel("Email address") as HTMLInputElement;
    return { value: input.value, focused: document.activeElement === input };
  })) as { value: string; focused: boolean };
  check(
    "Use a different email: back to the address, kept and focused",
    back.value === newcomer && back.focused,
    JSON.stringify(back),
  );
  await submitEmail(bob);
  check(
    "An address with an account gets the same offer",
    (await stepAfterSubmit()) === "sso",
  );
  await sleep(800);
  const [newcomerCheck] = checksFor(newcomer);
  const [bobCheck] = checksFor(bob);
  check(
    "The check answers the same for both (domain only)",
    Boolean(newcomerCheck?.response) &&
      newcomerCheck?.response === bobCheck?.response &&
      answer(newcomerCheck?.response) === "true",
    JSON.stringify([newcomerCheck?.response, bobCheck?.response]),
  );
  // The action's value is the payload's object line other than the header
  // ("a": …); dev servers add a debug line ("1:D…") that isn't a value.
  const values = (newcomerCheck?.response ?? "")
    .split("\n")
    .filter((line) => /^\d+:\{/.test(line) && !/^\d+:\{"a":/.test(line))
    .map((line) => line.replace(/^\d+:/, ""));
  check(
    "The check gets back a yes or no and nothing else",
    values.length === 1 && values[0] === '{"sso":true}',
    JSON.stringify(values),
  );

  console.log("Email me a code from the offer");
  await clickButton("Use a different email");
  await submitEmail(newcomer);
  await stepAfterSubmit();
  since = logSize();
  await clickButton("Email me a code");
  const code = await waitCode(newcomer, since);
  await waitText("Check your email");
  await shot("04-code-after-offer");
  await enterCode(code);
  await waitFor(() => !document.querySelector("[data-input-otp]"), {
    timeout: 20_000,
  }).catch(() => {});
  await sleep(1500);
  check("Signs in with the code instead", (await sessionEmail()) === newcomer);

  console.log("Continue with SSO");
  await openPanel();
  since = logSize();
  await submitEmail(ssoPerson);
  await stepAfterSubmit();
  await clickButton("Continue with SSO");
  await waitFor((idp: string) => location.href.startsWith(idp), {
    args: [IDP] as never[],
    timeout: 20_000,
  }).catch(() => {});
  check(
    "Goes to the identity provider",
    (await href()).startsWith(IDP),
    await href(),
  );
  await evaluate((e: string) => {
    window.__e2e.setValue(window.__e2e.byLabel("Sign in as") as HTMLElement, e);
    window.__e2e.click(
      window.__e2e.byRole("button", "Sign in", { exact: true }) as HTMLElement,
    );
  }, ssoPerson);
  await waitFor((base: string) => location.href.startsWith(base), {
    args: [BASE] as never[],
    timeout: 30_000,
  });
  await sleep(2500);
  check(
    "Back signed in through SSO, in the workspace",
    (await sessionEmail()) === ssoPerson &&
      sql(
        `select count(*) from member where organization_id=${q(orgId)} and user_id=${q(userId(ssoPerson))}`,
      ) === "1",
  );
  check("No code was ever emailed to them", codeSince(ssoPerson, since) === "");

  console.log("no offer without usable SSO");
  await openPanel();
  since = logSize();
  await submitEmail(plain);
  check(
    "A domain without SSO gets its code straight away",
    (await stepAfterSubmit()) === "code",
  );
  check("…and the code was emailed", Boolean(await waitCode(plain, since)));

  setPlan("canceled");
  await openPanel();
  const offPlan = `offplan-${RUN}@${DOMAIN}`;
  since = logSize();
  await submitEmail(offPlan);
  check(
    "Off Business, the SSO domain gets its code straight away",
    (await stepAfterSubmit()) === "code" &&
      Boolean(await waitCode(offPlan, since)),
  );
  setPlan("active");

  console.log("the plan drops between the offer and the click");
  await openPanel();
  const late = `late-${RUN}@${DOMAIN}`;
  await submitEmail(late);
  await stepAfterSubmit();
  setPlan("canceled");
  await clickButton("Continue with SSO");
  await waitText("isn't available right now");
  check(
    "Says SSO isn't available, and stays on the offer",
    (await visibleButton("Email me a code")) && !(await href()).startsWith(IDP),
  );
  await shot("03-offer-unavailable");
  since = logSize();
  await clickButton("Email me a code");
  check("…where the code still works", Boolean(await waitCode(late, since)));
  setPlan("active");

  console.log("the dialog over a page");
  await openPanel({ dialog: true });
  await submitEmail(`dialog-${RUN}@${DOMAIN}`);
  check("The dialog offers SSO too", (await stepAfterSubmit()) === "sso");
  const dialogCheck = checksFor(`dialog-${RUN}@${DOMAIN}`)[0];
  check(
    "…checked through the page it's open on",
    Boolean(dialogCheck?.url.includes("/playground")),
    dialogCheck?.url,
  );
  await shot("02-offer-dialog");

  console.log("the separate Sign in with SSO link");
  await openPanel();
  await clickButton("Sign in with SSO");
  check(
    "Still opens the work email form",
    Boolean(
      await waitFor(() => Boolean(window.__e2e.byLabel("Work email"))).catch(
        () => false,
      ),
    ),
  );

  console.log("the per-IP limit");
  await openPanel();
  const template = checksFor(newcomer)[0];
  if (!template) throw new Error("no SSO check to replay");
  const headers = Object.fromEntries(
    Object.entries(template.headers).filter(([name]) =>
      /^(next-|accept$|content-type$)/i.test(name),
    ),
  );
  const answers = (await evaluate(
    async (url: string, h: Record<string, string>, body: string) => {
      const out: string[] = [];
      for (let i = 0; i < 70; i++) {
        const r = await fetch(url, { method: "POST", headers: h, body });
        out.push(
          (await r.text()).match(/"sso":(true|false)/)?.[1] ?? `?${r.status}`,
        );
      }
      return out;
    },
    template.url,
    headers,
    template.body,
  )) as string[];
  const firstNo = answers.indexOf("false");
  check(
    "Yes until the limit, then no (this IP made a few checks already)",
    firstNo > 40 &&
      firstNo <= 60 &&
      answers.slice(0, firstNo).every((a) => a === "true") &&
      answers.slice(firstNo).every((a) => a === "false"),
    `first no at ${firstNo + 1}: ${answers.join(",")}`,
  );
  const limited = `limited-${RUN}@${DOMAIN}`;
  since = logSize();
  await submitEmail(limited);
  check(
    "Over the limit, the code is simply sent",
    (await stepAfterSubmit()) === "code" &&
      Boolean(await waitCode(limited, since)),
  );
}

async function mobileRun() {
  // The connection from a licensed run: any verified domain on Business.
  const domain = sql(
    `select p.domain from sso_provider p join member m on m.organization_id=p.organization_id join subscription s on s.user_id=m.user_id where p.domain_verified and s.status='active' and s.product_id='local-business-monthly' order by p.domain desc limit 1`,
  );
  if (!domain) throw new Error("Run the licensed checks first");
  console.log(`phone screens (${domain})`);
  await openPanel();
  await submitEmail(`phone-${RUN}@${domain}`);
  check("The offer at 390 px", (await stepAfterSubmit()) === "sso");
  await shot("01-offer");
  await openPanel({ dialog: true });
  await submitEmail(`phone-dialog-${RUN}@${domain}`);
  check("The dialog's offer at 390 px", (await stepAfterSubmit()) === "sso");
  await shot("02-offer-dialog");
}

async function unlicensedRun() {
  // A verified connection on Business, written directly: without a licence
  // the plugin can't set one up, and it's never read anyway.
  const owner = `owner@${DOMAIN}`;
  await apiSignIn(owner);
  const ownerId = userId(owner);
  const orgId = sql(
    `select o.id from organization o join member m on m.organization_id=o.id where m.user_id=${q(ownerId)} and m.role='owner' limit 1`,
  );
  sql(
    `insert into subscription (id, created_at, amount, currency, recurring_interval, status, current_period_start, current_period_end, started_at, customer_id, product_id, checkout_id, user_id) values ('sub-${RUN}', now(), 1500, 'usd', 'month', 'active', now(), now() + interval '30 days', now(), 'cus-${RUN}', 'local-business-monthly', 'chk-${RUN}', ${q(ownerId)})`,
  );
  sql(
    `insert into sso_provider (id, issuer, provider_id, organization_id, domain, domain_verified) values ('off-${RUN}', ${q(IDP)}, 'sso-off${RUN.padEnd(9, "0").slice(0, 9)}', ${q(orgId)}, ${q(DOMAIN)}, true)`,
  );
  console.log("no licence key");
  await openPanel();
  check("No Sign in with SSO link", !(await visibleButton("Sign in with SSO")));
  const person = `someone-${RUN}@${DOMAIN}`;
  const since = logSize();
  const callsBefore = actionCalls.length;
  await submitEmail(person);
  check(
    "An address at a verified SSO domain gets its code straight away",
    (await stepAfterSubmit()) === "code" &&
      Boolean(await waitCode(person, since)),
  );
  check("Nothing was looked up", actionCalls.length === callsBefore);
}

try {
  if (EXPECT_OFF) await unlicensedRun();
  else if (MOBILE) await mobileRun();
  else await licensedRun();
} catch (error) {
  failures++;
  console.log(`  ✗ ${(error as Error).message}`);
  console.log(
    (await text().catch(() => "")).replace(/\s+/g, " ").slice(0, 400),
  );
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);
