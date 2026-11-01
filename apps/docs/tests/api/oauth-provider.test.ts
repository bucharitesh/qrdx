// The QRdx OAuth 2.0 provider as content/docs/developers/rest-api.mdx
// describes it, driven through the real route handlers (authorize, token,
// revoke, userinfo, app-info, GET /v1/me) and Settings → Authorized apps.
// Tables live in memory (tests/support/fake-db.ts), so the handlers' own
// queries decide every outcome. Nothing connects to a database.
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const auth = vi.hoisted(() => ({
  userId: null as string | null,
  rateLimited: false,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        auth.userId
          ? {
              user: { id: auth.userId },
              session: { activeOrganizationId: null },
            }
          : null,
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: !auth.rateLimited,
      limit: 30,
      remaining: auth.rateLimited ? 0 : 29,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));

const authorize = await import("@/app/api/oauth/authorize/route");
const token = await import("@/app/api/oauth/token/route");
const revoke = await import("@/app/api/oauth/revoke/route");
const userinfo = await import("@/app/api/oauth/userinfo/route");
const appInfo = await import("@/app/api/oauth/app-info/route");
const me = await import("@/app/api/v1/me/route");
const { listAuthorizedApps, revokeAuthorizedApp } = await import(
  "@/lib/oauth-apps/authorized"
);

const ORIGIN = "http://localhost:3000";
const REDIRECT = "https://menusync.example/callback";
const SECRET = "qrdx_secret_menusync";
const OTHER_SECRET = "qrdx_secret_other";
// RFC 7636 appendix B
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// bcrypt at cost 4 keeps the suite fast; compare() reads the cost from the hash.
const secretHash = bcrypt.hashSync(SECRET, 4);
const otherSecretHash = bcrypt.hashSync(OTHER_SECRET, 4);

function seed() {
  fakeDb.reset();
  fakeDb.seed("user", [
    {
      id: "u_alice",
      name: "Alice",
      email: "alice@example.com",
      image: "https://example.com/alice.png",
      banned: false,
      banExpires: null,
    },
    {
      id: "u_dev",
      name: "Dana Developer",
      email: "dana@example.com",
      image: null,
      banned: false,
      banExpires: null,
    },
  ]);
  fakeDb.seed("oauthApp", [
    {
      id: "app_menu",
      name: "Menu Sync",
      description: "Keeps menus in sync",
      clientId: "client_menu",
      clientSecretHash: secretHash,
      redirectUris: [REDIRECT],
      scopes: ["profile:read", "codes:read", "codes:write"],
      isActive: true,
      ownerUserId: "u_dev",
      organizationId: null,
      logoUrl: null,
      websiteUrl: "https://menusync.example",
      verified: false,
      pkceRequired: false,
    },
    {
      id: "app_other",
      name: "Other App",
      description: null,
      clientId: "client_other",
      clientSecretHash: otherSecretHash,
      redirectUris: ["https://other.example/cb"],
      scopes: ["profile:read"],
      isActive: true,
      ownerUserId: "u_dev",
      organizationId: null,
      logoUrl: null,
      websiteUrl: null,
      verified: false,
      pkceRequired: true,
    },
  ]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  auth.userId = null;
  auth.rateLimited = false;
  seed();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Request helpers ────────────────────────────────────────────────────────

interface AuthorizeQuery {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  prompt?: string;
}

const baseQuery = (overrides: AuthorizeQuery = {}): AuthorizeQuery => ({
  client_id: "client_menu",
  redirect_uri: REDIRECT,
  response_type: "code",
  scope: "profile:read codes:read",
  state: "xyz-state",
  code_challenge: CHALLENGE,
  code_challenge_method: "S256",
  ...overrides,
});

function getAuthorize(query: AuthorizeQuery) {
  const url = new URL("/api/oauth/authorize", ORIGIN);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return authorize.GET(new NextRequest(url));
}

function postAuthorize(
  fields: Record<string, string | undefined>,
  headers: Record<string, string> = { origin: ORIGIN },
) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) body.set(key, value);
  }
  return authorize.POST(
    new NextRequest(new URL("/api/oauth/authorize", ORIGIN), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body,
    }),
  );
}

