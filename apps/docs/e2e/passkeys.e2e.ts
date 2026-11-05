// Passkeys end to end against a running dev server, in headless Chrome with
// a CDP virtual authenticator (WebAuthn domain), no Playwright:
//
//   sign in with an email code (read from the dev server's log) → add a
//   passkey in Settings → rename it → sign out → sign in with the button →
//   "Last used" → autofill → an assertion without user verification is
//   refused by the server (no session) → too-old sign-in asks to sign in
//   again → remove it. The management endpoints are checked to be off over
//   HTTP. Then, with two-step verification: a second account turns it on
//   (as e2e/two-factor.e2e.ts does) and adds a passkey; a passkey sign-in
//   gets a session with no two-step challenge, while an email-code sign-in
//   is challenged (twoFactorRedirect, no session) until a TOTP code.
//   Screenshots of each screen, light and dark, go to E2E_SHOTS.
//
//   E2E_BASE_URL=http://localhost:3112 \
//   E2E_CODE_LOG=<the dev server's log file> \
//   E2E_SHOTS=<directory> \
//   E2E_DB_SQL='<command that runs SQL on the LOCAL database, reading stdin>' \
//   pnpm --filter docs test:e2e:passkeys
//
// Sign-in codes are only printed by `next dev` (never emailed there), so
// this runs against a local dev server only; it skips (exit 0) without a
// server, Chrome or E2E_CODE_LOG. E2E_DB_SQL is optional: without it the
// "sign in again" check is skipped and says so. Each run signs up a new
// passkey-e2e-<run>@qrdx.test account.

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
 * Every screenshot then also checks the layout (layoutAt below).
 */
const MOBILE = process.env.E2E_MOBILE === "1";
const DB_SQL = process.env.E2E_DB_SQL;
const RUN = Date.now().toString(36);
const EMAIL = `passkey-e2e-${RUN}@qrdx.test`;
const TWO_FACTOR_EMAIL = `passkey-2fa-e2e-${RUN}@qrdx.test`;

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

/**
 * In the page: a passkey sign-in that asks the authenticator for no user
 * verification ("discouraged") and posts the assertion straight to the
 * server, as a client ignoring QRdx's "required" would. Plain JS source
 * (tsx would add helpers that don't exist in the page).
 */
