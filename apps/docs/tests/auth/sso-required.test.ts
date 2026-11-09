// "Require single sign-on for <domain>" (packages/auth/ee/sso-required.ts):
// the rules on their own, then inside a real Better Auth (memory adapter)
// with the plugins in production's order: the 30-day session cap, last-used
// method, email codes, two-step verification and its challenge, passkeys
// (a software P-256 authenticator signs), an SSO callback stand-in, then
// the requirement. The stand-in sits at the plugin's own OIDC callback path
// (/sso/callback/:providerId) and signs in whoever it's told to, the way the
// real callback does once the identity provider has answered, so the
// challenge and the requirement see exactly what they see in production.
// Workspaces, connections, members and plans live in the fake database
// (tests/support/fake-db.ts), where the requirement looks them up.
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
import { checkPasskeyWithoutSignIn } from "@repo/auth/passkey-check";
import {
  coveringDomains,
  holdsOwnerRole,
  isChallengeIdentifier,
  parseSsoMarker,
  type SessionCreation,
  SSO_REQUIRED_ERROR,
  SSO_REQUIRED_METADATA_KEY,
  SSO_SESSION_MS,
  sessionCreationVerdict,
  ssoMarkerValue,
  ssoRequiredProviderId,
  ssoSessionIdentifier,
} from "@repo/auth/sso-required-rules";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";
import { fakeDb } from "../support/fake-db";

// Read when packages/auth/plan.ts loads, so before the imports.
const BUSINESS = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID =
    "test-business-monthly";
  return "test-business-monthly";
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

const { clearSsoRequirementCache, emailChangeSsoProblem, ssoRequirementGate } =
  await import("@repo/auth/sso-required");

// ─── The rules ───────────────────────────────────────────────────────────────

const PROVIDER = "sso-aaaaaaaaaaaa";
const OTHER_PROVIDER = "sso-bbbbbbbbbbbb";

function creation(overrides: Partial<SessionCreation> = {}): SessionCreation {
  return {
    ssoCallbackProviderId: null,
    completesChallenge: false,
    challengeMarker: null,
    serverSide: false,
    currentSessionMarker: null,
    ...overrides,
  };
}