function postToken(fields: Record<string, string | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) body.set(key, value);
  }
  return token.POST(
    new NextRequest(new URL("/api/oauth/token", ORIGIN), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
}

function postRevoke(value: string) {
  return revoke.POST(
    new NextRequest(new URL("/api/oauth/revoke", ORIGIN), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: value }),
    }),
  );
}

function bearer(path: string, accessToken?: string) {
  return new NextRequest(new URL(path, ORIGIN), {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });
}

/** Signs Alice in and approves the consent screen; returns the redirect URL. */
async function approve(query: AuthorizeQuery = baseQuery()): Promise<URL> {
  auth.userId = "u_alice";
  const response = await postAuthorize({
    ...(query as Record<string, string>),
    decision: "allow",
  });
  expect(response.status).toBe(303);
  return new URL(response.headers.get("location") as string);
}

async function codeFor(query: AuthorizeQuery = baseQuery()): Promise<string> {
  const code = (await approve(query)).searchParams.get("code");
  expect(code).toBeTruthy();
  return code as string;
}

async function exchange(
  code: string,
  overrides: Record<string, string | undefined> = {},
) {
  return postToken({
    grant_type: "authorization_code",
    client_id: "client_menu",
    client_secret: SECRET,
    code,
    redirect_uri: REDIRECT,
    code_verifier: VERIFIER,
    ...overrides,
  });
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

async function tokensFor(query?: AuthorizeQuery): Promise<Tokens> {
  const response = await exchange(await codeFor(query));
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body as Tokens;
}

function refresh(
  refreshToken: string,
  client = { id: "client_menu", secret: SECRET },
) {
  return postToken({
    grant_type: "refresh_token",
    client_id: client.id,
    client_secret: client.secret,
    refresh_token: refreshToken,
  });
}

const errorOf = async (response: Response) =>
  ((await response.json()) as { error: string }).error;

// ─── Authorization endpoint ─────────────────────────────────────────────────

describe("GET /api/oauth/authorize", () => {
  it("sends a signed-out visitor to the consent page with the request intact", async () => {
    const response = await getAuthorize(baseQuery());
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") as string);
    expect(location.origin + location.pathname).toBe(
      `${ORIGIN}/oauth/authorize`,
    );
    expect(Object.fromEntries(location.searchParams)).toEqual({
      client_id: "client_menu",
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: "profile:read codes:read",
      state: "xyz-state",
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    });
  });

  it("never redirects to an unregistered redirect_uri", async () => {
    for (const redirect of [
      "https://evil.example/callback",
      `${REDIRECT}/extra`,
      `${REDIRECT}?next=https://evil.example`,
      REDIRECT.replace("https", "http"),
    ]) {
      const response = await getAuthorize(
        baseQuery({ redirect_uri: redirect }),
      );
      expect(response.status, redirect).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(await errorOf(response)).toBe("invalid_request");
    }
  });

  it("rejects unknown and deactivated clients", async () => {
    expect(
      await errorOf(await getAuthorize(baseQuery({ client_id: "nope" }))),
    ).toBe("invalid_client");
    const app = fakeDb.find("oauthApp", { id: "app_menu" });
    if (app) app.isActive = false;
    expect(await errorOf(await getAuthorize(baseQuery()))).toBe(
      "invalid_client",
    );
  });

  it("only grants scopes the app registered", async () => {
    const response = await getAuthorize(
      baseQuery({ scope: "profile:read themes:read" }),
    );
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe("invalid_scope");
    expect(
      await errorOf(await getAuthorize(baseQuery({ scope: "admin" }))),
    ).toBe("invalid_scope");
  });

  it("accepts comma-separated scopes", async () => {
    const response = await getAuthorize(
      baseQuery({ scope: "profile:read,codes:read" }),
    );
    expect(response.status).toBe(302);
  });

  it("supports only response_type=code", async () => {
    expect(
      await errorOf(await getAuthorize(baseQuery({ response_type: "token" }))),
    ).toBe("unsupported_response_type");
  });

  it("requires every mandatory parameter", async () => {
    for (const key of ["client_id", "redirect_uri", "response_type", "scope"]) {
      const response = await getAuthorize(baseQuery({ [key]: undefined }));
      expect(response.status, key).toBe(400);
      expect(await errorOf(response)).toBe("invalid_request");
    }
  });

  it("enforces Require PKCE with S256", async () => {
    const pkceApp = {
      client_id: "client_other",
      redirect_uri: "https://other.example/cb",
      scope: "profile:read",
    };
    expect(
      await errorOf(
        await getAuthorize(
          baseQuery({ ...pkceApp, code_challenge: undefined }),
        ),
      ),
    ).toBe("invalid_request");
    expect(
      await errorOf(
        await getAuthorize(
          baseQuery({
            ...pkceApp,
            code_challenge: VERIFIER,
            code_challenge_method: "plain",
          }),
        ),
      ),
    ).toBe("invalid_request");
    expect((await getAuthorize(baseQuery(pkceApp))).status).toBe(302);
  });

  it("rejects malformed PKCE challenges and unknown methods", async () => {
    expect(
      await errorOf(await getAuthorize(baseQuery({ code_challenge: "short" }))),
    ).toBe("invalid_request");
    expect(
      await errorOf(
        await getAuthorize(baseQuery({ code_challenge_method: "S512" })),
      ),
    ).toBe("invalid_request");
  });

  it("skips the consent screen only for scopes already granted", async () => {
    await tokensFor();
    // Same scopes again: straight back to the app with a code.
    const again = await getAuthorize(baseQuery());
    const location = new URL(again.headers.get("location") as string);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get("code")).toBeTruthy();
    expect(location.searchParams.get("state")).toBe("xyz-state");

    // A subset is covered by the grant too.
    const subset = await getAuthorize(baseQuery({ scope: "codes:read" }));
    expect(subset.headers.get("location")).toContain(REDIRECT);

    // More scopes than granted: ask again.
    const more = await getAuthorize(
      baseQuery({ scope: "profile:read codes:read codes:write" }),
    );
    expect(more.headers.get("location")).toContain("/oauth/authorize?");

    // prompt=consent always asks.
    const forced = await getAuthorize(baseQuery({ prompt: "consent" }));
    expect(forced.headers.get("location")).toContain("/oauth/authorize?");
  });
});

