// A backup code that finishes a sign-in's second step is handed to the
// app's notifier (registerBackupCodeNotifier in packages/auth/
// sign-in-challenge.ts), which emails the account's address. Against a real
// betterAuth instance (memory adapter, no database or network) with the same
// twoFactor options and challenge plugin as packages/auth/server.ts, driven
// through auth.handler like a browser. Covers: only a backup code that
// worked, over HTTP, notifies; a wrong code, an authenticator code and the
// app's own server-side checks ("Confirm it's you", which sends its own) do
// not; a notifier that throws, or none at all, never fails the sign-in and
// is logged without the address.
import { createHmac } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  SERVER_ONLY_TWO_FACTOR_PATHS,
  UNUSED_TWO_FACTOR_PATHS,
} from "@repo/auth/sign-in-challenge-rules";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);

const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-at-least-32-characters-long";
const EMAIL = "backup-notice@qrdx.test";
const USER_AGENT = "Mozilla/5.0 (Macintosh) Chrome/142.0 Safari/537.36";

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
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(
    6,
    "0",
  );
}

/** A cookie jar over auth.handler. */
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

  absorb(lines: string[]) {
    for (const line of lines) {
      const [pair, ...attributes] = line.split(";");
      const [name, ...rest] = pair.split("=");
      if (attributes.some((a) => /^\s*max-age=0\s*$/i.test(a))) {
        this.cookies.delete(name.trim());
      } else {
        this.cookies.set(name.trim(), rest.join("="));
      }
    }
  }

  async post(pathAndQuery: string, body: unknown = {}) {
    const response = await this.handler(
      new Request(`${ORIGIN}/api/auth${pathAndQuery}`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          cookie: this.cookieHeader(),
          "content-type": "application/json",
          "user-agent": USER_AGENT,
        },
        body: JSON.stringify(body),
      }),
    );
    this.absorb(response.headers.getSetCookie());
    const text = await response.text();
    return {
      status: response.status,
      json: text ? (JSON.parse(text) as Record<string, unknown>) : null,
    };
  }

  async session() {
    const response = await this.handler(
      new Request(`${ORIGIN}/api/auth/get-session`, {
        headers: { origin: ORIGIN, cookie: this.cookieHeader() },
      }),
    );
    const text = await response.text();
    return text
      ? (JSON.parse(text) as { user: { email: string } } | null)
      : null;
  }

  headers() {
    return new Headers({ cookie: this.cookieHeader(), origin: ORIGIN });
  }
}

const sentCodes = new Map<string, string>();
let auth: any;
let db: Record<string, Record<string, unknown>[]>;
let registerBackupCodeNotifier: typeof import("@repo/auth/sign-in-challenge").registerBackupCodeNotifier;
let secret = "";
let codes: string[] = [];
let userId = "";

const notified: { id: string; email: string; userAgent: string | null }[] = [];
const recordNotice = ({
  user,
  headers,
}: {
  user: { id: string; email: string };
  headers: Headers;
}) => {
  notified.push({ ...user, userAgent: headers.get("user-agent") });
};

async function signInFirstStep(browser: Browser) {
  await browser.post("/email-otp/send-verification-otp", {
    email: EMAIL,
    type: "sign-in",
  });
  return browser.post("/sign-in/email-otp", {
    email: EMAIL,
    otp: sentCodes.get(EMAIL),
  });
}

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { twoFactor, emailOTP } = await import(
    `${betterAuthDir}/dist/plugins/index.mjs`
  );
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const challenge = await import("@repo/auth/sign-in-challenge");
  registerBackupCodeNotifier = challenge.registerBackupCodeNotifier;
  const rules = await import("@repo/auth/sign-in-challenge-rules");

  db = { user: [], session: [], account: [], verification: [], twoFactor: [] };
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
      twoFactorPlugin,
      challenge.signInChallenge(twoFactorPlugin, { relyingParty: null }),
    ],
  });

  // Sign up, then turn two-step verification on the way Settings does
  // (auth.api, after the app's own checks).
  const browser = new Browser(auth.handler);
  await signInFirstStep(browser);
  const enabled = await auth.api.enableTwoFactor({
    headers: browser.headers(),
    body: {},
  });
  secret = new URL(enabled.totpURI).searchParams.get("secret") ?? "";
  const confirmed = await auth.api.verifyTOTP({
    headers: browser.headers(),
    body: { code: totp(secret) },
    returnHeaders: true,
  });
  browser.absorb(confirmed.headers.getSetCookie());
  userId = String(db.user.find((u) => u.email === EMAIL)?.id);
  codes = (await auth.api.viewBackupCodes({ body: { userId } })).backupCodes;
  expect(codes).toHaveLength(10);
});

