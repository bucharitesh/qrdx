// New sign-in alerts (packages/auth/new-sign-in.ts), end to end inside Better
// Auth: a real betterAuth instance (memory adapter, no database or network)
// with the same plugin order as packages/auth/server.ts (last-used method,
// email codes, two-step verification and its challenge, then the alert),
// driven through auth.handler like a browser would. The app's notifier is
// replaced by one that records what it's given.
import { createHash, createHmac } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  CONFIRMATION_MINUTES,
  CONFIRMED_IDENTIFIER_PREFIX,
  confirmedIdentifier,
} from "@repo/auth/confirm-sign-in-rules";
import {
  ALERTS_PER_DAY,
  DEVICE_COOKIE,
  MAX_KNOWN_DEVICES,
  type NewSignIn,
  registerNewSignInNotifier,
  signInConfirms,
} from "@repo/auth/new-sign-in";
import {
  CHALLENGE_CONTINUE_PATH,
  PASSKEY_SIGN_IN_PATH,
  PASSKEY_STEP_VERIFY_PATH,
  SERVER_ONLY_TWO_FACTOR_PATHS,
  UNUSED_TWO_FACTOR_PATHS,
} from "@repo/auth/sign-in-challenge-rules";
import { markUnsolicitedSignIn } from "@repo/auth/unsolicited-sign-in";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// apps/app doesn't depend on better-auth itself; load the copy @repo/auth
// uses (the plugins import better-auth/api from there too).
const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);

const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-at-least-32-characters-long";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

// ─── TOTP (RFC 6238), to act as the authenticator app ───────────────────────

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
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
  const binary = hash.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

// ─── A browser: a cookie jar over auth.handler ──────────────────────────────

interface Reply {
  status: number;
  json: Record<string, unknown> | null;
  setCookies: string[];
}

class Browser {
  cookies = new Map<string, string>();

  constructor(
    private readonly handler: (request: Request) => Promise<Response>,
    private readonly extraHeaders: Record<string, string> = {},
  ) {}