describe("POST /api/oauth/authorize (the consent screen)", () => {
  it("refuses approvals that don't come from the QRdx consent page", async () => {
    auth.userId = "u_alice";
    const fields = {
      ...(baseQuery() as Record<string, string>),
      decision: "allow",
    };
    const crossSite = await postAuthorize(fields, {
      origin: "https://evil.example",
    });
    expect(crossSite.status).toBe(403);
    expect(crossSite.headers.get("location")).toBeNull();
    // No Origin and no same-origin fetch metadata either.
    expect((await postAuthorize(fields, {})).status).toBe(403);
    // Fetch metadata alone is enough when the Origin header is absent.
    expect(
      (await postAuthorize(fields, { "sec-fetch-site": "same-origin" })).status,
    ).toBe(303);
  });

  it("sends the app access_denied, with its state, when the user cancels", async () => {
    auth.userId = "u_alice";
    const response = await postAuthorize({
      ...(baseQuery() as Record<string, string>),
      decision: "deny",
    });
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") as string);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("xyz-state");
    expect(location.searchParams.get("code")).toBeNull();
  });

  it("sends a user who signed out in another tab back to sign in", async () => {
    const response = await postAuthorize({
      ...(baseQuery() as Record<string, string>),
      decision: "allow",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/oauth/authorize?");
  });

  it("re-validates the request: a tampered redirect_uri gets no code", async () => {
    auth.userId = "u_alice";
    const response = await postAuthorize({
      ...(baseQuery({ redirect_uri: "https://evil.example/cb" }) as Record<
        string,
        string
      >),
      decision: "allow",
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it("returns a code and the state, keeping the redirect URI's own query", async () => {
    const app = fakeDb.find("oauthApp", { id: "app_menu" });
    if (app) app.redirectUris = [`${REDIRECT}?tenant=42`];
    const location = await approve(
      baseQuery({ redirect_uri: `${REDIRECT}?tenant=42` }),
    );
    expect(location.searchParams.get("tenant")).toBe("42");
    expect(location.searchParams.get("code")).toMatch(/^[\w-]{40,}$/);
    expect(location.searchParams.get("state")).toBe("xyz-state");
  });

  it("stores only a hash of the code", async () => {
    const code = await codeFor();
    const stored = fakeDb.rows("oauthAuthorizationCode");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.code).not.toBe(code);
    expect(stored[0]?.code).toBe(
      createHash("sha256").update(code).digest("hex"),
    );
  });
});

// ─── Token endpoint ─────────────────────────────────────────────────────────

describe("POST /api/oauth/token (authorization_code)", () => {
  it("exchanges a code for an uncacheable Bearer token pair", async () => {
    const response = await exchange(await codeFor());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    const body = (await response.json()) as Tokens;
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(3600);
    expect(body.scope).toBe("profile:read codes:read");
    expect(body.access_token).not.toBe(body.refresh_token);
    // Tokens are stored hashed, never in plain text.
    const row = fakeDb.rows("oauthToken")[0];
    expect(JSON.stringify(row)).not.toContain(body.access_token);
    expect(JSON.stringify(row)).not.toContain(body.refresh_token);
  });

  it("issues scopes in canonical order without duplicates", async () => {
    const body = await tokensFor(
      baseQuery({ scope: "codes:read profile:read codes:read" }),
    );
    expect(body.scope).toBe("profile:read codes:read");
  });

  it("accepts a code only once", async () => {
    const code = await codeFor();
    expect((await exchange(code)).status).toBe(200);
    const replay = await exchange(code);
    expect(replay.status).toBe(400);
    expect(await errorOf(replay)).toBe("invalid_grant");
  });

  it("expires codes after 10 minutes", async () => {
    const code = await codeFor();
    vi.setSystemTime(Date.now() + 10 * MINUTE + 1000);
    expect(await errorOf(await exchange(code))).toBe("invalid_grant");
  });

  it("still accepts a code just inside its 10 minutes", async () => {
    const code = await codeFor();
    vi.setSystemTime(Date.now() + 9 * MINUTE);
    expect((await exchange(code)).status).toBe(200);
  });

  it("authenticates the client", async () => {
    const code = await codeFor();
    const wrongSecret = await exchange(code, { client_secret: "guess" });
    expect(wrongSecret.status).toBe(401);
    expect(await errorOf(wrongSecret)).toBe("invalid_client");
    const unknown = await exchange(code, { client_id: "nope" });
    expect(unknown.status).toBe(401);
  });

  it("binds the code to the app it was issued to", async () => {
    const code = await codeFor();
    const response = await exchange(code, {
      client_id: "client_other",
      client_secret: OTHER_SECRET,
    });
    expect(await errorOf(response)).toBe("invalid_grant");
    // The rightful app can still redeem it.
    expect((await exchange(code)).status).toBe(200);
  });

  it("requires the exact redirect_uri used to get the code", async () => {
    const response = await exchange(await codeFor(), {
      redirect_uri: `${REDIRECT}/other`,
    });
    expect(await errorOf(response)).toBe("invalid_grant");
  });

  it("verifies PKCE", async () => {
    expect(
      await errorOf(
        await exchange(await codeFor(), { code_verifier: undefined }),
      ),
    ).toBe("invalid_request");
    expect(
      await errorOf(
        await exchange(await codeFor(), { code_verifier: "x".repeat(43) }),
      ),
    ).toBe("invalid_grant");
  });

  it("refuses a code_verifier for a code issued without a challenge (downgrade)", async () => {
    const code = await codeFor(
      baseQuery({
        code_challenge: undefined,
        code_challenge_method: undefined,
      }),
    );
    expect(await errorOf(await exchange(code))).toBe("invalid_grant");
  });

  it("works without PKCE for apps that don't require it", async () => {
    const code = await codeFor(
      baseQuery({
        code_challenge: undefined,
        code_challenge_method: undefined,
      }),
    );
    expect((await exchange(code, { code_verifier: undefined })).status).toBe(
      200,
    );
  });

  it("explains missing parameters, bad bodies and unknown grants", async () => {
    expect(
      await errorOf(await postToken({ grant_type: "authorization_code" })),
    ).toBe("invalid_request");
    expect(await errorOf(await postToken({ grant_type: "password" }))).toBe(
      "unsupported_grant_type",
    );
    const json = await token.POST(
      new NextRequest(new URL("/api/oauth/token", ORIGIN), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: "authorization_code" }),
      }),
    );
    expect(json.status).toBe(400);
    expect(await errorOf(json)).toBe("invalid_request");
  });

  it("rate limits with 429 temporarily_unavailable", async () => {
    auth.rateLimited = true;
    const response = await postToken({ grant_type: "refresh_token" });
    expect(response.status).toBe(429);
    expect(await errorOf(response)).toBe("temporarily_unavailable");
  });

  it("issues no tokens for a suspended account", async () => {
    const code = await codeFor();
    const alice = fakeDb.find("user", { id: "u_alice" });
    if (alice) alice.banned = true;
    expect(await errorOf(await exchange(code))).toBe("invalid_grant");
    expect(fakeDb.rows("oauthToken")).toHaveLength(0);
  });
});

describe("POST /api/oauth/token (refresh_token)", () => {
  it("rotates: new tokens, and the old refresh token stops working", async () => {
    const first = await tokensFor();
    const response = await refresh(first.refresh_token);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const second = (await response.json()) as Tokens;
    expect(second.access_token).not.toBe(first.access_token);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(second.scope).toBe(first.scope);

    expect(await errorOf(await refresh(first.refresh_token))).toBe(
      "invalid_grant",
    );
    expect(
      (await me.GET(bearer("/api/v1/me", second.access_token))).status,
    ).toBe(200);
  });

  it("lasts 30 days", async () => {
    const tokens = await tokensFor();
    vi.setSystemTime(Date.now() + 29 * DAY);
    const stillValid = await refresh(tokens.refresh_token);
    expect(stillValid.status).toBe(200);
    const next = (await stillValid.json()) as Tokens;
    vi.setSystemTime(Date.now() + 30 * DAY + MINUTE);
    expect(await errorOf(await refresh(next.refresh_token))).toBe(
      "invalid_grant",
    );
  });

  it("only works for the app it was issued to", async () => {
    const tokens = await tokensFor();
    const response = await refresh(tokens.refresh_token, {
      id: "client_other",
      secret: OTHER_SECRET,
    });
    expect(await errorOf(response)).toBe("invalid_grant");
    // A failed attempt by another app doesn't burn the token.
    expect((await refresh(tokens.refresh_token)).status).toBe(200);
  });

  it("authenticates the client and rejects unknown tokens", async () => {
    const tokens = await tokensFor();
    expect(
      (
        await refresh(tokens.refresh_token, {
          id: "client_menu",
          secret: "wrong",
        })
      ).status,
    ).toBe(401);
    expect(await errorOf(await refresh("not-a-token"))).toBe("invalid_grant");
    // An access token is not a refresh token.
    expect(await errorOf(await refresh(tokens.access_token))).toBe(
      "invalid_grant",
    );
  });
});

// ─── Using and revoking tokens ──────────────────────────────────────────────

describe("access tokens", () => {
  it("GET /v1/me returns the profile for profile:read", async () => {
    const tokens = await tokensFor();
    const response = await me.GET(bearer("/api/v1/me", tokens.access_token));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        id: "u_alice",
        name: "Alice",
        email: "alice@example.com",
        image: "https://example.com/alice.png",
      },
    });
  });

  it("GET /api/oauth/userinfo returns sub, name, email and picture", async () => {
    const tokens = await tokensFor();
    const response = await userinfo.GET(
      bearer("/api/oauth/userinfo", tokens.access_token),
    );
    expect(await response.json()).toEqual({
      sub: "u_alice",
      name: "Alice",
      email: "alice@example.com",
      picture: "https://example.com/alice.png",
    });
  });

  it("is refused without profile:read (403 insufficient_scope)", async () => {
    const tokens = await tokensFor(baseQuery({ scope: "codes:read" }));
    for (const response of [
      await me.GET(bearer("/api/v1/me", tokens.access_token)),
      await userinfo.GET(bearer("/api/oauth/userinfo", tokens.access_token)),
    ]) {
      expect(response.status).toBe(403);
      expect(await errorOf(response)).toBe("insufficient_scope");
    }
  });

  it("is refused when missing, malformed or unknown (401 invalid_token)", async () => {
    const missing = await me.GET(bearer("/api/v1/me"));
    expect(missing.status).toBe(401);
    expect(await errorOf(missing)).toBe("invalid_token");
    const basic = await me.GET(
      new NextRequest(new URL("/api/v1/me", ORIGIN), {
        headers: { authorization: "Basic abc" },
      }),
    );
    expect(basic.status).toBe(401);
    expect((await me.GET(bearer("/api/v1/me", "made-up"))).status).toBe(401);
  });

  it("lasts one hour", async () => {
    const tokens = await tokensFor();
    vi.setSystemTime(Date.now() + 59 * MINUTE);
    expect(
      (await me.GET(bearer("/api/v1/me", tokens.access_token))).status,
    ).toBe(200);
    vi.setSystemTime(Date.now() + 2 * MINUTE);
    const expired = await me.GET(bearer("/api/v1/me", tokens.access_token));
    expect(expired.status).toBe(401);
    expect(await errorOf(expired)).toBe("invalid_token");
  });

  it("stops working when the app is deactivated", async () => {
    const tokens = await tokensFor();
    const app = fakeDb.find("oauthApp", { id: "app_menu" });
    if (app) app.isActive = false;
    expect(
      (await me.GET(bearer("/api/v1/me", tokens.access_token))).status,
    ).toBe(401);
  });

  it("stops working while the account is suspended", async () => {
    const tokens = await tokensFor();
    const alice = fakeDb.find("user", { id: "u_alice" });
    if (alice) {
      alice.banned = true;
      alice.banExpires = new Date(Date.now() + DAY);
    }
    expect(
      (await me.GET(bearer("/api/v1/me", tokens.access_token))).status,
    ).toBe(401);
    expect(await errorOf(await refresh(tokens.refresh_token))).toBe(
      "invalid_grant",
    );
  });
});