let errors: string[] = [];

beforeEach(() => {
  notified.length = 0;
  errors = [];
  registerBackupCodeNotifier(recordNotice);
  vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    errors.push(String(line));
  });
  return () => vi.restoreAllMocks();
});

const authLogs = () =>
  errors.filter((line) => line.includes("auth.backup_code_notice"));

describe("a backup code at sign-in", () => {
  it("hands the account and the request to the notifier once", async () => {
    const browser = new Browser(auth.handler);
    expect((await signInFirstStep(browser)).json?.twoFactorRedirect).toBe(true);
    const reply = await browser.post("/two-factor/verify-backup-code", {
      code: codes[0],
    });
    expect(reply.status).toBe(200);
    expect((await browser.session())?.user.email).toBe(EMAIL);
    expect(notified).toEqual([
      { id: userId, email: EMAIL, userAgent: USER_AGENT },
    ]);
  });

  it("a wrong backup code tells nobody", async () => {
    const browser = new Browser(auth.handler);
    await signInFirstStep(browser);
    const reply = await browser.post("/two-factor/verify-backup-code", {
      code: "ZZZZZ-ZZZ22",
    });
    expect(reply.status).toBe(401);
    // The one already used doesn't work twice, and isn't reported twice.
    const again = await browser.post("/two-factor/verify-backup-code", {
      code: codes[0],
    });
    expect(again.status).toBe(401);
    expect(notified).toEqual([]);
    // Refused codes aren't failures of the notice: nothing is logged.
    expect(authLogs()).toEqual([]);
  });

  it("an authenticator code isn't a backup code", async () => {
    const browser = new Browser(auth.handler);
    await signInFirstStep(browser);
    const reply = await browser.post("/two-factor/verify-totp", {
      code: totp(secret),
    });
    expect(reply.status).toBe(200);
    expect(notified).toEqual([]);
  });

  it("the app's server-side check (Confirm it's you) sends its own, so not here", async () => {
    const browser = new Browser(auth.handler);
    await signInFirstStep(browser);
    await browser.post("/two-factor/verify-totp", { code: totp(secret) });
    await auth.api.verifyBackupCode({
      headers: browser.headers(),
      body: { code: codes[1], disableSession: true },
    });
    const left = await auth.api.viewBackupCodes({ body: { userId } });
    expect(left.backupCodes).not.toContain(codes[1]);
    expect(notified).toEqual([]);
  });

  it("a code used up without a session (disableSession) is still reported", async () => {
    const browser = new Browser(auth.handler);
    await signInFirstStep(browser);
    const reply = await browser.post("/two-factor/verify-backup-code", {
      code: codes[2],
      disableSession: true,
    });
    expect(reply.status).toBe(200);
    expect(notified).toEqual([
      { id: userId, email: EMAIL, userAgent: USER_AGENT },
    ]);
  });

  it("a notifier that throws never fails the sign-in; it's logged without the address", async () => {
    registerBackupCodeNotifier(() => {
      throw new Error(`mail provider down for ${EMAIL}`);
    });
    const browser = new Browser(auth.handler);
    await signInFirstStep(browser);
    const reply = await browser.post("/two-factor/verify-backup-code", {
      code: codes[3],
    });
    expect(reply.status).toBe(200);
    expect((await browser.session())?.user.email).toBe(EMAIL);
    expect(authLogs()).toHaveLength(1);
    expect(authLogs()[0]).toContain('"outcome":"not-sent"');
    expect(authLogs()[0]).toContain('"error":"Error"');
    expect(authLogs()[0]).toContain("mail provider down for <address>");
    expect(authLogs()[0]).not.toContain(EMAIL);
    expect(authLogs()[0]).not.toContain(userId);
  });

  it("without a notifier the sign-in still works, and the gap is logged", async () => {
    registerBackupCodeNotifier(undefined as never);
    const browser = new Browser(auth.handler);
    await signInFirstStep(browser);
    const reply = await browser.post("/two-factor/verify-backup-code", {
      code: codes[4],
    });
    expect(reply.status).toBe(200);
    expect((await browser.session())?.user.email).toBe(EMAIL);
    expect(authLogs()).toEqual([
      JSON.stringify({
        event: "auth.backup_code_notice",
        outcome: "no-notifier",
      }),
    ]);
  });
});
