// GET /two-factor/continue: how a sign-in that is a cross-site POST ending in
// a redirect (the SAML ACS) honours "Don't ask again on this device". A real
// betterAuth instance (memory adapter, no database or network) with the same
// twoFactor options and challenge plugin as packages/auth/server.ts, driven
// through auth.handler like a browser. The ACS is stood in for by a small
// test-only endpoint that does what matters here: a POST that creates a
// session and answers with a redirect. A cross-site POST is sent without the
// browser's cookies (they're all SameSite=Lax), like Chrome does.
import { createHmac } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  CHALLENGE_CONTINUE_PATH,
  TWO_FACTOR_CHALLENGE_PATH,
} from "@repo/auth/sign-in-challenge-rules";
import { beforeAll, describe, expect, it } from "vitest";

const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);

const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-at-least-32-characters-long";
const ANA = "ana@acme.test";
const BEN = "ben@acme.test";
const DESTINATION = "/dashboard/acme";

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

function totp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const hash = createHmac("sha1", base32Decode(secret))
    .update(counter)
    .digest();
  const offset = hash[hash.length - 1] & 15;
  const binary = hash.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

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

  cookie(name: string) {
    return this.cookies.get(`better-auth.${name}`);
  }

  setCookie(name: string, value: string) {
    this.cookies.set(`better-auth.${name}`, value);
  }

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

  /** `crossSite`: a POST from another site carries no Lax cookies. */
  async request(
    method: "GET" | "POST",
    pathAndQuery: string,
    body?: unknown,
    { crossSite = false } = {},
  ): Promise<Reply> {
    const headers = new Headers({
      origin: crossSite ? "https://idp.example" : ORIGIN,
    });
    if (!crossSite) {
      headers.set(
        "cookie",
        [...this.cookies].map(([n, v]) => `${n}=${v}`).join("; "),
      );
    }
    if (body !== undefined) headers.set("content-type", "application/json");
    const target = pathAndQuery.startsWith("http")
      ? pathAndQuery
      : `${ORIGIN}/api/auth${pathAndQuery}`;
    const response = await this.handler(
      new Request(target, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
      }),
    );
    this.absorb(response.headers);
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

  async session() {
    const reply = await this.request("GET", "/get-session");
    return reply.json as { user: { email: string } } | null;
  }
}

let auth: any;
let db: Record<string, Record<string, unknown>[]>;
const secrets = new Map<string, string>();

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { twoFactor } = await import(`${betterAuthDir}/dist/plugins/index.mjs`);
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { createAuthEndpoint } = await import(
    `${betterAuthDir}/dist/api/index.mjs`
  );
  const { setSessionCookie } = await import(
    `${betterAuthDir}/dist/cookies/index.mjs`
  );
  const { signInChallenge } = await import("@repo/auth/sign-in-challenge");
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
  // Stands in for the SAML ACS: a POST that signs someone in and redirects.
  const acsLike = {
    id: "test-acs",
    endpoints: {
      acs: createAuthEndpoint(
        "/test/acs",
        { method: "POST" },
        async (ctx: any) => {
          const email = String(ctx.body?.email);
          const found =
            await ctx.context.internalAdapter.findUserByEmail(email);
          const user =
            found?.user ??
            (await ctx.context.internalAdapter.createUser({
              email,
              name: email,
              emailVerified: true,
            }));
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          await setSessionCookie(ctx, { session, user });
          throw ctx.redirect(`${ORIGIN}${DESTINATION}`);
        },
      ),
    },
  };
  auth = betterAuth({
    baseURL: ORIGIN,
    secret: SECRET,
    database: memoryAdapter(db),
    rateLimit: { enabled: false },
    advanced: { disableOriginCheck: true },
    plugins: [acsLike, twoFactorPlugin, signInChallenge(twoFactorPlugin)],
  });

  // Ana and Ben turn on two-step verification.
  for (const email of [ANA, BEN]) {
    const browser = new Browser(auth.handler);
    // Without 2FA nobody is challenged: the redirect goes straight through.
    const plain = await browser.request("POST", "/test/acs", { email });
    expect(plain.location).toBe(`${ORIGIN}${DESTINATION}`);
    const headers = new Headers({
      cookie: [...browser.cookies].map(([n, v]) => `${n}=${v}`).join("; "),
    });
    const enabled = await auth.api.enableTwoFactor({ headers, body: {} });
    const secret = new URL(enabled.totpURI).searchParams.get("secret") ?? "";
    await auth.api.verifyTOTP({ headers, body: { code: totp(secret) } });
    secrets.set(email, secret);
  }
});