  cookieHeader() {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async request(
    method: "GET" | "POST",
    pathAndQuery: string,
    body?: unknown,
  ): Promise<Reply> {
    const headers = new Headers({
      origin: ORIGIN,
      cookie: this.cookieHeader(),
      "user-agent": CHROME_MAC,
      "x-forwarded-for": "203.0.113.24",
      ...this.extraHeaders,
    });
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await this.handler(
      new Request(`${ORIGIN}/api/auth${pathAndQuery}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
      }),
    );
    const setCookies = response.headers.getSetCookie();
    for (const line of setCookies) {
      const [pair, ...attributes] = line.split(";");
      const [name, ...rest] = pair.split("=");
      const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (expired) this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), rest.join("="));
    }
    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, setCookies };
  }

  post(pathAndQuery: string, body: unknown = {}) {
    return this.request("POST", pathAndQuery, body);
  }

  get(pathAndQuery: string) {
    return this.request("GET", pathAndQuery);
  }

  device() {
    return this.cookies.get(DEVICE_COOKIE) ?? null;
  }

  async session() {
    const reply = await this.get("/get-session");
    return reply.json as { user: { email: string } } | null;
  }
}

// ─── The auth under test ────────────────────────────────────────────────────

const sentCodes = new Map<string, string>();
const alerts: NewSignIn[] = [];
let auth: any;
let db: Record<string, Record<string, unknown>[]>;

const UNSOLICITED_HEADER = "x-test-unsolicited";

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { twoFactor, emailOTP, lastLoginMethod } = await import(
    `${betterAuthDir}/dist/plugins/index.mjs`
  );
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { signInChallenge } = await import("@repo/auth/sign-in-challenge");
  const { signInMethodForPath } = await import("@repo/auth/sign-in-method");
  const { newSignIn } = await import("@repo/auth/new-sign-in");
  const rules = await import("@repo/auth/sign-in-challenge-rules");
  const { createAuthMiddleware } = await import(
    `${betterAuthDir}/dist/api/index.mjs`
  );

  db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    twoFactor: [],
    knownDevice: [],
  };
  const twoFactorPlugin = twoFactor({
    issuer: "QRdx",
    allowPasswordless: true,
    totpOptions: {
      issuer: "QRdx",
      digits: rules.TOTP_DIGITS,
      period: rules.TOTP_PERIOD_SECONDS,
    },
    // Production's codes (the challenge normalises entered codes to them).
    backupCodeOptions: {
      customBackupCodesGenerate: () =>
        rules.generateBackupCodes(rules.BACKUP_CODE_COUNT),
    },
    trustDeviceMaxAge: rules.TRUST_DEVICE_DAYS * 24 * 60 * 60,
  });
  // The same order as packages/auth/server.ts: the alert comes last.
  auth = betterAuth({
    baseURL: ORIGIN,
    secret: SECRET,
    database: memoryAdapter(db),
    rateLimit: { enabled: false },
    disabledPaths: [
      ...UNUSED_TWO_FACTOR_PATHS,
      ...SERVER_ONLY_TWO_FACTOR_PATHS,
    ],
    plugins: [
      lastLoginMethod({
        customResolveMethod: (ctx: { path?: string }) =>
          signInMethodForPath(ctx.path),
      }),
      emailOTP({
        otpLength: 6,
        sendVerificationOTP: async ({
          email,
          otp,
        }: {
          email: string;
          otp: string;
        }) => {
          sentCodes.set(email, otp);
        },
      }),
      twoFactorPlugin,
      signInChallenge(twoFactorPlugin, { relyingParty: null }),
      // Stands in for ssoGate, which marks a SAML response the identity
      // provider started (packages/auth/ee/sso.ts): a request carrying
      // UNSOLICITED_HEADER is marked the same way.
      {
        id: "test-mark-unsolicited",
        hooks: {
          before: [
            {
              matcher: (ctx: { headers?: Headers }) =>
                ctx.headers?.get(UNSOLICITED_HEADER) === "1",
              handler: createAuthMiddleware((ctx: { context: object }) => {
                markUnsolicitedSignIn(ctx.context);
                return Promise.resolve();
              }),
            },
          ],
        },
      },
      newSignIn(),
    ],
  });
});

beforeEach(() => {
  alerts.length = 0;
  registerNewSignInNotifier((signIn) => {
    alerts.push(signIn);
  });
});

async function emailCodeSignIn(browser: Browser, email: string) {
  await browser.post("/email-otp/send-verification-otp", {
    email,
    type: "sign-in",
  });
  return browser.post("/sign-in/email-otp", {
    email,
    otp: sentCodes.get(email),
  });
}

const devicesOf = (email: string) => {
  const user = db.user.find((u) => u.email === email);
  return db.knownDevice.filter((d) => d.userId === user?.id);
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** A browser that has signed in to `email` once (its first, silent device). */
async function firstDevice(email: string) {
  const browser = new Browser(auth.handler);
  await emailCodeSignIn(browser, email);
  return browser;
}

describe("new sign-in alerts", () => {
  it("records a brand-new account's first browser without an alert", async () => {
    const browser = new Browser(auth.handler);
    const reply = await emailCodeSignIn(browser, "new@qrdx.test");
    expect(reply.status).toBe(200);
    expect((await browser.session())?.user.email).toBe("new@qrdx.test");
    expect(alerts).toEqual([]);

    // A random 32-byte id in a long-lived, script-proof cookie...
    const line = reply.setCookies.find((c) =>
      c.startsWith(`${DEVICE_COOKIE}=`),
    );
    expect(line).toMatch(/^qrdx_device=[0-9a-f]{64};/);
    expect(line).toMatch(/Max-Age=34560000/i);
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\//i);
    // ...and only its hash is stored.
    const devices = devicesOf("new@qrdx.test");
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceHash).toBe(sha256(browser.device() ?? ""));
    expect(devices[0].userAgent).toBe(CHROME_MAC);
    expect(JSON.stringify(db.knownDevice)).not.toContain(browser.device());
  });

  it("stays quiet when a known browser signs in again", async () => {
    const browser = await firstDevice("again@qrdx.test");
    const device = browser.device();
    const [before] = devicesOf("again@qrdx.test");
    const seenBefore = before.lastSeenAt as Date;
    await browser.post("/sign-out");
    expect(await browser.session()).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 5));
    const reply = await emailCodeSignIn(browser, "again@qrdx.test");
    expect(reply.status).toBe(200);
    expect(alerts).toEqual([]);
    expect(browser.device()).toBe(device);
    const devices = devicesOf("again@qrdx.test");
    expect(devices).toHaveLength(1);
    expect((devices[0].lastSeenAt as Date).getTime()).toBeGreaterThan(
      seenBefore.getTime(),
    );
  });

  it("alerts when another browser signs in, with how and from where", async () => {
    await firstDevice("ada@qrdx.test");
    const other = new Browser(auth.handler);
    const reply = await emailCodeSignIn(other, "ada@qrdx.test");
    expect(reply.status).toBe(200);
    expect((await other.session())?.user.email).toBe("ada@qrdx.test");

    expect(alerts).toHaveLength(1);
    const [alert] = alerts;
    expect(alert.user.email).toBe("ada@qrdx.test");
    expect(alert.method).toBe("email-otp");
    expect(alert.secondStep).toBeNull();
    expect(alert.headers.get("user-agent")).toBe(CHROME_MAC);
    expect(alert.headers.get("x-forwarded-for")).toBe("203.0.113.24");
    expect(devicesOf("ada@qrdx.test")).toHaveLength(2);

    // Once known, that browser is quiet too.
    await other.post("/sign-out");
    await emailCodeSignIn(other, "ada@qrdx.test");
    expect(alerts).toHaveLength(1);
  });

  it("records an existing account's first sign-in since release without an alert", async () => {
    // Signed up before this shipped: an account, no known devices.
    await firstDevice("existing@qrdx.test");
    const user = db.user.find((u) => u.email === "existing@qrdx.test");
    db.knownDevice = db.knownDevice.filter((d) => d.userId !== user?.id);

    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, "existing@qrdx.test");
    expect(alerts).toEqual([]);
    expect(devicesOf("existing@qrdx.test")).toHaveLength(1);
  });

  it("ignores a session refresh, which re-issues the same token", async () => {
    const browser = await firstDevice("refresh@qrdx.test");
    // Forget the device cookie: a refresh still mustn't count as a sign-in.
    browser.cookies.delete(DEVICE_COOKIE);
    const user = db.user.find((u) => u.email === "refresh@qrdx.test");
    const session = db.session.find((s) => s.userId === user?.id);
    if (!session) throw new Error("no session");
    // Due for a refresh: older than the session's update age.
    session.expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    const reply = await browser.get("/get-session");
    expect(reply.status).toBe(200);
    // The refresh did re-issue the cookie...
    expect(reply.setCookies.some((c) => c.includes("session_token="))).toBe(
      true,
    );
    // ...and nothing about devices happened.
    expect(reply.setCookies.some((c) => c.startsWith(DEVICE_COOKIE))).toBe(
      false,
    );
    expect(alerts).toEqual([]);
    expect(devicesOf("refresh@qrdx.test")).toHaveLength(1);
  });

  it("waits for the second step, then alerts with both steps", async () => {
    const first = await firstDevice("two-step@qrdx.test");
    const enabled = await auth.api.enableTwoFactor({
      headers: new Headers({ cookie: first.cookieHeader(), origin: ORIGIN }),
      body: {},
    });
    const secret = new URL(enabled.totpURI).searchParams.get("secret") ?? "";
    // Confirming turns it on and swaps the session server-side (auth.api):
    // not a sign-in.
    await auth.api.verifyTOTP({
      headers: new Headers({ cookie: first.cookieHeader(), origin: ORIGIN }),
      body: { code: totp(secret) },
    });
    expect(alerts).toEqual([]);
    expect(devicesOf("two-step@qrdx.test")).toHaveLength(1);

    const other = new Browser(auth.handler);
    const challenged = await emailCodeSignIn(other, "two-step@qrdx.test");
    expect(challenged.json?.twoFactorRedirect).toBe(true);
    // Not signed in yet: no alert, no device cookie, nothing recorded.
    expect(alerts).toEqual([]);
    expect(other.device()).toBeNull();
    expect(devicesOf("two-step@qrdx.test")).toHaveLength(1);

    const done = await other.post("/two-factor/verify-totp", {
      code: totp(secret),
    });
    expect(done.status).toBe(200);
    expect((await other.session())?.user.email).toBe("two-step@qrdx.test");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].method).toBe("email-otp");
    expect(alerts[0].secondStep).toBe("totp");
    expect(other.device()).toMatch(/^[0-9a-f]{64}$/);
    expect(devicesOf("two-step@qrdx.test")).toHaveLength(2);
  });

  it("does nothing for sign-ins made server-side through auth.api", async () => {
    await firstDevice("server@qrdx.test");
    await auth.api.sendVerificationOTP({
      body: { email: "server@qrdx.test", type: "sign-in" },
    });
    const result = await auth.api.signInEmailOTP({
      body: {
        email: "server@qrdx.test",
        otp: sentCodes.get("server@qrdx.test"),
      },
      returnHeaders: true,
    });
    expect(result.response.token).toEqual(expect.any(String));
    expect(result.headers.get("set-cookie") ?? "").not.toContain(DEVICE_COOKIE);
    expect(alerts).toEqual([]);
    expect(devicesOf("server@qrdx.test")).toHaveLength(1);
  });

  it("doesn't mint a device on a cross-site POST that can't carry the cookie", async () => {
    await firstDevice("saml@qrdx.test");
    // An identity provider posting back from another site: SameSite=Lax
    // cookies stay behind, so the browser can't be told apart.
    const posted = new Browser(auth.handler, {
      "sec-fetch-site": "cross-site",
    });
    const reply = await emailCodeSignIn(posted, "saml@qrdx.test");
    expect(reply.status).toBe(200);
    expect(posted.device()).toBeNull();
    expect(alerts).toEqual([]);
    expect(devicesOf("saml@qrdx.test")).toHaveLength(1);
  });

  it("alerts every new browser, up to 10 a day per account", async () => {
    const email = "burst@qrdx.test";
    await firstDevice(email);
    const minutesAgo = (minutes: number) =>
      new Date(Date.now() - minutes * 60 * 1000);

    // The first new browser is alerted and marked.
    await emailCodeSignIn(new Browser(auth.handler), email);
    expect(alerts).toHaveLength(1);
    const marked = devicesOf(email).filter((d) => d.alertedAt);
    expect(marked).toHaveLength(1);

    // Another new one straight after is alerted too (no quiet window an
    // intruder could hide in).
    const quick = new Browser(auth.handler);
    expect((await emailCodeSignIn(quick, email)).status).toBe(200);
    expect(alerts).toHaveLength(2);
    expect(devicesOf(email)).toHaveLength(3);
    // ...and it stays known, so it doesn't alert again.
    await quick.post("/sign-out");
    await emailCodeSignIn(quick, email);
    expect(alerts).toHaveLength(2);

    // With the day's alerts used up, a new browser is recorded without one.
    const user = db.user.find((u) => u.email === email);
    for (let i = 0; i < ALERTS_PER_DAY; i++) {
      db.knownDevice.push({
        id: `alerted-${i}`,
        userId: user?.id,
        deviceHash: `alerted-${i}`,
        createdAt: minutesAgo(600),
        lastSeenAt: minutesAgo(600),
        userAgent: null,
        alertedAt: minutesAgo(60 + i),
      });
    }
    const late = new Browser(auth.handler);
    expect((await emailCodeSignIn(late, email)).status).toBe(200);
    expect(alerts).toHaveLength(2);
    expect(devicesOf(email)).toHaveLength(4 + ALERTS_PER_DAY);
  });

  it(`keeps an account's ${MAX_KNOWN_DEVICES} most recently seen browsers`, async () => {
    const email = "many@qrdx.test";
    await firstDevice(email);
    const user = db.user.find((u) => u.email === email);
    // Fill up with older browsers, the oldest first.
    for (let i = 0; i < MAX_KNOWN_DEVICES; i++) {
      const seen = new Date(
        Date.now() - (MAX_KNOWN_DEVICES - i) * 60 * 60 * 1000,
      );
      db.knownDevice.push({
        id: `old-${i}`,
        userId: user?.id,
        deviceHash: `old-${i}`,
        createdAt: seen,
        lastSeenAt: seen,
        userAgent: null,
        alertedAt: null,
      });
    }
    expect(devicesOf(email)).toHaveLength(MAX_KNOWN_DEVICES + 1);

    const browser = new Browser(auth.handler);
    expect((await emailCodeSignIn(browser, email)).status).toBe(200);
    const kept = devicesOf(email);
    expect(kept).toHaveLength(MAX_KNOWN_DEVICES);
    // The two least recently seen went; the new browser and the first one stay.
    const ids = kept.map((d) => d.id);
    expect(ids).not.toContain("old-0");
    expect(ids).not.toContain("old-1");
    expect(ids).toContain(`old-${MAX_KNOWN_DEVICES - 1}`);
    expect(kept.map((d) => d.deviceHash)).toContain(
      sha256(browser.device() ?? ""),
    );
    // Other accounts' browsers are untouched.
    expect(devicesOf("ada@qrdx.test")).toHaveLength(2);
  });

  it("never fails a sign-in when the alert can't be sent or recorded", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await firstDevice("broken@qrdx.test");
      registerNewSignInNotifier(() => {
        throw new Error("Resend is down");
      });
      const other = new Browser(auth.handler);
      const reply = await emailCodeSignIn(other, "broken@qrdx.test");
      expect(reply.status).toBe(200);
      expect((await other.session())?.user.email).toBe("broken@qrdx.test");
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining('"outcome":"not-sent"'),
      );

      // The table is missing (code deployed before its SQL).
      const saved = db.knownDevice;
      delete (db as Partial<typeof db>).knownDevice;
      try {
        const third = new Browser(auth.handler);
        const again = await emailCodeSignIn(third, "broken@qrdx.test");
        expect(again.status).toBe(200);
        expect((await third.session())?.user.email).toBe("broken@qrdx.test");
        expect(errors).toHaveBeenCalledWith(
          expect.stringContaining('"outcome":"failed"'),
        );
      } finally {
        db.knownDevice = saved;
      }
      // No addresses or ids in what was logged.
      for (const [line] of errors.mock.calls) {
        expect(String(line)).not.toContain("broken@qrdx.test");
      }
    } finally {
      errors.mockRestore();
    }
  });
});

