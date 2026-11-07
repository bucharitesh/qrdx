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
  DEVICE_COOKIE,
  type NewSignIn,
  registerNewSignInNotifier,
} from "@repo/auth/new-sign-in";
import {
  SERVER_ONLY_TWO_FACTOR_PATHS,
  UNUSED_TWO_FACTOR_PATHS,
} from "@repo/auth/sign-in-challenge-rules";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// apps/docs doesn't depend on better-auth itself; load the copy @repo/auth
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