/** The SAML-like sign-in, posted cross-site; returns the redirect. */
function acs(browser: Browser, email: string) {
  return browser.request("POST", "/test/acs", { email }, { crossSite: true });
}

/** Ends the browser's session but keeps its other cookies. */
async function signOut(browser: Browser) {
  await browser.request("POST", "/sign-out", {});
  expect(await browser.session()).toBeNull();
}

/** Finishes a challenge with a code, ticking "Don't ask again". */
async function trustThisDevice(browser: Browser, email: string) {
  const challenged = await acs(browser, email);
  expect(challenged.status).toBe(302);
  const done = await browser.request("POST", "/two-factor/verify-totp", {
    code: totp(secrets.get(email) ?? ""),
    trustDevice: true,
  });
  expect(done.status).toBe(200);
  expect(browser.cookie("trust_device")).toBeTruthy();
  await signOut(browser);
}

const verification = (identifier: string) =>
  db.verification.find((v) => v.identifier === identifier);

describe("GET /two-factor/continue", () => {
  it("sends a challenged POST sign-in through it, with the destination", async () => {
    const browser = new Browser(auth.handler);
    const reply = await acs(browser, ANA);
    expect(reply.status).toBe(302);
    const location = new URL(String(reply.location));
    expect(`${location.origin}${location.pathname}`).toBe(
      `${ORIGIN}/api/auth${CHALLENGE_CONTINUE_PATH}`,
    );
    expect(location.searchParams.get("next")).toBe(DESTINATION);
    expect(browser.cookie("two_factor")).toBeTruthy();
    expect(browser.cookie("session_token")).toBeUndefined();
  });

  it("without a pending challenge: the challenge page, no session", async () => {
    const browser = new Browser(auth.handler);
    const reply = await browser.request(
      "GET",
      `${CHALLENGE_CONTINUE_PATH}?next=${encodeURIComponent(DESTINATION)}`,
    );
    expect(reply.status).toBe(302);
    const location = new URL(String(reply.location));
    expect(location.pathname).toBe(TWO_FACTOR_CHALLENGE_PATH);
    expect(location.searchParams.get("next")).toBe(DESTINATION);
    expect(await browser.session()).toBeNull();
  });

  it("with a challenge but no trust cookie: the page, and the code still works", async () => {
    const browser = new Browser(auth.handler);
    const reply = await acs(browser, ANA);
    const next = await browser.request("GET", String(reply.location));
    const location = new URL(String(next.location));
    expect(location.pathname).toBe(TWO_FACTOR_CHALLENGE_PATH);
    expect(location.searchParams.get("next")).toBe(DESTINATION);
    expect(await browser.session()).toBeNull();
    const done = await browser.request("POST", "/two-factor/verify-totp", {
      code: totp(secrets.get(ANA) ?? ""),
    });
    expect(done.status).toBe(200);
    expect((await browser.session())?.user.email).toBe(ANA);
  });

  it("with another person's trust cookie: the page, no session, cookie dropped", async () => {
    const browser = new Browser(auth.handler);
    await trustThisDevice(browser, BEN);
    const sessionsBefore = db.session.length;
    const reply = await acs(browser, ANA);
    const next = await browser.request("GET", String(reply.location));
    expect(new URL(String(next.location)).pathname).toBe(
      TWO_FACTOR_CHALLENGE_PATH,
    );
    expect(await browser.session()).toBeNull();
    expect(db.session.length).toBe(sessionsBefore);
    expect(browser.cookie("trust_device")).toBeUndefined();
    // Ana's challenge is still pending.
    expect(browser.cookie("two_factor")).toBeTruthy();
  });

  it("with a forged trust cookie for the same identifier: the page", async () => {
    const browser = new Browser(auth.handler);
    await trustThisDevice(browser, BEN);
    const real = String(browser.cookie("trust_device"));
    // Ben's record id, signed as if it were Ana's, without the secret.
    const [, identifier] = decodeURIComponent(real).split(".")[0].split("!");
    browser.setCookie("trust_device", `forged!${identifier}.bad`);
    const reply = await acs(browser, ANA);
    const next = await browser.request("GET", String(reply.location));
    expect(new URL(String(next.location)).pathname).toBe(
      TWO_FACTOR_CHALLENGE_PATH,
    );
    expect(await browser.session()).toBeNull();
  });

  it("on a trusted device: signed in, trust rotated, challenge used up", async () => {
    const browser = new Browser(auth.handler);
    await trustThisDevice(browser, ANA);
    const oldTrust = String(browser.cookie("trust_device"));
    const oldIdentifier = decodeURIComponent(oldTrust)
      .split(".")[0]
      .split("!")[1];
    expect(verification(oldIdentifier)).toBeTruthy();

    const reply = await acs(browser, ANA);
    const challengeCookie = String(browser.cookie("two_factor"));
    const challengeId = decodeURIComponent(challengeCookie).split(".")[0];
    expect(verification(challengeId)).toBeTruthy();

    const next = await browser.request("GET", String(reply.location));
    expect(next.status).toBe(302);
    expect(next.location).toBe(`${ORIGIN}${DESTINATION}`);
    expect((await browser.session())?.user.email).toBe(ANA);
    expect(browser.cookie("two_factor")).toBeUndefined();
    // Rotated: a new cookie and record, the old record gone.
    const newTrust = String(browser.cookie("trust_device"));
    expect(newTrust).not.toBe(oldTrust);
    const newIdentifier = decodeURIComponent(newTrust)
      .split(".")[0]
      .split("!")[1];
    expect(verification(oldIdentifier)).toBeUndefined();
    expect(verification(newIdentifier)?.value).toBe(
      db.user.find((u) => u.email === ANA)?.id,
    );
    // The challenge was consumed.
    expect(verification(challengeId)).toBeUndefined();

    // Replaying the same challenge cookie (with the new trust cookie) fails.
    await signOut(browser);
    browser.setCookie("two_factor", challengeCookie);
    const replay = await browser.request("GET", String(reply.location));
    expect(new URL(String(replay.location)).pathname).toBe(
      TWO_FACTOR_CHALLENGE_PATH,
    );
    expect(await browser.session()).toBeNull();

    // And the rotated cookie keeps working for the next sign-in.
    const again = await acs(browser, ANA);
    const landed = await browser.request("GET", String(again.location));
    expect(landed.location).toBe(`${ORIGIN}${DESTINATION}`);
    expect((await browser.session())?.user.email).toBe(ANA);
  });

  it("with an expired trust record: the page", async () => {
    const browser = new Browser(auth.handler);
    await trustThisDevice(browser, ANA);
    const identifier = decodeURIComponent(
      String(browser.cookie("trust_device")),
    )
      .split(".")[0]
      .split("!")[1];
    const record = verification(identifier);
    expect(record).toBeTruthy();
    if (record) record.expiresAt = new Date(Date.now() - 1000);
    const reply = await acs(browser, ANA);
    const next = await browser.request("GET", String(reply.location));
    expect(new URL(String(next.location)).pathname).toBe(
      TWO_FACTOR_CHALLENGE_PATH,
    );
    expect(await browser.session()).toBeNull();
  });

  it("only returns to a path on this site", async () => {
    for (const [next, expected] of [
      ["//evil.example/x", `${ORIGIN}/dashboard`],
      ["https://evil.example/x", `${ORIGIN}/dashboard`],
      ["/\\evil.example", `${ORIGIN}/dashboard`],
      ["/settings/account?tab=1", `${ORIGIN}/settings/account?tab=1`],
    ] as const) {
      const browser = new Browser(auth.handler);
      await trustThisDevice(browser, ANA);
      await acs(browser, ANA);
      const reply = await browser.request(
        "GET",
        `${CHALLENGE_CONTINUE_PATH}?next=${encodeURIComponent(next)}`,
      );
      expect(reply.location, next).toBe(expected);
    }
  });

  it("refuses POST", async () => {
    const browser = new Browser(auth.handler);
    const reply = await browser.request("POST", CHALLENGE_CONTINUE_PATH, {});
    expect(reply.status).toBe(404);
  });
});