// ─── "Confirm it's you" from the sign-in itself ─────────────────────────────

describe('a finished sign-in counts as "Confirm it\'s you"', () => {
  const userOf = (email: string) => db.user.find((u) => u.email === email);
  /** The account's confirmation rows (the app's `qrdx-confirmed-<session>`). */
  const confirmationsOf = (email: string) =>
    db.verification.filter(
      (row) =>
        row.value === userOf(email)?.id &&
        String(row.identifier).startsWith(CONFIRMED_IDENTIFIER_PREFIX) &&
        !String(row.identifier).startsWith("qrdx-confirmed-strong-"),
    );
  /** The strong ones: a second step or a passkey in the sign-in itself. */
  const strongOf = (email: string) =>
    db.verification.filter(
      (row) =>
        row.value === userOf(email)?.id &&
        String(row.identifier).startsWith("qrdx-confirmed-strong-"),
    );
  const sessionIdOf = async (browser: Browser) =>
    ((await browser.get("/get-session")).json as { session: { id: string } })
      .session.id;

  /** Turns two-step verification on (server-side, like Settings does). */
  async function withTwoFactor(email: string) {
    const first = await firstDevice(email);
    const headers = () =>
      new Headers({ cookie: first.cookieHeader(), origin: ORIGIN });
    const enabled = await auth.api.enableTwoFactor({
      headers: headers(),
      body: {},
    });
    const secret = new URL(enabled.totpURI).searchParams.get("secret") ?? "";
    await auth.api.verifyTOTP({
      headers: headers(),
      body: { code: totp(secret) },
    });
    return { secret, backupCodes: enabled.backupCodes as string[] };
  }

  it("without two-step verification: any finished sign-in, for that session, for 10 minutes", async () => {
    const email = "confirm-off@qrdx.test";
    const browser = new Browser(auth.handler);
    const before = Date.now();
    expect((await emailCodeSignIn(browser, email)).status).toBe(200);
    const rows = confirmationsOf(email);
    expect(rows).toHaveLength(1);
    expect(rows[0].identifier).toBe(
      confirmedIdentifier(await sessionIdOf(browser)),
    );
    // An email code alone is never strong.
    expect(strongOf(email)).toHaveLength(0);
    const expires = new Date(rows[0].expiresAt as Date).getTime();
    expect(expires).toBeGreaterThanOrEqual(
      before + CONFIRMATION_MINUTES * 60_000,
    );
    expect(expires).toBeLessThanOrEqual(
      Date.now() + CONFIRMATION_MINUTES * 60_000,
    );
  });

  it("with it on: once the second step is answered, never after the first step alone", async () => {
    const email = "confirm-totp@qrdx.test";
    const { secret } = await withTwoFactor(email);
    // Turning it on swapped the session server-side: not a sign-in.
    const already = confirmationsOf(email).length;

    const other = new Browser(auth.handler);
    const challenged = await emailCodeSignIn(other, email);
    expect(challenged.json?.twoFactorRedirect).toBe(true);
    expect(confirmationsOf(email)).toHaveLength(already);

    const done = await other.post("/two-factor/verify-totp", {
      code: totp(secret),
    });
    expect(done.status).toBe(200);
    const rows = confirmationsOf(email);
    expect(rows).toHaveLength(already + 1);
    expect(rows.at(-1)?.identifier).toBe(
      confirmedIdentifier(await sessionIdOf(other)),
    );
    // The second step makes it strong.
    expect(strongOf(email).map((row) => row.identifier)).toContain(
      `qrdx-confirmed-strong-${await sessionIdOf(other)}`,
    );
  });

  it("a backup code as the second step counts too", async () => {
    const email = "confirm-backup@qrdx.test";
    const { backupCodes } = await withTwoFactor(email);
    const already = confirmationsOf(email).length;
    const other = new Browser(auth.handler);
    await emailCodeSignIn(other, email);
    const done = await other.post("/two-factor/verify-backup-code", {
      code: backupCodes[0],
    });
    expect(done.status).toBe(200);
    expect(confirmationsOf(email)).toHaveLength(already + 1);
  });

  it("never for a sign-in that arrived unasked (a SAML response the identity provider started)", async () => {
    const email = "confirm-unsolicited@qrdx.test";
    const browser = new Browser(auth.handler, { [UNSOLICITED_HEADER]: "1" });
    expect((await emailCodeSignIn(browser, email)).status).toBe(200);
    // Signed in, with no confirmation, strong or not. The same sign-in
    // without the mark confirms (above).
    expect(await sessionIdOf(browser)).toBeTruthy();
    expect(confirmationsOf(email)).toHaveLength(0);
    expect(strongOf(email)).toHaveLength(0);
  });

  it("not when a trusted device skipped the second step", async () => {
    const email = "confirm-trusted@qrdx.test";
    const { secret } = await withTwoFactor(email);
    const other = new Browser(auth.handler);
    await emailCodeSignIn(other, email);
    await other.post("/two-factor/verify-totp", {
      code: totp(secret),
      trustDevice: true,
    });
    const afterStep = confirmationsOf(email).length;
    await other.post("/sign-out");

    // Signed in again on the trusted browser: no second step asked...
    const again = await emailCodeSignIn(other, email);
    expect(again.status).toBe(200);
    expect(again.json?.twoFactorRedirect).toBeUndefined();
    const sessionId = await sessionIdOf(other);
    expect(sessionId).toEqual(expect.any(String));
    // ...and so nothing confirmed for the new session.
    expect(confirmationsOf(email)).toHaveLength(afterStep);
    expect(
      db.verification.some(
        (row) => row.identifier === confirmedIdentifier(sessionId),
      ),
    ).toBe(false);
  });

  it("never for sign-ins made server-side through auth.api", async () => {
    const email = "confirm-server@qrdx.test";
    await firstDevice(email);
    const already = confirmationsOf(email).length;
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const result = await auth.api.signInEmailOTP({
      body: { email, otp: sentCodes.get(email) },
    });
    expect(result.token).toEqual(expect.any(String));
    expect(confirmationsOf(email)).toHaveLength(already);
  });

  it("not for a session refresh", async () => {
    const email = "confirm-refresh@qrdx.test";
    const browser = await firstDevice(email);
    const already = confirmationsOf(email).length;
    const session = db.session.find((s) => s.userId === userOf(email)?.id);
    if (!session) throw new Error("no session");
    session.expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const reply = await browser.get("/get-session");
    expect(reply.setCookies.some((c) => c.includes("session_token="))).toBe(
      true,
    );
    expect(confirmationsOf(email)).toHaveLength(already);
  });

  it("still counts when the browser can't be recorded", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const saved = db.knownDevice;
    try {
      delete (db as Partial<typeof db>).knownDevice;
      const email = "confirm-no-devices@qrdx.test";
      const browser = new Browser(auth.handler);
      expect((await emailCodeSignIn(browser, email)).status).toBe(200);
      expect(confirmationsOf(email)).toHaveLength(1);
    } finally {
      db.knownDevice = saved;
      errors.mockRestore();
    }
  });

  it("which sign-ins count", () => {
    const paths = [
      "/sign-in/email-otp",
      "/callback/:id",
      "/sso/callback/:providerId",
      "/sso/saml2/sp/acs/:providerId",
      PASSKEY_SIGN_IN_PATH,
      "/two-factor/verify-totp",
      "/two-factor/verify-backup-code",
      PASSKEY_STEP_VERIFY_PATH,
      CHALLENGE_CONTINUE_PATH,
    ];
    // Off: every way in.
    for (const path of paths)
      expect(signInConfirms(path, false), path).toBe(true);
    // On: the second step answered, or a passkey sign-in.
    expect(paths.filter((path) => signInConfirms(path, true))).toEqual([
      PASSKEY_SIGN_IN_PATH,
      "/two-factor/verify-totp",
      "/two-factor/verify-backup-code",
      PASSKEY_STEP_VERIFY_PATH,
    ]);
    expect(signInConfirms("constructor", true)).toBe(false);
  });
});