describe("POST /api/oauth/revoke", () => {
  it("revoking the access token ends the grant (API and refresh)", async () => {
    const tokens = await tokensFor();
    expect((await postRevoke(tokens.access_token)).status).toBe(200);
    const response = await me.GET(bearer("/api/v1/me", tokens.access_token));
    expect(response.status).toBe(401);
    expect(await errorOf(response)).toBe("invalid_token");
    expect(await errorOf(await refresh(tokens.refresh_token))).toBe(
      "invalid_grant",
    );
  });

  it("revoking the refresh token ends the grant too", async () => {
    const tokens = await tokensFor();
    expect((await postRevoke(tokens.refresh_token)).status).toBe(200);
    expect(
      (await me.GET(bearer("/api/v1/me", tokens.access_token))).status,
    ).toBe(401);
  });

  it("answers 200 for unknown tokens (RFC 7009) and 400 without one", async () => {
    expect((await postRevoke("never-issued")).status).toBe(200);
    const empty = await revoke.POST(
      new NextRequest(new URL("/api/oauth/revoke", ORIGIN), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(),
      }),
    );
    expect(empty.status).toBe(400);
    expect(await errorOf(empty)).toBe("invalid_request");
  });

  it("revoking one grant leaves the user's other grants alone", async () => {
    const first = await tokensFor();
    const second = await tokensFor();
    await postRevoke(first.access_token);
    expect(
      (await me.GET(bearer("/api/v1/me", second.access_token))).status,
    ).toBe(200);
  });
});