const FORGED_ASSERTION = `async () => {
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
    await fetch("/api/auth/passkey/generate-authenticate-options")
  ).json();
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: b64(options.challenge),
      rpId: options.rpId,
      userVerification: "discouraged",
    },
  });
  const response = credential.response;
  const flags = new Uint8Array(response.authenticatorData)[32];
  const res = await fetch("/api/auth/passkey/verify-authentication", {
    method: "POST",
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
          userHandle: response.userHandle ? enc(response.userHandle) : undefined,
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

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function step(name: string, fn: () => Promise<true | string>) {
  try {
    const outcome = await fn();
    const ok = outcome === true;
    results.push({ name, ok, detail: ok ? undefined : outcome });
    console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : ` — ${outcome}`}`);
    return ok;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  ✗ ${name} — ${detail}`);
    return false;
  }
}

function latestCode(email: string): string | null {
  if (!CODE_LOG) return null;
  const log = readFileSync(CODE_LOG, "utf8");
  const pattern = new RegExp(
    `QRdx sign-in code for ${email.replace(/[.+]/g, "\\$&")}: (\\d{6})`,
    "g",
  );
  let code: string | null = null;
  for (const match of log.matchAll(pattern)) code = match[1];
  return code;
}

function logHas(text: string): boolean {
  return Boolean(CODE_LOG && readFileSync(CODE_LOG, "utf8").includes(text));
}

/**
 * In the page, for the mobile pass: horizontal page scroll, an open dialog
 * that runs past the screen with no way to scroll it, and tap targets
 * under 40 px. Targets are checked in this lane's own UI only (the
 * Passkeys section, passkey dialogs, the passkey sign-in button); other
 * small targets on the same screen are listed for the report. Plain JS
 * source (tsx would add helpers that don't exist in the page).
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
  const dialog = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].find(visible);
  let dialogOverflow = null;
  if (dialog) {
    const r = dialog.getBoundingClientRect();
    const scrolls = dialog.scrollHeight > dialog.clientHeight + 1 &&
      /(auto|scroll)/.test(getComputedStyle(dialog).overflowY);
    if ((r.bottom > innerHeight + 1 || r.top < -1 || r.right > innerWidth + 1 || r.left < -1) && !scrolls) {
      dialogOverflow = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
    }
  }
  // The docs' own navigation (table of contents, sidebars, heading
  // permalinks) isn't this lane's UI, even where its links say "passkey".
  const lane = (el) =>
    !el.closest("nav, aside, #nd-toc, #nd-sidebar, h1, h2, h3, h4") &&
    Boolean(
      el.closest("#passkeys") ||
      (dialog && dialog.contains(el) && /passkey/i.test(dialog.textContent || "")) ||
      /passkey/i.test(el.textContent || "")
    );
  const small = [];
  const others = [];
  const targets = document.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), [role="checkbox"], [role="switch"]',
  );
  for (const el of targets) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    // Inline text links inside sentences are sized by the text around them.
    if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
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
  // The cookie banner would cover the bottom of every screenshot: decline it
  // (remembered for the rest of the run), as e2e/two-factor.e2e.ts does.
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

async function signOut(page: Page) {
  await page.evaluate(async () => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
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

/** The "Name" field of the open dialog titled `title`, as a page expression. */
const NAME_IN_DIALOG = `(title) => {
  const dialog = window.__e2e.byRole("dialog", title);
  return dialog ? window.__e2e.byLabel("Name", dialog) : null;
}`;

const dialogName = (page: Page, title: string) =>
  page.waitFor(
    `(title) => (${NAME_IN_DIALOG})(title)?.value || false` as never,
    { args: [title] as never[] },
  );

const setDialogName = (page: Page, title: string, value: string) =>
  page.evaluate(
    `(title, value) => window.__e2e.setValue((${NAME_IN_DIALOG})(title), value)` as never,
    title,
    value,
  );

/** /sign-in → email → the code from the log. Returns once it's entered. */
async function enterEmailCode(page: Page, email: string) {
  await page.goto(`${BASE_URL}/sign-in?next=/settings/account`);
  await page.waitFor(() => Boolean(window.__e2e.byLabel("Email address")));
  await page.evaluate((email: string) => {
    const input = window.__e2e.byLabel("Email address") as HTMLInputElement;
    window.__e2e.setValue(input, email);
  }, email);
  const previous = latestCode(email);
  await clickButton(page, "Email me a code");
  let code: string | null = null;
  for (let i = 0; i < 60 && !code; i++) {
    await sleep(250);
    const latest = latestCode(email);
    if (latest && latest !== previous) code = latest;
  }
  if (!code) throw new Error("no sign-in code in the dev server log");
  await page.waitFor(() => Boolean(document.querySelector("[data-input-otp]")));
  await page.evaluate((value: string) => {
    const input = document.querySelector(
      "[data-input-otp]",
    ) as HTMLInputElement;
    window.__e2e.setValue(input, value);
  }, code);
}

async function signInWithCode(page: Page, email = EMAIL) {
  await enterEmailCode(page, email);
  await page.waitFor(() => location.pathname === "/settings/account", {
    timeout: 30_000,
  });
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
  console.log(`Passkeys e2e against ${BASE_URL} as ${EMAIL}`);

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
  try {
    await cdp.send("WebAuthn.enable", { enableUI: false });
    const { authenticatorId: first } = await cdp.send(
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

    // CSP violations, checked at the end where the server enforces a CSP
    // (CSP_DEV=1 or production). E2E_CSP_SELFTEST=1 first proves the
    // recorder catches one.
    const csp = await recordCspViolations(page);
    const enforced = await cspEnforced(BASE_URL);
    if (process.env.E2E_CSP_SELFTEST === "1") {
      if (enforced) {
        await step(
          "CSP self-test: a script from evil.example.com is caught",
          async () => {
            const { caught, lines } = await csp.selfTest(BASE_URL);
            for (const line of lines) console.log(`      ${line}`);
            return caught ? true : "the recorder saw nothing";
          },
        );
      } else {
        console.log(
          "  - CSP self-test skipped: CSP not enforced on this server",
        );
      }
    }

    // The authenticator holding the passkey (swapped in the UV check).
    let authenticatorId: string = first;

    await step("management endpoints are off over HTTP (404)", async () => {
      const statuses: Record<string, number> = {};
      for (const [method, path] of [
        ["GET", "/passkey/generate-register-options"],
        ["POST", "/passkey/verify-registration"],
        ["POST", "/passkey/update-passkey"],
        ["POST", "/passkey/delete-passkey"],
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

    await step("sign in with an email code", async () => {
      await signInWithCode(page);
      const user = await session(page);
      return user?.email === EMAIL ? true : `session: ${JSON.stringify(user)}`;
    });

    await step("Settings shows Passkeys after Sign-in methods", async () => {
      await page.waitFor(() => Boolean(document.getElementById("passkeys")));
      const order = await page.evaluate(() =>
        [...document.querySelectorAll("section[id]")].map((s) => s.id),
      );
      const at = order.indexOf("passkeys");
      await page.evaluate(() =>
        document.getElementById("passkeys")?.scrollIntoView(),
      );
      await shot(page, "settings-passkeys-empty");
      return at > 0 && order[at - 1] === "sign-in"
        ? true
        : `sections: ${order.join(", ")}`;
    });

    await step("Settings leaves Passkeys out on another origin", async () => {
      // The same server and session, reached on a host passkeys don't belong
      // to (like a preview URL): the section isn't rendered at all.
      const { cookies } = await cdp.send("Storage.getCookies");
      const cookie = cookies
        .filter((c: { name: string }) => c.name.startsWith("better-auth."))
        .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
        .join("; ");
      const html = async (origin: string) =>
        (
          await fetch(`${origin}/settings/account`, {
            headers: { cookie },
            redirect: "manual",
          })
        ).text();
      const other = new URL(BASE_URL);
      other.hostname =
        other.hostname === "localhost" ? "127.0.0.1" : "localhost";
      const [own, elsewhere] = await Promise.all([
        html(BASE_URL),
        html(other.origin),
      ]);
      if (!own.includes('id="passkeys"')) return "missing on its own origin";
      if (!elsewhere.includes('id="sessions"'))
        return "other origin didn't render the page";
      return elsewhere.includes('id="passkeys"')
        ? `shown on ${other.origin}`
        : true;
    });

    await step(
      "add a passkey (named after the browser, editable)",
      async () => {
        await clickButton(page, "Add passkey");
        const name = await dialogName(page, "Add a passkey");
        await shot(page, "add-passkey-dialog");
        if (name !== "Chrome on macOS" && !/^Chrome on /.test(String(name))) {
          return `default name was ${JSON.stringify(name)}`;
        }
        await clickButton(page, "Continue", "Add a passkey");
        await page.waitFor(
          () => Boolean(window.__e2e.byText("Passkey added")),
          {
            timeout: 20_000,
          },
        );
        await page.waitFor(() =>
          document.getElementById("passkeys")?.textContent?.includes("Added"),
        );
        const { credentials } = await cdp.send("WebAuthn.getCredentials", {
          authenticatorId,
        });
        await page.evaluate(() =>
          document.getElementById("passkeys")?.scrollIntoView(),
        );
        await shot(page, "settings-passkeys-one");
        if (credentials.length !== 1)
          return `${credentials.length} credentials`;
        if (!credentials[0].isResidentCredential) return "not discoverable";
        return true;
      },
    );

    await step("adding one sends the notice (logged in dev)", async () => {
      await sleep(1000);
      return logHas(
        `QRdx security notice for ${EMAIL}: "A passkey was added to your QRdx account"`,
      )
        ? true
        : "no notice line in the log";
    });

    await step("rename it", async () => {
      await clickButton(page, "Rename");
      await dialogName(page, "Rename passkey");
      await shot(page, "rename-passkey-dialog");
      await setDialogName(page, "Rename passkey", "E2E laptop");
      await clickButton(page, "Save", "Rename passkey");
      await page.waitFor(() =>
        document
          .getElementById("passkeys")
          ?.textContent?.includes("E2E laptop"),
      );
      return true;
    });

    // The virtual authenticator answers the email field's autofill request
    // by itself as soon as /sign-in loads, so the button and badge checks
    // run with autofill switched off in the page (the browser then reports
    // no conditional mediation, as browsers without autofill support do).
    const { identifier: noAutofill } = await cdp.send(
      "Page.addScriptToEvaluateOnNewDocument",
      {
        source:
          "PublicKeyCredential.isConditionalMediationAvailable = async () => false;",
      },
    );

    await step("sign out, then sign in with the passkey button", async () => {
      await signOut(page);
      await page.goto(`${BASE_URL}/sign-in?next=/settings/account`);
      await page.waitFor(() =>
        Boolean(window.__e2e.byRole("button", "Sign in with a passkey")),
      );
      await shot(page, "sign-in-with-passkey-button");
      if (await session(page)) return "signed in before the click";
      await clickButton(page, "Sign in with a passkey");
      await page.waitFor(() => location.pathname === "/settings/account", {
        timeout: 20_000,
      });
      const user = await session(page);
      return user?.email === EMAIL ? true : `session: ${JSON.stringify(user)}`;
    });

    await step("records passkey as the last used method", async () => {
      const cookie = await page.evaluate(() => document.cookie);
      return /last_used_login_method=passkey/.test(cookie)
        ? true
        : `cookie: ${cookie}`;
    });

    await step('"Last used" shows on the passkey button', async () => {
      await signOut(page);
      await page.goto(`${BASE_URL}/sign-in?next=/settings/account`);
      const badge = await page.waitFor(() => {
        const button = window.__e2e.byRole("button", "Sign in with a passkey");
        return button?.parentElement?.textContent?.includes("Last used")
          ? "yes"
          : false;
      });
      await shot(page, "sign-in-last-used-passkey");
      return badge === "yes" ? true : "no badge";
    });

    await step(
      "autofill: a passkey from the email field signs in",
      async () => {
        const field = await page.evaluate(() =>
          (
            window.__e2e.byLabel("Email address") as HTMLInputElement | null
          )?.getAttribute("autocomplete"),
        );
        if (field !== "email webauthn") return `autocomplete="${field}"`;
        await cdp.send("Page.removeScriptToEvaluateOnNewDocument", {
          identifier: noAutofill,
        });
        // Signed out on /sign-in, nothing clicked: only the autofill
        // (conditional) request can sign in here.
        await page.goto(`${BASE_URL}/sign-in?next=/settings/account`, {
          wait: 300,
        });
        const conditional = await page.evaluate(
          async () =>
            (await window.PublicKeyCredential.isConditionalMediationAvailable?.()) ??
            false,
        );
        if (!conditional) return "conditional mediation not available";
        await page.waitFor(() => location.pathname === "/settings/account", {
          timeout: 20_000,
        });
        const user = await session(page);
        await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
          source:
            "PublicKeyCredential.isConditionalMediationAvailable = async () => false;",
        });
        return user?.email === EMAIL
          ? true
          : `session: ${JSON.stringify(user)}`;
      },
    );

    await step(
      "an assertion without user verification is refused, with no session",
      async () => {
        await signOut(page);
        await page.goto(`${BASE_URL}/sign-in`);
        // A second authenticator holding the same passkey, but one that
        // doesn't verify the person.
        const { credentials } = await cdp.send("WebAuthn.getCredentials", {
          authenticatorId,
        });
        // Chrome allows one internal authenticator at a time.
        await cdp.send("WebAuthn.removeVirtualAuthenticator", {
          authenticatorId,
        });
        const { authenticatorId: noUv } = await cdp.send(
          "WebAuthn.addVirtualAuthenticator",
          {
            options: {
              protocol: "ctap2",
              transport: "internal",
              hasResidentKey: true,
              hasUserVerification: true,
              isUserVerified: false,
              automaticPresenceSimulation: true,
            },
          },
        );
        await cdp.send("WebAuthn.addCredential", {
          authenticatorId: noUv,
          credential: credentials[0],
        });

        // 1. The browser refuses on its own: QRdx asks for "required".
        await clickButton(page, "Sign in with a passkey");
        await sleep(2500);
        const afterButton = await session(page);
        await shot(page, "sign-in-no-user-verification");

        // 2. A client that ignores "required" (asks for "discouraged")
        // still can't sign in: the server checks the UV flag.
        const forged = (await page.evaluate(FORGED_ASSERTION as never)) as {
          userVerifiedFlag: boolean;
          status: number;
          body: { code?: string } | null;
        };
        const afterForged = await session(page);

        // Back to a verifying authenticator for the rest of the run.
        await cdp.send("WebAuthn.removeVirtualAuthenticator", {
          authenticatorId: noUv,
        });
        const { authenticatorId: uv } = await cdp.send(
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
        await cdp.send("WebAuthn.addCredential", {
          authenticatorId: uv,
          credential: credentials[0],
        });
        authenticatorId = uv;

        console.log(`      forged assertion: ${JSON.stringify(forged)}`);
        if (afterButton) return "the button signed in without UV";
        if (forged.userVerifiedFlag) return "the assertion had UV after all";
        if (forged.status !== 401) return `status ${forged.status}`;
        if (forged.body?.code !== "PASSKEY_USER_VERIFICATION_REQUIRED") {
          return `code ${forged.body?.code}`;
        }
        return afterForged ? "a session was created" : true;
      },
    );

    await step(
      "a sign-in older than a day must sign in again to add one",
      async () => {
        if (!DB_SQL) return "SKIPPED: E2E_DB_SQL not set";
        await signOut(page);
        await signInWithCode(page);
        await page.goto(`${BASE_URL}/settings/account`);
        // The form is open while the sign-in is fresh; then the session ages
        // (in the local database), so only the server can catch it.
        await clickButton(page, "Add passkey");
        await dialogName(page, "Add a passkey");
        execSync(DB_SQL, {
          input: `update "session" set created_at = now() - interval '2 days' where user_id = (select id from "user" where email = '${EMAIL}');`,
          stdio: ["pipe", "ignore", "inherit"],
        });
        await clickButton(page, "Continue", "Add a passkey");
        const text = await page.waitFor(() => {
          const dialog = window.__e2e.byRole("dialog", "Add a passkey");
          return /sign out and sign in again/.test(dialog?.textContent ?? "")
            ? (dialog?.textContent ?? false)
            : false;
        });
        await shot(page, "add-passkey-sign-in-again");
        // And a fresh page load shows the same step straight away.
        await page.goto(`${BASE_URL}/settings/account`);
        await clickButton(page, "Add passkey");
        const again = await page.waitFor(
          () => window.__e2e.byRole("dialog", "Add a passkey")?.textContent,
        );
        const { credentials } = await cdp.send("WebAuthn.getCredentials", {
          authenticatorId,
        });
        if (credentials.length !== 1)
          return `${credentials.length} credentials`;
        return text && /sign out and sign in again/.test(String(again))
          ? true
          : `dialog: ${again}`;
      },
    );

    await step(
      "remove it (with confirmation) and the notice is sent",
      async () => {
        await signOut(page);
        await signInWithCode(page);
        await page.waitFor(() =>
          document
            .getElementById("passkeys")
            ?.textContent?.includes("E2E laptop"),
        );
        await clickButton(page, "Remove");
        await page.waitFor(() =>
          Boolean(window.__e2e.byRole("dialog", "Remove E2E laptop")),
        );
        await shot(page, "remove-passkey-confirm");
        await page.evaluate(() => {
          const dialog = window.__e2e.byRole("dialog", "Remove E2E laptop");
          const button = window.__e2e.byRole("button", "Remove", {
            exact: true,
            root: dialog,
          });
          if (!button) throw new Error("No Remove button in the dialog");
          window.__e2e.click(button);
        });
        await page.waitFor(() =>
          document
            .getElementById("passkeys")
            ?.textContent?.includes("No passkeys yet"),
        );
        await sleep(1000);
        return logHas(
          `QRdx security notice for ${EMAIL}: "A passkey was removed from your QRdx account"`,
        )
          ? true
          : "no removal notice in the log";
      },
    );

    await step("a removed passkey no longer signs in", async () => {
      await signOut(page);
      await page.goto(`${BASE_URL}/sign-in`);
      await clickButton(page, "Sign in with a passkey");
      const message = await page.waitFor(
        () => document.querySelector('[role="alert"]')?.textContent,
      );
      await shot(page, "sign-in-removed-passkey");
      const user = await session(page);
      if (user) return "signed in";
      return /isn't linked/.test(String(message)) ? true : `alert: ${message}`;
    });

    // ── With two-step verification on ──
    // The server's JSON answers to the sign-in requests, read over CDP
    // (Network domain), by path.
    const replies = new Map<string, unknown>();
    const watched = new Map<string, string>();
    await cdp.send("Network.enable");
    cdp.on(
      async (message: {
        method: string;
        params: {
          requestId: string;
          response?: { url: string };
        };
      }) => {
        if (message.method === "Network.responseReceived") {
          const path = new URL(message.params.response?.url ?? "").pathname;
          if (
            path === "/api/auth/passkey/verify-authentication" ||
            path === "/api/auth/sign-in/email-otp"
          ) {
            watched.set(message.params.requestId, path);
          }
        }
        if (message.method === "Network.loadingFinished") {
          const path = watched.get(message.params.requestId);
          if (!path) return;
          watched.delete(message.params.requestId);
          try {
            const { body } = await cdp.send("Network.getResponseBody", {
              requestId: message.params.requestId,
            });
            replies.set(path, JSON.parse(body));
          } catch {
            replies.set(path, "unreadable");
          }
        }
      },
    );
    // The first account's passkey is gone from QRdx; drop it from the
    // authenticator too, so the browser offers only the next one.
    await cdp.send("WebAuthn.clearCredentials", { authenticatorId });
    let secret = "";

    await step("2FA: an account turns on two-step verification", async () => {
      await signOut(page);
      await signInWithCode(page, TWO_FACTOR_EMAIL);
      await page.goto(`${BASE_URL}/settings/account#two-factor`);
      await clickButton(page, "Turn on");
      secret = String(
        await page.waitFor(() =>
          (
            document.querySelector('[role="dialog"] code')?.textContent ?? ""
          ).replace(/\s+/g, ""),
        ),
      );
      if (secret.length < 16) return `key "${secret}"`;
      await page.evaluate((code: string) => {
        const input = window.__e2e.byLabel(
          "Code from your authenticator app",
        ) as HTMLInputElement;
        input.focus();
        window.__e2e.setValue(input, code);
      }, totp(secret));
      await page.waitFor(() =>
        document.body.innerText.includes("Save these backup codes"),
      );
      await page.evaluate(() => {
        const box = window.__e2e.byLabel("I've saved my backup codes");
        if (box) window.__e2e.click(box);
      });
      await page.waitFor(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const done = [...(dialog?.querySelectorAll("button") ?? [])].find(
          (button) => button.textContent?.trim() === "Done",
        );
        if (!done || done.disabled) return false;
        window.__e2e.click(done);
        return true;
      });
      await page.waitFor(() =>
        document.body.innerText.includes("10 of 10 backup codes left"),
      );
      return true;
    });

    await step("2FA: the same account adds a passkey", async () => {
      await page.goto(`${BASE_URL}/settings/account`);
      await clickButton(page, "Add passkey");
      await dialogName(page, "Add a passkey");
      await clickButton(page, "Continue", "Add a passkey");
      await page.waitFor(() => Boolean(window.__e2e.byText("Passkey added")), {
        timeout: 20_000,
      });
      const { credentials } = await cdp.send("WebAuthn.getCredentials", {
        authenticatorId,
      });
      return credentials.length === 1
        ? true
        : `${credentials.length} credentials`;
    });

    await step(
      "2FA: a passkey sign-in (with user verification) has no two-step challenge",
      async () => {
        await signOut(page);
        await page.goto(`${BASE_URL}/sign-in?next=/settings/account`);
        await page.waitFor(() =>
          Boolean(window.__e2e.byRole("button", "Sign in with a passkey")),
        );
        if (await session(page)) return "signed in before the click";
        replies.clear();
        await clickButton(page, "Sign in with a passkey");
        await page.waitFor(() => location.pathname === "/settings/account", {
          timeout: 20_000,
        });
        await sleep(500);
        const reply = (replies.get("/api/auth/passkey/verify-authentication") ??
          null) as {
          twoFactorRedirect?: boolean;
          user?: { email?: string };
        } | null;
        await page.waitFor(() =>
          Boolean(document.getElementById("two-factor")),
        );
        await page.evaluate(() =>
          document.getElementById("two-factor")?.scrollIntoView(),
        );
        await shot(page, "2fa-passkey-sign-in-no-challenge");
        const user = await session(page);
        console.log(
          `      passkey sign-in reply: ${JSON.stringify({ twoFactorRedirect: reply?.twoFactorRedirect ?? null, user: reply?.user?.email ?? null })}`,
        );
        if (!reply) return "no reply recorded from verify-authentication";
        if (reply.twoFactorRedirect) return "answered twoFactorRedirect";
        if (reply.user?.email !== TWO_FACTOR_EMAIL) return "reply had no user";
        return user?.email === TWO_FACTOR_EMAIL
          ? true
          : `session: ${JSON.stringify(user)}`;
      },
    );

    await step(
      "2FA: an email-code sign-in is challenged, no session until a TOTP code",
      async () => {
        await signOut(page);
        await page.goto(`${BASE_URL}/sign-in?next=/settings/account`);
        replies.clear();
        await page.evaluate((email: string) => {
          const input = window.__e2e.byLabel(
            "Email address",
          ) as HTMLInputElement;
          window.__e2e.setValue(input, email);
        }, TWO_FACTOR_EMAIL);
        const previous = latestCode(TWO_FACTOR_EMAIL);
        await clickButton(page, "Email me a code");
        let code: string | null = null;
        for (let i = 0; i < 60 && !code; i++) {
          await sleep(250);
          const latest = latestCode(TWO_FACTOR_EMAIL);
          if (latest && latest !== previous) code = latest;
        }
        if (!code) return "no sign-in code in the log";
        await page.waitFor(() =>
          Boolean(document.querySelector("[data-input-otp]")),
        );
        await page.evaluate((value: string) => {
          window.__e2e.setValue(
            document.querySelector("[data-input-otp]") as HTMLInputElement,
            value,
          );
        }, code);
        await page.waitFor(() =>
          document.body.innerText.includes(
            "Your account asks for a second step",
          ),
        );
        await sleep(500);
        const reply = (replies.get("/api/auth/sign-in/email-otp") ?? null) as {
          twoFactorRedirect?: boolean;
        } | null;
        const before = await session(page);
        await shot(page, "2fa-email-code-challenged");
        console.log(
          `      email-code sign-in reply: ${JSON.stringify(reply)}; session before TOTP: ${JSON.stringify(before)}`,
        );
        if (reply?.twoFactorRedirect !== true) {
          return `reply: ${JSON.stringify(reply)}`;
        }
        if (before) return "a session existed before the TOTP code";
        await page.evaluate((value: string) => {
          const input = window.__e2e.byLabel(
            "Authenticator code",
          ) as HTMLInputElement;
          input.focus();
          window.__e2e.setValue(input, value);
        }, totp(secret));
        await page.waitFor(() => location.pathname === "/settings/account", {
          timeout: 20_000,
        });
        const after = await session(page);
        return after?.email === TWO_FACTOR_EMAIL
          ? true
          : `session after TOTP: ${JSON.stringify(after)}`;
      },
    );

    if (MOBILE) {
      await step("mobile: help pages", async () => {
        await signOut(page);
        for (const [name, path, anchor] of [
          ["help-passkeys", "/docs/help/privacy-and-security/passkeys", ""],
          [
            "help-passkeys-two-step",
            "/docs/help/privacy-and-security/passkeys",
            "passkeys-and-two-step-verification",
          ],
          ["help-sign-in", "/docs/help/account-and-billing/sign-in", ""],
          [
            "help-sign-in-passkey-line",
            "/docs/help/account-and-billing/sign-in",
            "ways-to-sign-in",
          ],
        ]) {
          await page.goto(`${BASE_URL}${path}`);
          if (anchor) {
            await page.evaluate(
              (id: string) => document.getElementById(id)?.scrollIntoView(),
              anchor,
            );
          }
          await shot(page, name);
        }
        return true;
      });

      await step(
        "mobile: no horizontal page scroll on any screen",
        async () => {
          const wide = [...layout]
            .filter(([, r]) => r.scrollWidth > r.clientWidth)
            .map(([name, r]) => `${name} ${r.scrollWidth}>${r.clientWidth}`);
          for (const [name, r] of layout) {
            console.log(
              `      ${name}: scrollWidth ${r.scrollWidth} / clientWidth ${r.clientWidth}`,
            );
          }
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

      await step("mobile: passkey tap targets are at least 40 px", async () => {
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

    // An error boundary catching a section's render error still lets the
    // other checks pass, so page errors fail the run on their own.
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