describe("the rules", () => {
  it("only the required connection, or finishing its challenge, starts a session", () => {
    const verdict = (c: Partial<SessionCreation>) =>
      sessionCreationVerdict(creation(c), "u1", PROVIDER);
    expect(verdict({ ssoCallbackProviderId: PROVIDER })).toBe("sso");
    expect(verdict({ ssoCallbackProviderId: OTHER_PROVIDER })).toBe("refuse");
    expect(verdict({ ssoCallbackProviderId: "" })).toBe("refuse");
    // Email codes, Google, GitHub, a passkey sign-in: no callback, no challenge.
    expect(verdict({})).toBe("refuse");
    expect(
      verdict({
        completesChallenge: true,
        challengeMarker: { userId: "u1", providerId: PROVIDER },
      }),
    ).toBe("sso");
    // A challenge an email code started, someone else's, another connection's.
    expect(verdict({ completesChallenge: true })).toBe("refuse");
    expect(
      verdict({
        completesChallenge: true,
        challengeMarker: { userId: "u2", providerId: PROVIDER },
      }),
    ).toBe("refuse");
    expect(
      verdict({
        completesChallenge: true,
        challengeMarker: { userId: "u1", providerId: OTHER_PROVIDER },
      }),
    ).toBe("refuse");
  });

  it("the app's server-side swap of an SSO session keeps it; over HTTP never", () => {
    const marker = {
      userId: "u1",
      providerId: PROVIDER,
      expiresAt: new Date(Date.now() + 1000),
    };
    const verdict = (c: Partial<SessionCreation>) =>
      sessionCreationVerdict(creation(c), "u1", PROVIDER);
    expect(verdict({ serverSide: true, currentSessionMarker: marker })).toBe(
      "carry",
    );
    expect(verdict({ serverSide: false, currentSessionMarker: marker })).toBe(
      "refuse",
    );
    expect(verdict({ serverSide: true })).toBe("refuse");
    expect(
      verdict({
        serverSide: true,
        currentSessionMarker: { ...marker, userId: "u2" },
      }),
    ).toBe("refuse");
    expect(
      verdict({
        serverSide: true,
        currentSessionMarker: { ...marker, providerId: OTHER_PROVIDER },
      }),
    ).toBe("refuse");
  });

  it("reads the setting from workspace metadata, as a connection id", () => {
    expect(
      ssoRequiredProviderId(`{"${SSO_REQUIRED_METADATA_KEY}":"${PROVIDER}"}`),
    ).toBe(PROVIDER);
    expect(ssoRequiredProviderId({ ssoRequired: PROVIDER })).toBe(PROVIDER);
    for (const value of [
      null,
      "",
      "{",
      "[]",
      { ssoRequired: true },
      { ssoRequired: "" },
    ]) {
      expect(ssoRequiredProviderId(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("markers, owners, domains and challenge rows", () => {
    const value = ssoMarkerValue({ userId: "u1", providerId: PROVIDER });
    expect(parseSsoMarker(value)).toEqual({
      userId: "u1",
      providerId: PROVIDER,
    });
    for (const bad of [null, "", "x", "{}", '{"userId":1,"providerId":"p"}']) {
      expect(parseSsoMarker(bad)).toBeNull();
    }
    expect(holdsOwnerRole("owner")).toBe(true);
    expect(holdsOwnerRole("admin,owner")).toBe(true);
    // Matched exactly, like Better Auth: " owner" is no owner.
    for (const role of [
      "admin",
      "member",
      "co-owner",
      "",
      null,
      " owner",
      "owner ",
      "Owner",
      "admin, owner",
    ]) {
      expect(holdsOwnerRole(role), String(role)).toBe(false);
    }
    expect(coveringDomains("eu.acme.com")).toEqual(["eu.acme.com", "acme.com"]);
    expect(coveringDomains("acme.com")).toEqual(["acme.com"]);
    expect(isChallengeIdentifier("2fa-abc")).toBe(true);
    expect(isChallengeIdentifier("2fa-attempts-2fa-abc")).toBe(false);
    expect(isChallengeIdentifier("trust-device-abc")).toBe(false);
    expect(SSO_SESSION_MS).toBe(24 * 60 * 60 * 1000);
  });
});

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

const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-at-least-32-characters-long";

interface Reply {
  status: number;
  json: Record<string, unknown> | null;
  location: string | null;
}

class Browser {
  cookies = new Map<string, string>();
  constructor(
    private readonly handler: (request: Request) => Promise<Response>,
  ) {}

  cookieHeader() {
    return [...this.cookies].map(([n, v]) => `${n}=${v}`).join("; ");
  }

  async request(
    method: "GET" | "POST",
    route: string,
    body?: unknown,
  ): Promise<Reply> {
    const headers = new Headers({
      origin: ORIGIN,
      cookie: this.cookieHeader(),
    });
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await this.handler(
      new Request(`${ORIGIN}/api/auth${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
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
    };
  }

  post(route: string, body: unknown = {}) {
    return this.request("POST", route, body);
  }
  get(route: string) {
    return this.request("GET", route);
  }
  async session() {
    return (await this.get("/get-session")).json as {
      session: { id: string; expiresAt: string };
      user: { email: string };
    } | null;
  }
  headers() {
    return new Headers({ cookie: this.cookieHeader(), origin: ORIGIN });
  }
}

// ─── The auth under test ────────────────────────────────────────────────────

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

const sentCodes = new Map<string, string>();
let auth: any;
let memory: Record<string, Record<string, unknown>[]>;
/** Every update written to the session table, in order. */
const sessionWrites: Record<string, unknown>[] = [];

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { twoFactor, emailOTP, lastLoginMethod } = await import(
    `${betterAuthDir}/dist/plugins/index.mjs`
  );
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { passkey } = await import(`${passkeyDir}/dist/index.mjs`);
  const { sessionLifetime } = await import("@repo/auth/session-lifetime");
  const { createAuthEndpoint, sessionMiddleware } = await import(
    `${betterAuthDir}/dist/api/index.mjs`
  );
  const { setSessionCookie } = await import(
    `${betterAuthDir}/dist/cookies/index.mjs`
  );
  const { signInChallenge } = await import("@repo/auth/sign-in-challenge");
  const { signInMethodForPath } = await import("@repo/auth/sign-in-method");
  const rules = await import("@repo/auth/sign-in-challenge-rules");

  memory = {
    user: [],
    session: [],
    account: [],
    verification: [],
    twoFactor: [],
    passkey: [],
  };
  // Counts what reaches the database, after every hook.
  const counted = (options: unknown) => {
    const adapter = memoryAdapter(memory)(options);
    return {
      ...adapter,
      update: async (args: { model: string; update: unknown }) => {
        if (args.model === "session") {
          sessionWrites.push(args.update as Record<string, unknown>);
        }
        return adapter.update(args);
      },
    };
  };
  const twoFactorPlugin = twoFactor({
    issuer: "QRdx",
    allowPasswordless: true,
    totpOptions: { issuer: "QRdx", digits: 6, period: 30 },
    trustDeviceMaxAge: rules.TRUST_DEVICE_DAYS * 24 * 60 * 60,
  });
  // The real callback signs in whoever the identity provider vouched for;
  // here, whoever the query names.
  const ssoCallbackStandIn = {
    id: "sso-callback-stand-in",
    endpoints: {
      ssoCallback: createAuthEndpoint(
        "/sso/callback/:providerId",
        { method: "GET", query: z.object({ email: z.string() }) },
        async (ctx: any) => {
          const email = ctx.query.email.toLowerCase();
          let user = (await ctx.context.internalAdapter.findUserByEmail(email))
            ?.user;
          if (!user) {
            user = await ctx.context.internalAdapter.createUser({
              email,
              name: "",
              emailVerified: true,
            });
          }
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          await setSessionCookie(ctx, { session, user });
          throw ctx.redirect(`${ORIGIN}/dashboard`);
        },
      ),
      // The app's own server-side session swap (like turning two-step
      // verification off): a new session from the one the request holds.
      swapSession: createAuthEndpoint(
        "/test/swap-session",
        { method: "POST", use: [sessionMiddleware] },
        async (ctx: any) => {
          const current = ctx.context.session;
          const session = await ctx.context.internalAdapter.createSession(
            current.user.id,
            false,
            current.session,
          );
          await setSessionCookie(ctx, { session, user: current.user });
          await ctx.context.internalAdapter.deleteSession(
            current.session.token,
          );
          return ctx.json({ id: session.id });
        },
      ),
      // Any of Better Auth's own endpoints that read the session through its
      // middleware (not /get-session), which refreshes it on the way.
      whoAmI: createAuthEndpoint(
        "/test/who-am-i",
        { method: "GET", use: [sessionMiddleware] },
        async (ctx: any) => ctx.json({ id: ctx.context.session.session.id }),
      ),
      // Where the organization plugin updates a workspace (name, metadata).
      updateWorkspace: createAuthEndpoint(
        "/organization/update",
        {
          method: "POST",
          body: z.object({ data: z.record(z.string(), z.any()) }),
        },
        async (ctx: any) => ctx.json({ updated: Object.keys(ctx.body.data) }),
      ),
    },
  };
  auth = betterAuth({
    baseURL: ORIGIN,
    secret: SECRET,
    database: counted,
    rateLimit: { enabled: false },
    disabledPaths: [...rules.UNUSED_TWO_FACTOR_PATHS],
    plugins: [
      sessionLifetime(),
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
      passkey({ rpID: "localhost", rpName: "QRdx", origin: ORIGIN }),
      ssoCallbackStandIn,
      ssoRequirementGate(),
    ],
  });
});

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
  memory.passkey.push({
    id: `pk-${credentialId}`,
    name: "Laptop",
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
    createHash("sha256").update("localhost").digest(),
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

const ORG = "org_acme";
const OWNER_EMAIL = "owner@acme.test";

/** acme.test's verified connection, its workspace on Business, required or not. */
function seedWorkspace({
  required = true,
  verified = true,
  plan = "business" as "business" | "pro",
  requiredFor = PROVIDER,
} = {}) {
  fakeDb.reset();
  fakeDb.seed("ssoProvider", [
    {
      id: "p1",
      providerId: PROVIDER,
      organizationId: ORG,
      domain: "acme.test",
      domainVerified: verified,
      issuer: "https://idp.acme.test",
    },
  ]);
  fakeDb.seed("organization", [
    {
      id: ORG,
      name: "Acme",
      slug: "acme",
      createdAt: new Date(),
      metadata: JSON.stringify(
        required
          ? { ssoJoinRole: "member", [SSO_REQUIRED_METADATA_KEY]: requiredFor }
          : {},
      ),
    },
  ]);
  fakeDb.seed("member", [
    {
      id: "m_owner",
      organizationId: ORG,
      userId: "user_owner",
      role: "owner",
      createdAt: new Date(),
    },
  ]);
  fakeDb.seed("subscription", [
    {
      id: "sub_1",
      userId: "user_owner",
      status: "active",
      productId: plan === "business" ? BUSINESS : "pro-monthly",
    },
  ]);
  clearSsoRequirementCache();
}

/** The memory adapter's id for an address (signs it in once if needed). */
const userIdOf = (email: string) =>
  memory.user.find((u) => u.email === email)?.id as string | undefined;

/** Makes the owner's account the owner the fake database knows. */
async function makeOwner(email = OWNER_EMAIL) {
  const id = userIdOf(email);
  if (!id) throw new Error("sign the owner in first");
  const owner = fakeDb.find("member", { id: "m_owner" });
  if (owner) owner.userId = id;
  fakeDb.find("subscription", { id: "sub_1" })!.userId = id;
  clearSsoRequirementCache();
}

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

const ssoSignIn = (browser: Browser, email: string, providerId = PROVIDER) =>
  browser.get(`/sso/callback/${providerId}?email=${encodeURIComponent(email)}`);

const markerOf = (sessionId: string) =>
  memory.verification.find(
    (row) => row.identifier === ssoSessionIdentifier(sessionId),
  );

const sessionsOf = (email: string) =>
  memory.session.filter((s) => s.userId === userIdOf(email));

/** Signs in with an email code while nothing is required, then requires SSO. */
async function signedInBefore(email: string) {
  seedWorkspace({ required: false });
  const browser = new Browser(auth.handler);
  expect((await emailCodeSignIn(browser, email)).status).toBe(200);
  return browser;
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  seedWorkspace();
  sessionWrites.length = 0;
});

describe("signing in while SSO is required", () => {
  it("refuses an email code for someone at the domain, with the SSO code", async () => {
    const before = await signedInBefore("ana@acme.test");
    await before.post("/sign-out");
    seedWorkspace();
    const browser = new Browser(auth.handler);
    const reply = await emailCodeSignIn(browser, "ana@acme.test");
    expect(reply.status).toBe(403);
    expect(reply.json?.code).toBe(SSO_REQUIRED_ERROR);
    expect(await browser.session()).toBeNull();
  });

  it("refuses a first sign-in by email code, and makes no account", async () => {
    const browser = new Browser(auth.handler);
    const reply = await emailCodeSignIn(browser, "new@acme.test");
    expect(reply.json?.code).toBe(SSO_REQUIRED_ERROR);
    expect(userIdOf("new@acme.test")).toBeUndefined();
  });

  it("covers subdomains, like the connection does", async () => {
    const reply = await emailCodeSignIn(
      new Browser(auth.handler),
      "eu@eu.acme.test",
    );
    expect(reply.json?.code).toBe(SSO_REQUIRED_ERROR);
  });

  it("leaves other domains alone", async () => {
    const browser = new Browser(auth.handler);
    expect((await emailCodeSignIn(browser, "zed@other.test")).status).toBe(200);
    expect((await browser.session())?.user.email).toBe("zed@other.test");
  });

  it("lets the workspace's owners sign in another way (break-glass)", async () => {
    await signedInBefore(OWNER_EMAIL);
    seedWorkspace();
    await makeOwner();
    const browser = new Browser(auth.handler);
    expect((await emailCodeSignIn(browser, OWNER_EMAIL)).status).toBe(200);
    // And reading the session keeps it.
    expect((await browser.session())?.user.email).toBe(OWNER_EMAIL);
  });

  it("applies only on Business, to a verified connection, for the connection it names", async () => {
    for (const setup of [
      { plan: "pro" as const },
      { verified: false },
      { requiredFor: OTHER_PROVIDER },
      { required: false },
    ]) {
      seedWorkspace(setup);
      const browser = new Browser(auth.handler);
      const reply = await emailCodeSignIn(browser, "off@acme.test");
      expect(reply.status, JSON.stringify(setup)).toBe(200);
      await browser.post("/sign-out");
    }
  });

  it("doesn't count a Business plan held under an inexact ' owner' role", async () => {
    for (const role of [" owner", "owner ", "Owner", "member, owner"]) {
      seedWorkspace();
      const payer = fakeDb.find("member", { id: "m_owner" });
      if (payer) payer.role = role;
      clearSsoRequirementCache();
      const browser = new Browser(auth.handler);
      const reply = await emailCodeSignIn(browser, "payer@acme.test");
      expect(reply.status, role).toBe(200);
      await browser.post("/sign-out");
    }
  });

  it("signs in through the connection, for 24 hours at most, and marks the session", async () => {
    const browser = new Browser(auth.handler);
    const before = Date.now();
    const reply = await ssoSignIn(browser, "ben@acme.test");
    expect(reply.status).toBe(302);
    const found = await browser.session();
    expect(found?.user.email).toBe("ben@acme.test");
    const expires = new Date(found?.session.expiresAt ?? 0).getTime();
    expect(expires).toBeLessThanOrEqual(Date.now() + SSO_SESSION_MS);
    expect(expires).toBeGreaterThanOrEqual(before + SSO_SESSION_MS - 1000);
    const marker = markerOf(found?.session.id ?? "");
    expect(parseSsoMarker(marker?.value)).toEqual({
      userId: userIdOf("ben@acme.test"),
      providerId: PROVIDER,
    });
  });

  it("refuses another connection's callback", async () => {
    const browser = new Browser(auth.handler);
    const reply = await ssoSignIn(browser, "ben2@acme.test", OTHER_PROVIDER);
    expect(reply.status).toBe(403);
    expect(await browser.session()).toBeNull();
  });

  it("marks SSO sessions even when nothing is required, so turning it on keeps them", async () => {
    seedWorkspace({ required: false });
    const browser = new Browser(auth.handler);
    await ssoSignIn(browser, "cy@acme.test");
    const found = await browser.session();
    expect(markerOf(found?.session.id ?? "")).toBeDefined();
    // Not required: Better Auth's own lifetime (7 days).
    expect(new Date(found?.session.expiresAt ?? 0).getTime()).toBeGreaterThan(
      Date.now() + 6 * 24 * 60 * 60 * 1000,
    );
    // Required now: still signed in.
    seedWorkspace();
    expect((await browser.session())?.user.email).toBe("cy@acme.test");
  });
});

describe("reading the session while SSO is required", () => {
  it("ends a session that didn't come from SSO", async () => {
    const browser = await signedInBefore("dee@acme.test");
    expect(sessionsOf("dee@acme.test")).toHaveLength(1);
    seedWorkspace();
    expect(await browser.session()).toBeNull();
    // Gone from the database too, so nothing else accepts it.
    expect(sessionsOf("dee@acme.test")).toHaveLength(0);
  });

  it("ends an SSO session once its 24 hours are up", async () => {
    const browser = new Browser(auth.handler);
    await ssoSignIn(browser, "eli@acme.test");
    const found = await browser.session();
    const marker = markerOf(found?.session.id ?? "");
    expect(marker).toBeDefined();
    // 24 hours later (the marker's end), whatever the row says.
    (marker as Record<string, unknown>).expiresAt = new Date(Date.now() - 1000);
    const row = memory.session.find((s) => s.id === found?.session.id);
    (row as Record<string, unknown>).expiresAt = new Date(
      Date.now() + 5 * 86_400_000,
    );
    expect(await browser.session()).toBeNull();
    expect(sessionsOf("eli@acme.test")).toHaveLength(0);
  });

  it("never lets Better Auth's refresh carry it past the 24 hours", async () => {
    const browser = new Browser(auth.handler);
    await ssoSignIn(browser, "fay@acme.test");
    const found = await browser.session();
    const markerEnd = new Date(
      markerOf(found?.session.id ?? "")?.expiresAt as Date,
    ).getTime();
    // Due for a refresh: Better Auth would push it out by 7 days.
    const row = memory.session.find(
      (s) => s.id === found?.session.id,
    ) as Record<string, unknown>;
    row.expiresAt = new Date(Date.now() + 60_000);
    const refreshed = await browser.session();
    expect(refreshed?.user.email).toBe("fay@acme.test");
    expect(new Date(row.expiresAt as Date).getTime()).toBeLessThanOrEqual(
      markerEnd,
    );
    expect(
      new Date(refreshed?.session.expiresAt ?? 0).getTime(),
    ).toBeLessThanOrEqual(markerEnd);
  });

  it("not even when Better Auth's own endpoints refresh it", async () => {
    const browser = new Browser(auth.handler);
    await ssoSignIn(browser, "fin@acme.test");
    const found = await browser.session();
    const markerEnd = new Date(
      markerOf(found?.session.id ?? "")?.expiresAt as Date,
    ).getTime();
    const row = memory.session.find(
      (s) => s.id === found?.session.id,
    ) as Record<string, unknown>;
    row.expiresAt = new Date(Date.now() + 60_000);
    expect((await browser.get("/test/who-am-i")).status).toBe(200);
    expect(new Date(row.expiresAt as Date).getTime()).toBeLessThanOrEqual(
      markerEnd,
    );
  });

  it("not even while this server's cache hasn't seen the requirement yet", async () => {
    seedWorkspace({ required: false });
    const browser = new Browser(auth.handler);
    await ssoSignIn(browser, "fox@acme.test");
    const found = await browser.session();
    // Turned on elsewhere: the cache here still says it isn't required.
    const workspace = fakeDb.find("organization", { id: ORG });
    if (workspace) {
      workspace.metadata = JSON.stringify({
        [SSO_REQUIRED_METADATA_KEY]: PROVIDER,
      });
    }
    const markerEnd = new Date(
      markerOf(found?.session.id ?? "")?.expiresAt as Date,
    ).getTime();
    const row = memory.session.find(
      (s) => s.id === found?.session.id,
    ) as Record<string, unknown>;
    row.expiresAt = new Date(Date.now() + 60_000);
    expect((await browser.session())?.user.email).toBe("fox@acme.test");
    expect(new Date(row.expiresAt as Date).getTime()).toBeLessThanOrEqual(
      markerEnd,
    );
  });

  it("an expiry pushed out some other way is brought back on the next read", async () => {
    const browser = new Browser(auth.handler);
    await ssoSignIn(browser, "gus@acme.test");
    const found = await browser.session();
    const markerEnd = new Date(
      markerOf(found?.session.id ?? "")?.expiresAt as Date,
    ).getTime();
    const row = memory.session.find(
      (s) => s.id === found?.session.id,
    ) as Record<string, unknown>;
    row.expiresAt = new Date(Date.now() + 6 * 86_400_000);
    const read = await browser.session();
    expect(new Date(read?.session.expiresAt ?? 0).getTime()).toBe(markerEnd);
    expect(new Date(row.expiresAt as Date).getTime()).toBe(markerEnd);
  });

  it("keeps owners' sessions, whatever they signed in with", async () => {
    const browser = await signedInBefore(OWNER_EMAIL);
    seedWorkspace();
    await makeOwner();
    expect((await browser.session())?.user.email).toBe(OWNER_EMAIL);
  });
});

describe("a 24-hour session's refresh", () => {
  it("isn't written on every read, only once a day has passed since the last write", async () => {
    const browser = new Browser(auth.handler);
    await ssoSignIn(browser, "rae@acme.test");
    const found = await browser.session();
    const markerEnd = new Date(
      markerOf(found?.session.id ?? "")?.expiresAt as Date,
    ).getTime();
    const row = memory.session.find(
      (s) => s.id === found?.session.id,
    ) as Record<string, unknown>;
    const end = new Date(row.expiresAt as Date).getTime();
    expect(end).toBeLessThanOrEqual(markerEnd);
    // Better Auth wants to refresh a session this near its end on every read.
    sessionWrites.length = 0;
    for (let i = 0; i < 3; i++) {
      expect((await browser.session())?.user.email).toBe("rae@acme.test");
      expect(
        await auth.api.getSession({ headers: browser.headers() }),
      ).not.toBeNull();
      expect((await browser.get("/test/who-am-i")).status).toBe(200);
    }
    expect(sessionWrites).toEqual([]);
    expect(new Date(row.expiresAt as Date).getTime()).toBe(end);

    // A day after its last write it's written once (never past the SSO
    // end), then left alone again.
    row.updatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect((await browser.session())?.user.email).toBe("rae@acme.test");
    expect((await browser.session())?.user.email).toBe("rae@acme.test");
    expect(sessionWrites).toHaveLength(1);
    expect(new Date(row.expiresAt as Date).getTime()).toBeLessThanOrEqual(
      markerEnd,
    );
  });
});

describe('"Confirm it\'s you" with a passkey, for someone SSO is required for', () => {
  /** An SSO session with a passkey of its own, and a challenge for it. */
  async function ssoWithPasskey(email: string) {
    const browser = new Browser(auth.handler);
    await ssoSignIn(browser, email);
    expect((await browser.session())?.user.email).toBe(email);
    const key = newAuthenticator(userIdOf(email) as string);
    const options = await browser.get("/passkey/generate-authenticate-options");
    expect(options.status).toBe(200);
    return {
      browser,
      key,
      response: () => assertion(key, String(options.json?.challenge)),
    };
  }

  it("checks it server-side (the app's verifyOwnPasskey) without the sign-in rule refusing it", async () => {
    const { browser, response } = await ssoWithPasskey("ida@acme.test");
    const before = sessionsOf("ida@acme.test").length;
    const created: {
      session: { id: string };
      user: { email: string };
    } = await checkPasskeyWithoutSignIn(() =>
      auth.api.verifyPasskeyAuthentication({
        headers: browser.headers(),
        body: { response: response() },
      }),
    );
    expect(created.user.email).toBe("ida@acme.test");
    // The throwaway session: no SSO marker, and the app deletes it at once.
    expect(sessionsOf("ida@acme.test")).toHaveLength(before + 1);
    expect(markerOf(created.session.id)).toBeUndefined();
    // The person's own SSO session is untouched.
    expect((await browser.session())?.user.email).toBe("ida@acme.test");
  });

  it("refuses the same check without the mark, and a passkey sign-in over HTTP", async () => {
    const first = await ssoWithPasskey("jay@acme.test");
    await expect(
      auth.api.verifyPasskeyAuthentication({
        headers: first.browser.headers(),
        body: { response: first.response() },
      }),
    ).rejects.toMatchObject({ body: { code: SSO_REQUIRED_ERROR } });

    // "Continue with passkey" is a sign-in: refused, mark or not (the mark
    // only counts server-side).
    const signIn = new Browser(auth.handler);
    const options = await signIn.get("/passkey/generate-authenticate-options");
    const reply = await checkPasskeyWithoutSignIn(() =>
      signIn.post("/passkey/verify-authentication", {
        response: assertion(first.key, String(options.json?.challenge)),
      }),
    );
    expect(reply.status).toBe(403);
    expect(reply.json?.code).toBe(SSO_REQUIRED_ERROR);
    expect(await signIn.session()).toBeNull();
  });
});

describe("two-step verification after SSO", () => {
  async function withTwoFactor(email: string) {
    seedWorkspace({ required: false });
    const first = new Browser(auth.handler);
    await emailCodeSignIn(first, email);
    const enabled = await auth.api.enableTwoFactor({
      headers: first.headers(),
      body: {},
    });
    const secret = new URL(enabled.totpURI).searchParams.get("secret") ?? "";
    await auth.api.verifyTOTP({
      headers: first.headers(),
      body: { code: totp(secret) },
    });
    await first.post("/sign-out");
    seedWorkspace();
    return secret;
  }

  it("still asks for the second step, and the session it makes counts as SSO", async () => {
    const secret = await withTwoFactor("hal@acme.test");
    const browser = new Browser(auth.handler);
    const reply = await ssoSignIn(browser, "hal@acme.test");
    // The challenge: no session yet.
    expect(reply.location).toContain("/sign-in/two-factor");
    expect(await browser.session()).toBeNull();
    const done = await browser.post("/two-factor/verify-totp", {
      code: totp(secret),
    });
    expect(done.status).toBe(200);
    const found = await browser.session();
    expect(found?.user.email).toBe("hal@acme.test");
    expect(
      parseSsoMarker(markerOf(found?.session.id ?? "")?.value)?.providerId,
    ).toBe(PROVIDER);
    expect(
      new Date(found?.session.expiresAt ?? 0).getTime(),
    ).toBeLessThanOrEqual(Date.now() + SSO_SESSION_MS);
  });

  it("refuses to finish a challenge an email code started", async () => {
    const secret = await withTwoFactor("ivy@acme.test");
    // Started before SSO was required...
    seedWorkspace({ required: false });
    const browser = new Browser(auth.handler);
    const challenged = await emailCodeSignIn(browser, "ivy@acme.test");
    expect(challenged.json?.twoFactorRedirect).toBe(true);
    // ...finished after.
    seedWorkspace();
    const done = await browser.post("/two-factor/verify-totp", {
      code: totp(secret),
    });
    expect(done.status).toBe(403);
    expect(done.json?.code).toBe(SSO_REQUIRED_ERROR);
    expect(await browser.session()).toBeNull();
  });
});

describe("the app swapping an SSO session server-side", () => {
  it("keeps the SSO marker and its end, never a new 24 hours", async () => {
    const browser = new Browser(auth.handler);
    await ssoSignIn(browser, "jo@acme.test");
    const first = await browser.session();
    const firstEnd = new Date(
      markerOf(first?.session.id ?? "")?.expiresAt as Date,
    );
    const swapped = (await auth.api.swapSession({
      headers: browser.headers(),
    })) as { id: string };
    expect(swapped.id).not.toBe(first?.session.id);
    const marker = markerOf(swapped.id);
    expect(parseSsoMarker(marker?.value)?.providerId).toBe(PROVIDER);
    expect(new Date(marker?.expiresAt as Date).getTime()).toBe(
      firstEnd.getTime(),
    );
    const row = memory.session.find((s) => s.id === swapped.id);
    expect(new Date(row?.expiresAt as Date).getTime()).toBeLessThanOrEqual(
      firstEnd.getTime(),
    );
  });

  it("turning on an authenticator app swaps it the same way (Better Auth's verify-totp)", async () => {
    const browser = new Browser(auth.handler);
    await ssoSignIn(browser, "liv@acme.test");
    const first = await browser.session();
    const firstEnd = new Date(
      markerOf(first?.session.id ?? "")?.expiresAt as Date,
    );
    const enabled = await auth.api.enableTwoFactor({
      headers: browser.headers(),
      body: {},
    });
    const secret = new URL(enabled.totpURI).searchParams.get("secret") ?? "";
    await auth.api.verifyTOTP({
      headers: browser.headers(),
      body: { code: totp(secret) },
    });
    const sessions = sessionsOf("liv@acme.test");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).not.toBe(first?.session.id);
    const marker = markerOf(sessions[0]?.id as string);
    expect(parseSsoMarker(marker?.value)?.providerId).toBe(PROVIDER);
    expect(new Date(marker?.expiresAt as Date).getTime()).toBe(
      firstEnd.getTime(),
    );
  });

  it("refuses the same swap over HTTP, and for a session that didn't come from SSO", async () => {
    const browser = new Browser(auth.handler);
    await ssoSignIn(browser, "kit@acme.test");
    const overHttp = await browser.post("/test/swap-session");
    expect(overHttp.status).toBe(403);
    expect(overHttp.json?.code).toBe(SSO_REQUIRED_ERROR);

    const owner = await signedInBefore(OWNER_EMAIL);
    // Not bound (owner): fine.
    seedWorkspace();
    await makeOwner();
    await expect(
      auth.api.swapSession({ headers: owner.headers() }),
    ).resolves.toBeTruthy();
  });
});

describe("email changes", () => {
  it("never onto or off a domain that requires SSO, except for owners", async () => {
    await signedInBefore("lou@acme.test");
    seedWorkspace();
    const lou = userIdOf("lou@acme.test") as string;
    expect(
      await emailChangeSsoProblem(lou, "lou@acme.test", "lou@gmail.test"),
    ).toEqual({
      kind: "off",
      domain: "acme.test",
    });
    // Within the domain (a subdomain too) is fine.
    expect(
      await emailChangeSsoProblem(lou, "lou@acme.test", "lou@eu.acme.test"),
    ).toBeNull();
    expect(
      await emailChangeSsoProblem("u-x", "x@gmail.test", "x@acme.test"),
    ).toEqual({
      kind: "onto",
      domain: "acme.test",
    });
    expect(
      await emailChangeSsoProblem("u-x", "x@gmail.test", "x@other.test"),
    ).toBeNull();
    // Owners keep their other ways in, and can move.
    await signedInBefore(OWNER_EMAIL);
    seedWorkspace();
    await makeOwner();
    const owner = userIdOf(OWNER_EMAIL) as string;
    expect(
      await emailChangeSsoProblem(owner, OWNER_EMAIL, "owner@gmail.test"),
    ).toBeNull();
    // Nothing required: nothing refused.
    seedWorkspace({ required: false });
    expect(
      await emailChangeSsoProblem(lou, "lou@acme.test", "lou@gmail.test"),
    ).toBeNull();
  });
});

describe("workspace metadata", () => {
  it("can't be changed over HTTP (the setting lives there); the app's server calls can", async () => {
    const browser = new Browser(auth.handler);
    const refused = await browser.post("/organization/update", {
      data: { metadata: { [SSO_REQUIRED_METADATA_KEY]: null } },
    });
    expect(refused.status).toBe(403);
    const named = await browser.post("/organization/update", {
      data: { name: "Acme" },
    });
    expect(named.status).toBe(200);
    await expect(
      auth.api.updateWorkspace({ body: { data: { metadata: {} } } }),
    ).resolves.toEqual({ updated: ["metadata"] });
  });
});
