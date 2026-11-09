// Signing in with an authenticator code or a backup code cancels support's
// pending turn-off of two-step verification (packages/auth/two-factor-reset
// .ts); a passkey never does, as the second step or with "Continue with
// passkey" (the reset is for a lost device). Inside Better Auth: a real
// betterAuth instance (memory adapter, no database or network) with the same
// plugin order as packages/auth/server.ts (email codes, two-step verification
// and its challenge, passkeys, then the cancel), driven through auth.handler
// like a browser, with a software authenticator (P-256) for passkeys. The
// app's notifier is replaced by one that records what it's given.
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
import { signInIsStrong } from "@repo/auth/new-sign-in";
import {
  PASSKEY_SIGN_IN_PATH,
  PASSKEY_STEP_OPTIONS_PATH,
  PASSKEY_STEP_VERIFY_PATH,
  SERVER_ONLY_TWO_FACTOR_PATHS,
  UNUSED_TWO_FACTOR_PATHS,
} from "@repo/auth/sign-in-challenge-rules";
import {
  RESET_CANCELLING_SIGN_IN_PATHS,
  registerTwoFactorResetCancelledNotifier,
  signInCancelsTwoFactorReset,
  type TwoFactorResetCancelled,
  twoFactorResetIdentifier,
} from "@repo/auth/two-factor-reset";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
const RP_ID = "localhost";
const SECRET = "test-secret-at-least-32-characters-long";
const DAY = 86_400_000;

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

  get(pathAndQuery: string) {
    return this.post(pathAndQuery, undefined, "GET");
  }

  async post(
    pathAndQuery: string,
    body: unknown = {},
    method: "GET" | "POST" = "POST",
  ) {
    const response = await this.handler(
      new Request(`${ORIGIN}/api/auth${pathAndQuery}`, {
        method,
        headers: {
          origin: ORIGIN,
          cookie: this.cookieHeader(),
          "content-type": "application/json",
          "user-agent": "test-browser",
        },
        body: method === "GET" ? undefined : JSON.stringify(body),
      }),
    );
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const [name, ...rest] = pair.split("=");
      if (attributes.some((a) => /^\s*max-age=0\s*$/i.test(a))) {
        this.cookies.delete(name.trim());
      } else {
        this.cookies.set(name.trim(), rest.join("="));
      }
    }
    const text = await response.text();
    return {
      status: response.status,
      json: text ? (JSON.parse(text) as Record<string, unknown>) : null,
    };
  }
}

// ─── A software authenticator ───────────────────────────────────────────────

interface Authenticator {
  credentialId: string;
  privateKey: KeyObject;
  count: number;
}

/** A P-256 key pair and its passkey row (COSE public key, as stored). */
function newAuthenticator(userId: string): Authenticator {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const x = Buffer.from(String(jwk.x), "base64url");
  const y = Buffer.from(String(jwk.y), "base64url");
  // COSE_Key {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}
  const cose = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    x,
    Buffer.from([0x22, 0x58, 0x20]),
    y,
  ]);
  const credentialId = randomBytes(16).toString("base64url");
  db.passkey.push({
    id: `pk-${credentialId}`,
    name: "Phone",
    publicKey: cose.toString("base64"),
    userId,
    credentialID: credentialId,
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
    transports: "internal",
    createdAt: new Date(),
  });
  return { credentialId, privateKey: pair.privateKey, count: 0 };
}

/** An assertion over `challenge` by `key`, user verified. */
function assertion(key: Authenticator, challenge: string) {
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge,
      origin: ORIGIN,
      crossOrigin: false,
    }),
  );
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(++key.count);
  const authenticatorData = Buffer.concat([
    createHash("sha256").update(RP_ID).digest(),
    Buffer.from([0x01 | 0x04]),
    counter,
  ]);
  const signature = sign(
    "sha256",
    Buffer.concat([
      authenticatorData,
      createHash("sha256").update(clientDataJSON).digest(),
    ]),
    key.privateKey,
  );
  return {
    id: key.credentialId,
    rawId: key.credentialId,
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: clientDataJSON.toString("base64url"),
      authenticatorData: authenticatorData.toString("base64url"),
      signature: signature.toString("base64url"),
    },
  };
}

