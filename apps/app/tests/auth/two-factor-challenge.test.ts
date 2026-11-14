// Two-step verification at sign-in, end to end inside Better Auth: a real
// betterAuth instance (memory adapter, no database or network) with the same
// twoFactor options and challenge plugin as packages/auth/server.ts, driven
// through auth.handler like a browser would. GitHub's OAuth endpoints are
// answered by a stubbed fetch, so the real /callback/:id code runs; a passkey
// sign-in is signed by a software authenticator (P-256), so the real
// /passkey/verify-authentication runs, with and without user verification.
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  sign,
} from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  SERVER_ONLY_TWO_FACTOR_PATHS,
  SERVER_SESSION_SWAP_PATHS,
  TWO_FACTOR_CHALLENGE_PATH,
  UNUSED_TWO_FACTOR_PATHS,
} from "@repo/auth/sign-in-challenge-rules";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// apps/app doesn't depend on better-auth itself; load the copy @repo/auth
// uses (the challenge plugin imports better-auth/api from there too).
const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);
const passkeyDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/@better-auth/passkey",
  ),
);

const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-at-least-32-characters-long";
const TWO_FACTOR_EMAIL = "two-step@qrdx.test";
const PLAIN_EMAIL = "plain@qrdx.test";

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

/** A 6-digit code that is certainly wrong right now. */
function wrongCode(secret: string): string {
  const valid = new Set(
    [-30_000, 0, 30_000].map((d) => totp(secret, Date.now() + d)),
  );
  for (let n = 0; ; n++) {
    const code = String(n).padStart(6, "0");
    if (!valid.has(code)) return code;
  }
}

// ─── A browser: a cookie jar over auth.handler ──────────────────────────────

interface Reply {
  status: number;
  json: Record<string, unknown> | null;
  location: string | null;
  setCookies: string[];
}

class Browser {
  cookies = new Map<string, string>();

  constructor(
    private readonly handler: (request: Request) => Promise<Response>,
  ) {}

  cookieHeader() {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  has(name: string) {
    return this.cookies.has(`better-auth.${name}`);
  }

  async request(
    method: "GET" | "POST",
    pathAndQuery: string,
    body?: unknown,
  ): Promise<Reply> {
    const headers = new Headers({
      origin: ORIGIN,
      cookie: this.cookieHeader(),
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
    return {
      status: response.status,
      json,
      location: response.headers.get("location"),
      setCookies,
    };
  }

  /** Applies Set-Cookie lines from an auth.api call made for this browser. */
  absorb(headers: Headers) {
    for (const line of headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const [name, ...rest] = pair.split("=");
      if (attributes.some((a) => /^\s*max-age=0\s*$/i.test(a))) {
        this.cookies.delete(name.trim());
      } else {
        this.cookies.set(name.trim(), rest.join("="));
      }
    }
  }

  post(pathAndQuery: string, body: unknown = {}) {
    return this.request("POST", pathAndQuery, body);
  }

  get(pathAndQuery: string) {
    return this.request("GET", pathAndQuery);
  }

  async session() {
    const reply = await this.get("/get-session");
    return reply.json as { user: { email: string } } | null;
  }
}

// ─── The auth under test ────────────────────────────────────────────────────

const sentCodes = new Map<string, string>();
let auth: any;
let db: Record<string, Record<string, unknown>[]>;
let totpSecret = "";
let backupCodes: string[] = [];

/** The test's GitHub account; its email is the 2FA user's (account linking). */
const GITHUB_USER = {
  id: 4242,
  login: "two-step",
  name: "Two Step",
  email: TWO_FACTOR_EMAIL,
  avatar_url: "https://avatars.example/4242",
};

const realFetch = globalThis.fetch;

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { twoFactor, emailOTP, organization } = await import(
    `${betterAuthDir}/dist/plugins/index.mjs`
  );
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { passkey } = await import(`${passkeyDir}/dist/index.mjs`);
  const { signInChallenge } = await import("@repo/auth/sign-in-challenge");
  const rules = await import("@repo/auth/sign-in-challenge-rules");

  db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    twoFactor: [],
    passkey: [],
    organization: [],
    member: [],
    invitation: [],
  };
  // The same twoFactor options as packages/auth/server.ts.
  const twoFactorPlugin = twoFactor({
    issuer: "QRdx",
    allowPasswordless: true,
    totpOptions: {
      issuer: "QRdx",
      digits: rules.TOTP_DIGITS,
      period: rules.TOTP_PERIOD_SECONDS,
    },
    backupCodeOptions: {
      amount: rules.BACKUP_CODE_COUNT,
      customBackupCodesGenerate: () =>
        rules.generateBackupCodes(rules.BACKUP_CODE_COUNT),
      storeBackupCodes: "encrypted",
    },
    trustDeviceMaxAge: rules.TRUST_DEVICE_DAYS * 24 * 60 * 60,
  });
  auth = betterAuth({
    baseURL: ORIGIN,
    secret: SECRET,
    database: memoryAdapter(db),
    socialProviders: {
      github: { clientId: "gh-id", clientSecret: "gh-secret" },
    },
    rateLimit: { enabled: false },
    disabledPaths: [
      ...UNUSED_TWO_FACTOR_PATHS,
      ...SERVER_ONLY_TWO_FACTOR_PATHS,
    ],
    plugins: [
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
      passkey({ rpID: "localhost", rpName: "QRdx", origin: ORIGIN }),
      organization(),
      twoFactorPlugin,
      signInChallenge(twoFactorPlugin, {
        relyingParty: { rpID: "localhost", origin: ORIGIN },
      }),
    ],
  });

  // GitHub's token and user endpoints; nothing else may leave the test.
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.href === "https://github.com/login/oauth/access_token") {
        return Response.json({
          access_token: "gh-token",
          token_type: "bearer",
          scope: "user:email",
        });
      }
      if (url.href === "https://api.github.com/user")
        return Response.json(GITHUB_USER);
      if (url.href === "https://api.github.com/user/emails") {
        return Response.json([
          { email: TWO_FACTOR_EMAIL, primary: true, verified: true },
        ]);
      }
      if (url.origin === ORIGIN) return realFetch(input, init);
      throw new Error(`Unexpected fetch in test: ${url.href}`);
    },
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
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

