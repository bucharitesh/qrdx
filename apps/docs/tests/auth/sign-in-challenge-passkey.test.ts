// A passkey as the second step of signing in (packages/auth/
// sign-in-challenge-passkey.ts), end to end inside Better Auth: a real
// betterAuth instance (memory adapter, no database or network) with the same
// twoFactor options and challenge plugin as packages/auth/server.ts, driven
// through auth.handler like a browser. Passkeys are signed by a software
// authenticator (P-256), so the real WebAuthn checks run, with and without
// user verification.
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
  CHALLENGE_ATTEMPTS,
  LOCKOUT_FAILURES,
  PASSKEY_STEP_OPTIONS_PATH,
  PASSKEY_STEP_VERIFY_PATH,
  SERVER_ONLY_TWO_FACTOR_PATHS,
  TWO_FACTOR_METHODS_PATH,
  UNUSED_TWO_FACTOR_PATHS,
} from "@repo/auth/sign-in-challenge-rules";
import { beforeAll, describe, expect, it } from "vitest";

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
    this.absorbLines(setCookies);
    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, setCookies };
  }

  absorbLines(lines: string[]) {
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

// ─── A software authenticator ───────────────────────────────────────────────

interface Authenticator {
  credentialId: string;
  privateKey: KeyObject;
  count: number;
}

/** A P-256 key pair and its passkey row (COSE public key, as stored). */
function newAuthenticator(userId: string, name: string): Authenticator {
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
    name,
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

/** An assertion over `challenge` by `key` (flags: UP, plus UV if verified). */
function assertion(
  key: Authenticator,
  challenge: string,
  { userVerified = true, origin = ORIGIN } = {},
) {
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge,
      origin,
      crossOrigin: false,
    }),
  );
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(++key.count);
  const authenticatorData = Buffer.concat([
    createHash("sha256").update(RP_ID).digest(),
    Buffer.from([0x01 | (userVerified ? 0x04 : 0)]),
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

// ─── The auth under test ────────────────────────────────────────────────────

const sentCodes = new Map<string, string>();
let auth: any;
let noPasskeysAuth: any;
let db: Record<string, Record<string, unknown>[]>;

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

interface Person {
  email: string;
  id: string;
  secret: string;
  backupCodes: string[];
}

/** Signs up `email` and turns two-step verification on (authenticator app). */
async function personWithTwoFactor(email: string): Promise<Person> {
  const browser = new Browser(auth.handler);
  await emailCodeSignIn(browser, email);
  const enabled = await auth.api.enableTwoFactor({
    headers: headersFor(browser),
    body: {},
  });
  const secret = new URL(enabled.totpURI).searchParams.get("secret") ?? "";
  const confirmed = await auth.api.verifyTOTP({
    headers: headersFor(browser),
    body: { code: totp(secret) },
    returnHeaders: true,
  });
  browser.absorbLines(confirmed.headers.getSetCookie());
  const id = String(db.user.find((u) => u.email === email)?.id);
  return { email, id, secret, backupCodes: enabled.backupCodes };
}

/** A browser with a pending challenge for `person` (after the email code). */
async function pendingBrowser(person: Person, handler = auth.handler) {
  const browser = new Browser(handler);
  const reply = await emailCodeSignIn(browser, person.email);
  expect(reply.json?.twoFactorRedirect).toBe(true);
  expect(browser.has("two_factor")).toBe(true);
  return browser;
}

async function passkeyOptions(browser: Browser) {
  return browser.post(PASSKEY_STEP_OPTIONS_PATH, {});
}

/** Options, then an assertion over their challenge, then verify. */
async function passkeyStep(
  browser: Browser,
  key: Authenticator,
  {
    userVerified = true,
    trustDevice,
  }: { userVerified?: boolean; trustDevice?: boolean } = {},
) {
  const options = await passkeyOptions(browser);
  expect(options.status).toBe(200);
  return browser.post(PASSKEY_STEP_VERIFY_PATH, {
    response: assertion(key, String(options.json?.challenge), {
      userVerified,
    }),
    ...(trustDevice === undefined ? {} : { trustDevice }),
  });
}

const twoFactorRowOf = (person: Person) =>
  db.twoFactor.find((row) => row.userId === person.id) as Record<
    string,
    unknown
  >;

function unlock(person: Person) {
  const row = twoFactorRowOf(person);
  row.lockedUntil = null;
  row.failedVerificationCount = 0;
}

let ana: Person;
let ben: Person;
let cara: Person;
let anaKey: Authenticator;
let benKey: Authenticator;
let caraKey: Authenticator;

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
  const rules = await import("@repo/auth/sign-in-challenge-rules");

  db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    twoFactor: [],
    passkey: [],
  };
  const build = (relyingParty: { rpID: string; origin: string } | null) => {
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
    return betterAuth({
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
        passkey({ rpID: RP_ID, rpName: "QRdx", origin: ORIGIN }),
        twoFactorPlugin,
        signInChallenge(twoFactorPlugin, { relyingParty }),
      ],
    });
  };
  auth = build({ rpID: RP_ID, origin: ORIGIN });
  // The same database, on a server where passkeys can't work.
  noPasskeysAuth = build(null);

  ana = await personWithTwoFactor("ana@qrdx.test");
  ben = await personWithTwoFactor("ben@qrdx.test");
  // Cara's second step is a passkey only: her twoFactor row keeps backup
  // codes but no authenticator app.
  cara = await personWithTwoFactor("cara@qrdx.test");
  twoFactorRowOf(cara).secret = "";
  anaKey = newAuthenticator(ana.id, "Ana's laptop");
  benKey = newAuthenticator(ben.id, "Ben's laptop");
  caraKey = newAuthenticator(cara.id, "Cara's phone");
});