describe("Settings → Authorized apps", () => {
  it("lists an app once per account, with its granted scopes and builder", async () => {
    await tokensFor();
    await tokensFor(baseQuery({ scope: "codes:write" }));
    const apps = await listAuthorizedApps("u_alice");
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({
      id: "app_menu",
      name: "Menu Sync",
      builtBy: "Dana Developer",
      firstParty: false,
      paused: false,
    });
    // Everything granted across both authorizations, in consent-screen order.
    expect(apps[0]?.scopes).toEqual([
      "profile:read",
      "codes:read",
      "codes:write",
    ]);
    expect(await listAuthorizedApps("u_dev")).toEqual([]);
  });

  it("revoking an app kills its tokens and unexchanged codes, and asks for consent again", async () => {
    const tokens = await tokensFor();
    const second = await tokensFor();
    const pendingCode = await codeFor();
    auth.userId = "u_alice";

    expect(await revokeAuthorizedApp("u_alice", "app_menu")).toBe(2);
    expect(
      (await me.GET(bearer("/api/v1/me", second.access_token))).status,
    ).toBe(401);

    const api = await me.GET(bearer("/api/v1/me", tokens.access_token));
    expect(api.status).toBe(401);
    expect(await errorOf(api)).toBe("invalid_token");
    expect(await errorOf(await refresh(tokens.refresh_token))).toBe(
      "invalid_grant",
    );
    expect(await errorOf(await exchange(pendingCode))).toBe("invalid_grant");
    expect(await listAuthorizedApps("u_alice")).toEqual([]);

    const again = await getAuthorize(baseQuery());
    expect(again.headers.get("location")).toContain("/oauth/authorize?");
  });

  it("revoking only touches the given user's grant", async () => {
    const alice = await tokensFor();
    expect(await revokeAuthorizedApp("u_dev", "app_menu")).toBe(0);
    expect(
      (await me.GET(bearer("/api/v1/me", alice.access_token))).status,
    ).toBe(200);
  });
});

describe("GET /api/oauth/app-info", () => {
  it("shows the consent screen's public details only", async () => {
    const response = await appInfo.GET(
      new NextRequest(
        new URL("/api/oauth/app-info?client_id=client_menu", ORIGIN),
      ),
    );
    const body = await response.json();
    expect(body).toEqual({
      name: "Menu Sync",
      description: "Keeps menus in sync",
      logo_url: null,
      website_url: "https://menusync.example",
      verified: false,
      built_by: "Dana Developer",
    });
    expect(JSON.stringify(body)).not.toContain(secretHash);
  });

  it("knows no inactive or unknown apps", async () => {
    const app = fakeDb.find("oauthApp", { id: "app_menu" });
    if (app) app.isActive = false;
    const inactive = await appInfo.GET(
      new NextRequest(
        new URL("/api/oauth/app-info?client_id=client_menu", ORIGIN),
      ),
    );
    expect(await errorOf(inactive)).toBe("invalid_client");
    const missing = await appInfo.GET(
      new NextRequest(new URL("/api/oauth/app-info", ORIGIN)),
    );
    expect(await errorOf(missing)).toBe("invalid_request");
  });
});