function headersFor(browser: Browser) {
  return new Headers({ cookie: browser.cookieHeader(), origin: ORIGIN });
}

// ─── The tests, in order: they share one user's state ───────────────────────

describe("two-step verification at sign-in", () => {
  it("never challenges someone without it", async () => {
    const browser = new Browser(auth.handler);
    const reply = await emailCodeSignIn(browser, PLAIN_EMAIL);
    expect(reply.json?.twoFactorRedirect).toBeUndefined();
    expect(reply.json?.token).toEqual(expect.any(String));
    expect((await browser.session())?.user.email).toBe(PLAIN_EMAIL);
  });

  it("can't be turned on over HTTP, only through auth.api", async () => {
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, TWO_FACTOR_EMAIL);
    for (const blocked of [
      ...SERVER_ONLY_TWO_FACTOR_PATHS,
      ...UNUSED_TWO_FACTOR_PATHS,
    ]) {
      expect((await browser.post(blocked, {})).status, blocked).toBe(404);
    }

    const enabled = await auth.api.enableTwoFactor({
      headers: headersFor(browser),
      body: {},
    });
    totpSecret = new URL(enabled.totpURI).searchParams.get("secret") ?? "";
    expect(enabled.backupCodes).toHaveLength(10);
    // Not on until the first code is confirmed.
    expect(
      db.user.find((u) => u.email === TWO_FACTOR_EMAIL)?.twoFactorEnabled,
    ).toBeFalsy();
    // Confirming swaps the session for a new one (the old one is deleted).
    const confirmed = await auth.api.verifyTOTP({
      headers: headersFor(browser),
      body: { code: totp(totpSecret) },
      returnHeaders: true,
    });
    browser.absorb(confirmed.headers);
    expect(
      db.user.find((u) => u.email === TWO_FACTOR_EMAIL)?.twoFactorEnabled,
    ).toBe(true);
    expect((await browser.session())?.user.email).toBe(TWO_FACTOR_EMAIL);
    const headers = headersFor(browser);

    // The other server-only endpoints still answer auth.api.
    const uri = await auth.api.getTOTPURI({ headers, body: {} });
    expect(uri.totpURI).toContain("otpauth://totp/QRdx");
    const regenerated = await auth.api.generateBackupCodes({
      headers,
      body: {},
    });
    backupCodes = regenerated.backupCodes;
    expect(backupCodes).toHaveLength(10);
    // Easy to read: no 0, O, 1, I or l, grouped 5-5.
    for (const backupCode of backupCodes) {
      expect(backupCode).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    }
    const view = await auth.api.viewBackupCodes({
      body: { userId: db.user.find((u) => u.email === TWO_FACTOR_EMAIL)?.id },
    });
    expect(view.backupCodes).toEqual(backupCodes);
  });

  it("challenges an email-code sign-in and finishes it with an authenticator code", async () => {
    const browser = new Browser(auth.handler);
    const reply = await emailCodeSignIn(browser, TWO_FACTOR_EMAIL);
    expect(reply.json).toEqual({
      twoFactorRedirect: true,
      twoFactorMethods: ["totp"],
    });
    // No session cookie with a value ever reaches the browser.
    expect(reply.setCookies.some((c) => /session_token=[^;]+;/.test(c))).toBe(
      false,
    );
    expect(browser.has("session_token")).toBe(false);
    expect(browser.has("two_factor")).toBe(true);
    expect(await browser.session()).toBeNull();

    const wrong = await browser.post("/two-factor/verify-totp", {
      code: wrongCode(totpSecret),
    });
    expect(wrong.status).toBe(401);
    expect(wrong.json?.code).toBe("INVALID_CODE");

    const right = await browser.post("/two-factor/verify-totp", {
      code: totp(totpSecret),
    });
    expect(right.status).toBe(200);
    expect((await browser.session())?.user.email).toBe(TWO_FACTOR_EMAIL);
    expect(browser.has("two_factor")).toBe(false);
  });

  it("accepts a backup code once and only once", async () => {
    const [code] = backupCodes;
    const first = new Browser(auth.handler);
    await emailCodeSignIn(first, TWO_FACTOR_EMAIL);
    const used = await first.post("/two-factor/verify-backup-code", { code });
    expect(used.status).toBe(200);
    expect((await first.session())?.user.email).toBe(TWO_FACTOR_EMAIL);

    const second = new Browser(auth.handler);
    await emailCodeSignIn(second, TWO_FACTOR_EMAIL);
    const again = await second.post("/two-factor/verify-backup-code", { code });
    expect(again.status).toBe(401);
    expect(again.json?.code).toBe("INVALID_BACKUP_CODE");
    expect(await second.session()).toBeNull();
    // Typed the way people do: lower case, no dash. The challenge plugin
    // normalises it before the plugin's exact-match comparison.
    const other = await second.post("/two-factor/verify-backup-code", {
      code: backupCodes[1].replace("-", "").toLowerCase(),
    });
    expect(other.status).toBe(200);
  });

  it("accepts a backup code with spaces and mixed case, and refuses junk", async () => {
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, TWO_FACTOR_EMAIL);
    const junk = await browser.post("/two-factor/verify-backup-code", {
      code: "00000-OOOOO",
    });
    expect(junk.status).toBe(401);
    expect(junk.json?.code).toBe("INVALID_BACKUP_CODE");
    const [left, right] = backupCodes[3].split("-");
    const spaced = await browser.post("/two-factor/verify-backup-code", {
      code: ` ${left.toLowerCase()} ${right} `,
    });
    expect(spaced.status).toBe(200);
    expect((await browser.session())?.user.email).toBe(TWO_FACTOR_EMAIL);
  });

  it("skips the challenge on a trusted device, and only there", async () => {
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, TWO_FACTOR_EMAIL);
    await browser.post("/two-factor/verify-totp", {
      code: totp(totpSecret),
      trustDevice: true,
    });
    expect(browser.has("trust_device")).toBe(true);
    await browser.post("/sign-out");
    expect(await browser.session()).toBeNull();

    const again = await emailCodeSignIn(browser, TWO_FACTOR_EMAIL);
    expect(again.json?.twoFactorRedirect).toBeUndefined();
    expect((await browser.session())?.user.email).toBe(TWO_FACTOR_EMAIL);

    const elsewhere = new Browser(auth.handler);
    const challenged = await emailCodeSignIn(elsewhere, TWO_FACTOR_EMAIL);
    expect(challenged.json?.twoFactorRedirect).toBe(true);
  });

  it("challenges a GitHub callback and keeps the destination for afterwards", async () => {
    const browser = new Browser(auth.handler);
    const destination = "/oauth/authorize?client_id=app&state=xyz";
    const start = await browser.post("/sign-in/social", {
      provider: "github",
      callbackURL: destination,
    });
    const state = new URL(String(start.json?.url)).searchParams.get("state");
    expect(state).toBeTruthy();

    const callback = await browser.get(
      `/callback/github?code=gh-code&state=${state}`,
    );
    expect(callback.status).toBe(302);
    const location = new URL(String(callback.location));
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe(TWO_FACTOR_CHALLENGE_PATH);
    expect(location.searchParams.get("next")).toBe(destination);
    expect(
      callback.setCookies.some((c) => /session_token=[^;]+;/.test(c)),
    ).toBe(false);
    expect(await browser.session()).toBeNull();
    expect(browser.has("two_factor")).toBe(true);
    // GitHub was linked to the existing account, not a new one.
    expect(db.user.filter((u) => u.email === TWO_FACTOR_EMAIL)).toHaveLength(1);

    const done = await browser.post("/two-factor/verify-totp", {
      code: totp(totpSecret),
    });
    expect(done.status).toBe(200);
    expect((await browser.session())?.user.email).toBe(TWO_FACTOR_EMAIL);
  });

  /** A browser signed in as the 2FA user, challenge finished. */
  async function signedInBrowser() {
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, TWO_FACTOR_EMAIL);
    await browser.post("/two-factor/verify-totp", { code: totp(totpSecret) });
    const live = (await browser.request("GET", "/get-session")).json as {
      session: { token: string };
    };
    expect(live.session.token).toEqual(expect.any(String));
    return { browser, token: live.session.token };
  }

  it("challenges an email-code sign-in from a browser already signed in as that person", async () => {
    // An old (stolen) session cookie plus the mailbox must not mint a fresh
    // session: adding a passkey and changing the email check for one.
    const { browser } = await signedInBrowser();
    const sessions = db.session.length;
    const reply = await emailCodeSignIn(browser, TWO_FACTOR_EMAIL);
    expect(reply.json).toEqual({
      twoFactorRedirect: true,
      twoFactorMethods: ["totp"],
    });
    expect(reply.setCookies.some((c) => /session_token=[^;]+;/.test(c))).toBe(
      false,
    );
    // The session the sign-in made is gone again.
    expect(db.session).toHaveLength(sessions);
    expect(browser.has("two_factor")).toBe(true);
    expect(await browser.session()).toBeNull();

    const done = await browser.post("/two-factor/verify-totp", {
      code: totp(totpSecret),
    });
    expect(done.status).toBe(200);
    expect((await browser.session())?.user.email).toBe(TWO_FACTOR_EMAIL);
  });

  it("challenges a GitHub callback from a browser already signed in as that person", async () => {
    const { browser } = await signedInBrowser();
    const start = await browser.post("/sign-in/social", {
      provider: "github",
      callbackURL: "/dashboard",
    });
    const state = new URL(String(start.json?.url)).searchParams.get("state");
    const callback = await browser.get(
      `/callback/github?code=gh-code&state=${state}`,
    );
    expect(callback.status).toBe(302);
    expect(new URL(String(callback.location)).pathname).toBe(
      TWO_FACTOR_CHALLENGE_PATH,
    );
    expect(
      callback.setCookies.some((c) => /session_token=[^;]+;/.test(c)),
    ).toBe(false);
    expect(await browser.session()).toBeNull();
  });

  it("doesn't challenge a refresh of the session the browser has", async () => {
    const { browser, token } = await signedInBrowser();
    // Due for a refresh (Better Auth's updateAge has passed).
    const row = db.session.find((s) => s.token === token);
    if (!row) throw new Error("session row missing");
    row.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const reply = await browser.get("/get-session");
    expect(reply.status).toBe(200);
    expect(reply.json?.twoFactorRedirect).toBeUndefined();
    const refreshed = reply.json as {
      session: { token: string; expiresAt: string };
    };
    expect(refreshed.session.token).toBe(token);
    expect(new Date(refreshed.session.expiresAt).getTime()).toBeGreaterThan(
      Date.now() + 24 * 60 * 60 * 1000,
    );
    expect(reply.setCookies.some((c) => /session_token=[^;]+;/.test(c))).toBe(
      true,
    );
    expect(browser.has("two_factor")).toBe(false);
    expect((await browser.session())?.user.email).toBe(TWO_FACTOR_EMAIL);
  });

  it("doesn't challenge creating or switching workspace", async () => {
    const { browser, token } = await signedInBrowser();
    const created = await browser.post("/organization/create", {
      name: "Two Step Co",
      slug: `two-step-${randomBytes(4).toString("hex")}`,
    });
    expect(created.status).toBe(200);
    const id = String(created.json?.id);
    expect(id).not.toBe("undefined");

    const cleared = await browser.post("/organization/set-active", {
      organizationId: null,
    });
    expect(cleared.status).toBe(200);
    expect(cleared.json).toBeNull();
    const switched = await browser.post("/organization/set-active", {
      organizationId: id,
    });
    expect(switched.status).toBe(200);
    expect(switched.json?.id).toBe(id);
    expect(switched.json?.twoFactorRedirect).toBeUndefined();

    const now = (await browser.get("/get-session")).json as {
      session: { token: string; activeOrganizationId: string };
    };
    expect(now.session.token).toBe(token);
    expect(now.session.activeOrganizationId).toBe(id);
    expect(browser.has("two_factor")).toBe(false);
  });

  it("challenges a sign-in made server-side too (auth.api is no way around the code)", async () => {
    // Only the 2FA management calls on SERVER_SESSION_SWAP_PATHS are exempt
    // when they run server-side; a server action that signs someone in is
    // challenged like a browser.
    const { browser } = await signedInBrowser();
    await browser.post("/email-otp/send-verification-otp", {
      email: TWO_FACTOR_EMAIL,
      type: "sign-in",
    });
    const result = (await auth.api.signInEmailOTP({
      headers: headersFor(browser),
      body: { email: TWO_FACTOR_EMAIL, otp: sentCodes.get(TWO_FACTOR_EMAIL) },
    })) as { twoFactorRedirect?: boolean; token?: string };
    expect(result.twoFactorRedirect).toBe(true);
    expect(result.token).toBeUndefined();
  });

  it("exempts only the listed 2FA management paths when they run server-side", () => {
    expect([...SERVER_SESSION_SWAP_PATHS].sort()).toEqual([
      "/two-factor/disable",
      "/two-factor/enable",
    ]);
  });

  it("refuses the challenge endpoints over HTTP to a signed-in browser", async () => {
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, TWO_FACTOR_EMAIL);
    await browser.post("/two-factor/verify-totp", { code: totp(totpSecret) });
    const totpCheck = await browser.post("/two-factor/verify-totp", {
      code: totp(totpSecret),
    });
    expect(totpCheck.status).toBe(403);
    expect(totpCheck.json?.code).toBe("ALREADY_SIGNED_IN");
    const backupCheck = await browser.post("/two-factor/verify-backup-code", {
      code: backupCodes[2],
    });
    expect(backupCheck.status).toBe(403);
  });

  it("ends a challenge after 5 wrong codes", async () => {
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, TWO_FACTOR_EMAIL);
    for (let i = 0; i < 5; i++) {
      const reply = await browser.post("/two-factor/verify-totp", {
        code: wrongCode(totpSecret),
      });
      expect(reply.json?.code).toBe("INVALID_CODE");
    }
    const sixth = await browser.post("/two-factor/verify-totp", {
      code: totp(totpSecret),
    });
    expect(sixth.status).toBe(400);
    expect(sixth.json?.code).toBe("TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE");
    const after = await browser.post("/two-factor/verify-totp", {
      code: totp(totpSecret),
    });
    expect(after.json?.code).toBe("INVALID_TWO_FACTOR_COOKIE");
    expect(await browser.session()).toBeNull();
  });

  it("locks the account after 10 wrong codes in a row, across challenges", async () => {
    // 5 failures above; 5 more in a new challenge reach the limit.
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, TWO_FACTOR_EMAIL);
    for (let i = 0; i < 5; i++) {
      await browser.post("/two-factor/verify-totp", {
        code: wrongCode(totpSecret),
      });
    }
    const next = new Browser(auth.handler);
    await emailCodeSignIn(next, TWO_FACTOR_EMAIL);
    const locked = await next.post("/two-factor/verify-totp", {
      code: totp(totpSecret),
    });
    expect(locked.status).toBe(429);
    expect(locked.json?.code).toBe("ACCOUNT_TEMPORARILY_LOCKED");
    // Unlock for the remaining tests (as 15 minutes passing would).
    const row = db.twoFactor[0];
    row.lockedUntil = null;
    row.failedVerificationCount = 0;
  });

  describe("passkeys", () => {
    let privateKey: KeyObject;
    const credentialId = randomBytes(16).toString("base64url");

    beforeAll(() => {
      const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
      privateKey = pair.privateKey;
      const jwk = pair.publicKey.export({ format: "jwk" });
      const x = Buffer.from(String(jwk.x), "base64url");
      const y = Buffer.from(String(jwk.y), "base64url");
      // COSE_Key {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}
      const cose = Buffer.concat([
        Buffer.from([
          0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20,
        ]),
        x,
        Buffer.from([0x22, 0x58, 0x20]),
        y,
      ]);
      const user = db.user.find((u) => u.email === TWO_FACTOR_EMAIL);
      db.passkey.push({
        id: "pk-1",
        name: "Test key",
        publicKey: cose.toString("base64"),
        userId: user?.id,
        credentialID: credentialId,
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
        transports: "internal",
        createdAt: new Date(),
      });
    });

    let signCount = 0;
    async function passkeySignIn(browser: Browser, userVerified: boolean) {
      const options = await browser.get(
        "/passkey/generate-authenticate-options",
      );
      const challenge = String(options.json?.challenge);
      const clientDataJSON = Buffer.from(
        JSON.stringify({
          type: "webauthn.get",
          challenge,
          origin: ORIGIN,
          crossOrigin: false,
        }),
      );
      const flags = 0x01 | (userVerified ? 0x04 : 0);
      const counter = Buffer.alloc(4);
      counter.writeUInt32BE(++signCount);
      const authenticatorData = Buffer.concat([
        createHash("sha256").update("localhost").digest(),
        Buffer.from([flags]),
        counter,
      ]);
      const signature = sign(
        "sha256",
        Buffer.concat([
          authenticatorData,
          createHash("sha256").update(clientDataJSON).digest(),
        ]),
        privateKey,
      );
      return browser.post("/passkey/verify-authentication", {
        response: {
          id: credentialId,
          rawId: credentialId,
          type: "public-key",
          clientExtensionResults: {},
          response: {
            clientDataJSON: clientDataJSON.toString("base64url"),
            authenticatorData: authenticatorData.toString("base64url"),
            signature: signature.toString("base64url"),
          },
        },
      });
    }

    it("doesn't challenge a passkey sign-in with user verification", async () => {
      const browser = new Browser(auth.handler);
      const reply = await passkeySignIn(browser, true);
      expect(reply.status).toBe(200);
      expect(reply.json?.twoFactorRedirect).toBeUndefined();
      expect((await browser.session())?.user.email).toBe(TWO_FACTOR_EMAIL);
    });

    it("challenges a passkey sign-in without user verification", async () => {
      const browser = new Browser(auth.handler);
      const reply = await passkeySignIn(browser, false);
      expect(reply.json).toEqual({
        twoFactorRedirect: true,
        twoFactorMethods: ["totp"],
      });
      expect(await browser.session()).toBeNull();
      const done = await browser.post("/two-factor/verify-totp", {
        code: totp(totpSecret),
      });
      expect(done.status).toBe(200);
    });
  });

  it("turns off through auth.api, and sign-in stops asking", async () => {
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, TWO_FACTOR_EMAIL);
    await browser.post("/two-factor/verify-totp", { code: totp(totpSecret) });
    await auth.api.disableTwoFactor({ headers: headersFor(browser), body: {} });
    expect(db.twoFactor).toHaveLength(0);

    const fresh = new Browser(auth.handler);
    const reply = await emailCodeSignIn(fresh, TWO_FACTOR_EMAIL);
    expect(reply.json?.twoFactorRedirect).toBeUndefined();
    expect((await fresh.session())?.user.email).toBe(TWO_FACTOR_EMAIL);
  });
});