const sentCodes = new Map<string, string>();
const cancelled: TwoFactorResetCancelled[] = [];
let auth: any;
let db: Record<string, Record<string, unknown>[]>;

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { twoFactor, emailOTP } = await import(
    `${betterAuthDir}/dist/plugins/index.mjs`
  );
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { passkey } = await import(`${passkeyDir}/dist/index.mjs`);
  const { signInChallenge } = await import("@repo/auth/sign-in-challenge");
  const { twoFactorResetCancel } = await import("@repo/auth/two-factor-reset");
  const rules = await import("@repo/auth/sign-in-challenge-rules");

  db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    twoFactor: [],
    passkey: [],
  };
  const twoFactorPlugin = twoFactor({
    issuer: "QRdx",
    allowPasswordless: true,
    totpOptions: {
      issuer: "QRdx",
      digits: rules.TOTP_DIGITS,
      period: rules.TOTP_PERIOD_SECONDS,
    },
    backupCodeOptions: {
      customBackupCodesGenerate: () =>
        rules.generateBackupCodes(rules.BACKUP_CODE_COUNT),
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
      signInChallenge(twoFactorPlugin, {
        relyingParty: { rpID: RP_ID, origin: ORIGIN },
      }),
      passkey({ rpID: RP_ID, rpName: "QRdx", origin: ORIGIN }),
      twoFactorResetCancel(),
    ],
  });
});