// ─── The tests ──────────────────────────────────────────────────────────────

describe("a passkey as the second step", () => {
  it("refuses every step without a pending challenge", async () => {
    const browser = new Browser(auth.handler);
    const methods = await browser.get(TWO_FACTOR_METHODS_PATH);
    expect(methods.status).toBe(401);
    expect(methods.json?.code).toBe("INVALID_TWO_FACTOR_COOKIE");
    const options = await passkeyOptions(browser);
    expect(options.status).toBe(401);
    expect(options.json?.code).toBe("INVALID_TWO_FACTOR_COOKIE");
    const verify = await browser.post(PASSKEY_STEP_VERIFY_PATH, {
      response: assertion(anaKey, randomBytes(32).toString("base64url")),
    });
    expect(verify.status).toBe(401);
    expect(verify.json?.code).toBe("INVALID_TWO_FACTOR_COOKIE");
    expect(await browser.session()).toBeNull();
  });

  it("tells the page which second steps the person has", async () => {
    const browser = await pendingBrowser(ana);
    const methods = await browser.get(TWO_FACTOR_METHODS_PATH);
    expect(methods.status).toBe(200);
    expect(methods.json).toEqual({
      passkey: true,
      totp: true,
      backupCodes: true,
    });
    // Asking doesn't finish or spend anything.
    expect(await browser.session()).toBeNull();
    expect(browser.has("two_factor")).toBe(true);

    const caraBrowser = await pendingBrowser(cara);
    expect((await caraBrowser.get(TWO_FACTOR_METHODS_PATH)).json).toEqual({
      passkey: true,
      totp: false,
      backupCodes: true,
    });
  });

  it("offers no passkey where passkeys can't work", async () => {
    const browser = await pendingBrowser(ana, noPasskeysAuth.handler);
    expect((await browser.get(TWO_FACTOR_METHODS_PATH)).json).toEqual({
      passkey: false,
      totp: true,
      backupCodes: true,
    });
    const options = await passkeyOptions(browser);
    expect(options.status).toBe(400);
    expect(options.json?.code).toBe("PASSKEY_STEP_UNAVAILABLE");
  });

  it("asks only for the pending person's passkeys, with user verification", async () => {
    const browser = await pendingBrowser(ana);
    const options = await passkeyOptions(browser);
    expect(options.status).toBe(200);
    expect(options.json?.userVerification).toBe("required");
    expect(options.json?.rpId).toBe(RP_ID);
    expect(options.json?.allowCredentials).toEqual([
      { id: anaKey.credentialId, type: "public-key", transports: ["internal"] },
    ]);
  });

  it("finishes the challenge like a right code", async () => {
    const browser = await pendingBrowser(ana);
    const sessions = db.session.length;
    const reply = await passkeyStep(browser, anaKey);
    expect(reply.status).toBe(200);
    expect(reply.json?.token).toEqual(expect.any(String));
    expect(reply.setCookies.some((c) => /session_token=[^;]+;/.test(c))).toBe(
      true,
    );
    expect((await browser.session())?.user.email).toBe(ana.email);
    expect(browser.has("two_factor")).toBe(false);
    expect(browser.has("trust_device")).toBe(false);
    expect(db.session).toHaveLength(sessions + 1);
    // The signature counter moved on.
    expect(
      db.passkey.find((row) => row.credentialID === anaKey.credentialId)
        ?.counter,
    ).toBe(anaKey.count);
    // The challenge works once.
    const again = await browser.post(PASSKEY_STEP_VERIFY_PATH, {
      response: assertion(anaKey, randomBytes(32).toString("base64url")),
    });
    expect(again.status).toBe(403);
    expect(again.json?.code).toBe("ALREADY_SIGNED_IN");
  });

  it("uses each WebAuthn challenge once", async () => {
    const browser = await pendingBrowser(ana);
    const options = await passkeyOptions(browser);
    const challenge = String(options.json?.challenge);
    // A newer request replaces it.
    const newer = await passkeyOptions(browser);
    expect(newer.json?.challenge).not.toBe(challenge);
    const stale = await browser.post(PASSKEY_STEP_VERIFY_PATH, {
      response: assertion(anaKey, challenge),
    });
    expect(stale.status).toBe(401);
    expect(stale.json?.code).toBe("INVALID_PASSKEY");
    // The newer one was used up by that answer.
    const replay = await browser.post(PASSKEY_STEP_VERIFY_PATH, {
      response: assertion(anaKey, String(newer.json?.challenge)),
    });
    expect(replay.status).toBe(400);
    expect(replay.json?.code).toBe("PASSKEY_CHALLENGE_NOT_FOUND");
    expect(await browser.session()).toBeNull();
    // A fresh one still works.
    expect((await passkeyStep(browser, anaKey)).status).toBe(200);
  });

  it("refuses another person's passkey", async () => {
    const browser = await pendingBrowser(ana);
    const options = await passkeyOptions(browser);
    const reply = await browser.post(PASSKEY_STEP_VERIFY_PATH, {
      response: assertion(benKey, String(options.json?.challenge)),
    });
    expect(reply.status).toBe(401);
    expect(reply.json?.code).toBe("INVALID_PASSKEY");
    expect(await browser.session()).toBeNull();
    expect(browser.has("two_factor")).toBe(true);
    // Counted against Ana, not Ben.
    expect(twoFactorRowOf(ana).failedVerificationCount).toBe(1);
    expect(twoFactorRowOf(ben).failedVerificationCount ?? 0).toBe(0);
    // Ana's own passkey still finishes it, and clears the count.
    expect((await passkeyStep(browser, anaKey)).status).toBe(200);
    expect(twoFactorRowOf(ana).failedVerificationCount).toBe(0);
  });

  it("refuses a passkey that didn't verify the person", async () => {
    const browser = await pendingBrowser(ana);
    const reply = await passkeyStep(browser, anaKey, { userVerified: false });
    expect(reply.status).toBe(401);
    expect(reply.json?.code).toBe("PASSKEY_USER_VERIFICATION_REQUIRED");
    expect(await browser.session()).toBeNull();
    expect((await passkeyStep(browser, anaKey)).status).toBe(200);
  });

  it("refuses an assertion made for another site", async () => {
    const browser = await pendingBrowser(ana);
    const options = await passkeyOptions(browser);
    const reply = await browser.post(PASSKEY_STEP_VERIFY_PATH, {
      response: assertion(anaKey, String(options.json?.challenge), {
        origin: "https://qrdx.example",
      }),
    });
    expect(reply.status).toBe(401);
    expect(reply.json?.code).toBe("INVALID_PASSKEY");
    expect(await browser.session()).toBeNull();
    unlock(ana);
  });

  it("refuses a browser that is already signed in", async () => {
    const signedIn = await pendingBrowser(ana);
    expect((await passkeyStep(signedIn, anaKey)).status).toBe(200);
    // Someone else's pending challenge, carried into that browser.
    const pending = await pendingBrowser(ben);
    const challengeCookie = [...pending.cookies].find(([name]) =>
      name.endsWith("two_factor"),
    );
    if (!challengeCookie) throw new Error("no two_factor cookie");
    signedIn.cookies.set(...challengeCookie);
    const options = await passkeyOptions(signedIn);
    expect(options.status).toBe(200);
    const reply = await signedIn.post(PASSKEY_STEP_VERIFY_PATH, {
      response: assertion(benKey, String(options.json?.challenge)),
    });
    expect(reply.status).toBe(403);
    expect(reply.json?.code).toBe("ALREADY_SIGNED_IN");
    expect((await signedIn.session())?.user.email).toBe(ana.email);
    // Ben's challenge is untouched: his own browser finishes it.
    expect((await passkeyStep(pending, benKey)).status).toBe(200);
    expect((await pending.session())?.user.email).toBe(ben.email);
  });

  it("trusts the device for the next sign-ins when asked", async () => {
    const browser = await pendingBrowser(ana);
    const reply = await passkeyStep(browser, anaKey, { trustDevice: true });
    expect(reply.status).toBe(200);
    expect(browser.has("trust_device")).toBe(true);
    await browser.post("/sign-out");
    expect(await browser.session()).toBeNull();
    const next = await emailCodeSignIn(browser, ana.email);
    expect(next.json?.twoFactorRedirect).toBeUndefined();
    expect((await browser.session())?.user.email).toBe(ana.email);
    // Another browser is still asked.
    const elsewhere = new Browser(auth.handler);
    expect(
      (await emailCodeSignIn(elsewhere, ana.email)).json?.twoFactorRedirect,
    ).toBe(true);
  });

  it(`ends the challenge after ${CHALLENGE_ATTEMPTS} failed answers, codes and passkeys together`, async () => {
    unlock(ana);
    const browser = await pendingBrowser(ana);
    for (let i = 0; i < CHALLENGE_ATTEMPTS - 1; i++) {
      const reply = await passkeyStep(browser, anaKey, { userVerified: false });
      expect(reply.status).toBe(401);
    }
    const wrong = await browser.post("/two-factor/verify-totp", {
      code: wrongCode(ana.secret),
    });
    expect(wrong.json?.code).toBe("INVALID_CODE");
    const over = await passkeyStep(browser, anaKey);
    expect(over.status).toBe(400);
    expect(over.json?.code).toBe("TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE");
    expect(browser.has("two_factor")).toBe(false);
    expect(await browser.session()).toBeNull();
  });

  it(`locks the account's second step after ${LOCKOUT_FAILURES} failures in a row`, async () => {
    // 5 failures above; 5 more in a new challenge reach the limit.
    const browser = await pendingBrowser(ana);
    for (let i = 0; i < CHALLENGE_ATTEMPTS; i++) {
      await passkeyStep(browser, anaKey, { userVerified: false });
    }
    expect(Number(twoFactorRowOf(ana).failedVerificationCount)).toBe(
      LOCKOUT_FAILURES,
    );
    const next = await pendingBrowser(ana);
    const locked = await passkeyStep(next, anaKey);
    expect(locked.status).toBe(429);
    expect(locked.json?.code).toBe("ACCOUNT_TEMPORARILY_LOCKED");
    // The same lock stops codes.
    const code = await next.post("/two-factor/verify-totp", {
      code: totp(ana.secret),
    });
    expect(code.status).toBe(429);
    expect(await next.session()).toBeNull();

    // Once the lock expires, a passkey works again and the count restarts.
    twoFactorRowOf(ana).lockedUntil = new Date(Date.now() - 1000);
    const reply = await passkeyStep(next, anaKey);
    expect(reply.status).toBe(200);
    expect(twoFactorRowOf(ana).failedVerificationCount).toBe(0);
    expect(twoFactorRowOf(ana).lockedUntil).toBeNull();
  });

  it("never takes an authenticator code from a passkey-only account", async () => {
    const browser = await pendingBrowser(cara);
    const code = await browser.post("/two-factor/verify-totp", {
      code: "123456",
    });
    expect(code.status).toBe(400);
    expect(code.json?.code).toBe("TOTP_NOT_ENABLED");
    // Nor when its row is an unconfirmed setup.
    twoFactorRowOf(cara).secret = twoFactorRowOf(ana).secret;
    twoFactorRowOf(cara).verified = false;
    const unconfirmed = await browser.post("/two-factor/verify-totp", {
      code: totp(ana.secret),
    });
    expect(unconfirmed.status).toBe(400);
    expect(unconfirmed.json?.code).toBe("TOTP_NOT_ENABLED");
    twoFactorRowOf(cara).secret = "";
    twoFactorRowOf(cara).verified = true;
    expect(await browser.session()).toBeNull();

    // A backup code or her passkey finishes it.
    const reply = await passkeyStep(browser, caraKey);
    expect(reply.status).toBe(200);
    expect((await browser.session())?.user.email).toBe(cara.email);
    const backup = await pendingBrowser(cara);
    const used = await backup.post("/two-factor/verify-backup-code", {
      code: cara.backupCodes[0],
    });
    expect(used.status).toBe(200);
  });

  it("offers no passkey to someone without one", async () => {
    const dan = await personWithTwoFactor("dan@qrdx.test");
    const browser = await pendingBrowser(dan);
    expect((await browser.get(TWO_FACTOR_METHODS_PATH)).json).toEqual({
      passkey: false,
      totp: true,
      backupCodes: true,
    });
    const options = await passkeyOptions(browser);
    expect(options.status).toBe(400);
    expect(options.json?.code).toBe("PASSKEY_STEP_UNAVAILABLE");
    // Someone else's passkey is no way in either.
    const verify = await browser.post(PASSKEY_STEP_VERIFY_PATH, {
      response: assertion(anaKey, randomBytes(32).toString("base64url")),
    });
    expect(verify.status).toBe(400);
    expect(verify.json?.code).toBe("PASSKEY_CHALLENGE_NOT_FOUND");
    expect(await browser.session()).toBeNull();
  });

  it("says when no backup codes are left", async () => {
    const eve = await personWithTwoFactor("eve@qrdx.test");
    for (const code of eve.backupCodes) {
      const browser = await pendingBrowser(eve);
      const used = await browser.post("/two-factor/verify-backup-code", {
        code,
      });
      expect(used.status).toBe(200);
    }
    const browser = await pendingBrowser(eve);
    expect((await browser.get(TWO_FACTOR_METHODS_PATH)).json).toEqual({
      passkey: false,
      totp: true,
      backupCodes: false,
    });
  });
});