beforeEach(() => {
  cancelled.length = 0;
  registerTwoFactorResetCancelledNotifier((event) => {
    cancelled.push(event);
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
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

const RECORD = {
  dueAt: "2026-11-16T00:00:00.000Z",
  requestedAt: "2026-11-08T15:20:00.000Z",
  requestedBy: { id: "admin_1", email: "admin@qrdx.test" },
};

/** An account with two-step verification on and support's reset waiting. */
async function pendingAccount(email: string) {
  const first = new Browser(auth.handler);
  await emailCodeSignIn(first, email);
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
  const user = db.user.find((u) => u.email === email);
  db.verification.push({
    id: `reset_${email}`,
    identifier: twoFactorResetIdentifier(String(user?.id)),
    value: JSON.stringify(RECORD),
    expiresAt: new Date(Date.now() + 30 * DAY),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return {
    secret,
    backupCodes: enabled.backupCodes as string[],
    userId: String(user?.id),
  };
}

const pending = (userId: string) =>
  db.verification.some(
    (row) => row.identifier === twoFactorResetIdentifier(userId),
  );

describe("signing in with the second step", () => {
  it("cancels support's pending reset once an authenticator code is answered", async () => {
    const { secret, userId } = await pendingAccount("totp@qrdx.test");
    const browser = new Browser(auth.handler);

    const challenged = await emailCodeSignIn(browser, "totp@qrdx.test");
    expect(challenged.json?.twoFactorRedirect).toBe(true);
    // The first step alone cancels nothing.
    expect(pending(userId)).toBe(true);
    expect(cancelled).toEqual([]);

    const done = await browser.post("/two-factor/verify-totp", {
      code: totp(secret),
    });
    expect(done.status).toBe(200);
    expect(pending(userId)).toBe(false);
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].user).toEqual({ id: userId, email: "totp@qrdx.test" });
    expect(cancelled[0].record).toEqual(RECORD);
    expect(cancelled[0].headers.get("user-agent")).toBe("test-browser");
  });

  it("cancels it with a backup code too", async () => {
    const { backupCodes, userId } = await pendingAccount("backup@qrdx.test");
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, "backup@qrdx.test");
    const done = await browser.post("/two-factor/verify-backup-code", {
      code: backupCodes[0],
    });
    expect(done.status).toBe(200);
    expect(pending(userId)).toBe(false);
    expect(cancelled).toHaveLength(1);
  });

  it("not with a wrong code", async () => {
    const { userId } = await pendingAccount("wrong@qrdx.test");
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, "wrong@qrdx.test");
    const done = await browser.post("/two-factor/verify-totp", {
      code: "000000",
    });
    expect(done.status).toBeGreaterThanOrEqual(400);
    expect(pending(userId)).toBe(true);
    expect(cancelled).toEqual([]);
  });

  it("not when a trusted device skipped the second step", async () => {
    const { secret, userId } = await pendingAccount("trusted@qrdx.test");
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, "trusted@qrdx.test");
    await browser.post("/two-factor/verify-totp", {
      code: totp(secret),
      trustDevice: true,
    });
    // That sign-in cancelled it; put it back, then sign in on the trusted
    // browser, which skips the step.
    db.verification.push({
      id: "reset_again",
      identifier: twoFactorResetIdentifier(userId),
      value: JSON.stringify(RECORD),
      expiresAt: new Date(Date.now() + 30 * DAY),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    cancelled.length = 0;
    await browser.post("/sign-out");
    const again = await emailCodeSignIn(browser, "trusted@qrdx.test");
    expect(again.status).toBe(200);
    expect(again.json?.twoFactorRedirect).toBeUndefined();
    expect(pending(userId)).toBe(true);
    expect(cancelled).toEqual([]);
  });

  it("not for a check made server-side through auth.api", async () => {
    const { secret, userId } = await pendingAccount("server@qrdx.test");
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, "server@qrdx.test");
    await browser.post("/two-factor/verify-totp", { code: totp(secret) });
    db.verification.push({
      id: "reset_server",
      identifier: twoFactorResetIdentifier(userId),
      value: JSON.stringify(RECORD),
      expiresAt: new Date(Date.now() + 30 * DAY),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    cancelled.length = 0;
    // What "Confirm it's you" does with a code: the app's own check.
    await auth.api.verifyTOTP({
      headers: new Headers({ cookie: browser.cookieHeader(), origin: ORIGIN }),
      body: { code: totp(secret) },
    });
    expect(pending(userId)).toBe(true);
    expect(cancelled).toEqual([]);
  });

  it("not for a second step finished server-side through auth.api", async () => {
    const { secret, userId } = await pendingAccount("server-step@qrdx.test");
    const browser = new Browser(auth.handler);
    const challenged = await emailCodeSignIn(browser, "server-step@qrdx.test");
    expect(challenged.json?.twoFactorRedirect).toBe(true);
    const result = await auth.api.verifyTOTP({
      headers: new Headers({ cookie: browser.cookieHeader(), origin: ORIGIN }),
      body: { code: totp(secret) },
    });
    // It did sign in…
    expect(result.token).toEqual(expect.any(String));
    // …but not over HTTP, so it isn't the person signing in.
    expect(pending(userId)).toBe(true);
    expect(cancelled).toEqual([]);
  });

  it("leaves other accounts' resets alone, and stays quiet without one", async () => {
    const one = await pendingAccount("one@qrdx.test");
    const two = await pendingAccount("two@qrdx.test");
    db.verification = db.verification.filter(
      (row) => row.identifier !== twoFactorResetIdentifier(two.userId),
    );
    const browser = new Browser(auth.handler);
    await emailCodeSignIn(browser, "two@qrdx.test");
    await browser.post("/two-factor/verify-totp", { code: totp(two.secret) });
    expect(pending(one.userId)).toBe(true);
    expect(cancelled).toEqual([]);
  });

  it("only an authenticator code or a backup code cancels it, never a passkey", () => {
    expect([...RESET_CANCELLING_SIGN_IN_PATHS]).toEqual([
      "/two-factor/verify-totp",
      "/two-factor/verify-backup-code",
    ]);
    for (const path of [PASSKEY_STEP_VERIFY_PATH, PASSKEY_SIGN_IN_PATH]) {
      expect(signInCancelsTwoFactorReset(path), path).toBe(false);
      // Both still count as strong for "Confirm it's you".
      expect(signInIsStrong(path), path).toBe(true);
    }
    expect(signInCancelsTwoFactorReset("/sign-in/email-otp")).toBe(false);
  });
});

describe("signing in with a passkey", () => {
  it("as the second step: signed in, and the reset still waits", async () => {
    const { userId } = await pendingAccount("step@qrdx.test");
    const key = newAuthenticator(userId);
    const browser = new Browser(auth.handler);
    const challenged = await emailCodeSignIn(browser, "step@qrdx.test");
    expect(challenged.json?.twoFactorRedirect).toBe(true);
    const options = await browser.post(PASSKEY_STEP_OPTIONS_PATH, {});
    expect(options.status).toBe(200);
    const done = await browser.post(PASSKEY_STEP_VERIFY_PATH, {
      response: assertion(key, String(options.json?.challenge)),
    });
    expect(done.status).toBe(200);
    expect(db.session.some((row) => row.userId === userId)).toBe(true);
    expect(pending(userId)).toBe(true);
    expect(cancelled).toEqual([]);
  });

  it('with "Continue with passkey": signed in, and the reset still waits', async () => {
    const { userId } = await pendingAccount("continue@qrdx.test");
    const key = newAuthenticator(userId);
    const browser = new Browser(auth.handler);
    const options = await browser.get("/passkey/generate-authenticate-options");
    expect(options.status).toBe(200);
    const sessionsBefore = db.session.length;
    const done = await browser.post(PASSKEY_SIGN_IN_PATH, {
      response: assertion(key, String(options.json?.challenge)),
    });
    expect(done.status).toBe(200);
    expect(done.json?.twoFactorRedirect).toBeUndefined();
    expect(db.session.length).toBe(sessionsBefore + 1);
    expect(pending(userId)).toBe(true);
    expect(cancelled).toEqual([]);
  });
});
