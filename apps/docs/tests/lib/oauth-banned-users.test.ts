// Banned users lose OAuth API access: lib/oauth.ts validateAccessToken and
// the token endpoint (app/api/oauth/token) refuse them. The database is a
// queue of canned query results; nothing connects to a database.
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  selects: [] as Row[][],
  updates: [] as Row[][],
  updateCalls: 0,
  inserts: 0,
}));

vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => ({ and: parts }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  isNull: (column: unknown) => ({ isNull: column }),
}));

vi.mock("@repo/database", () => {
  const table = (name: string, columns: string[]) =>
    Object.fromEntries(columns.map((column) => [column, `${name}.${column}`]));
  const select = () => {
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      limit: async () => db.selects.shift() ?? [],
    };
    return query;
  };
  return {
    database: {
      select,
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => {
              db.updateCalls += 1;
              return db.updates.shift() ?? [];
            },
          }),
        }),
      }),
      insert: () => ({
        values: async () => {
          db.inserts += 1;
        },
      }),
    },
    oauthApp: table("oauth_app", [
      "id",
      "clientId",
      "clientSecretHash",
      "isActive",
    ]),
    oauthToken: table("oauth_token", [
      "id",
      "appId",
      "userId",
      "scopes",
      "accessTokenHash",
      "refreshTokenHash",
      "accessTokenExpiresAt",
      "refreshTokenExpiresAt",
      "revokedAt",
    ]),
    oauthAuthorizationCode: table("oauth_authorization_code", [
      "code",
      "appId",
      "usedAt",
      "expiresAt",
      "redirectUri",
      "codeChallenge",
      "codeChallengeMethod",
      "userId",
      "scopes",
    ]),
    user: table("user", ["id", "banned", "banExpires"]),
  };
});

vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));

// lib/error-response → lib/shared imports the auth server.
vi.mock("@repo/auth/server", () => ({ auth: {} }));

vi.mock("bcryptjs", () => ({
  default: { compare: async () => true, hash: async () => "hash" },
}));

const { isBanActive, validateAccessToken } = await import("@/lib/oauth");
const { POST: token } = await import("@/app/api/oauth/token/route");

const NOW = new Date();
const later = new Date(NOW.getTime() + 60 * 60 * 1000);
const earlier = new Date(NOW.getTime() - 60 * 60 * 1000);

function tokenRequest(fields: Record<string, string>): NextRequest {
  return new Request("http://localhost/api/oauth/token", {
    method: "POST",
    body: new URLSearchParams(fields),
  }) as unknown as NextRequest;
}

const client = { id: "app_1", clientSecretHash: "hash" };

beforeEach(() => {
  db.selects = [];
  db.updates = [];
  db.updateCalls = 0;
  db.inserts = 0;
});

describe("isBanActive", () => {
  it("is active for permanent and unexpired bans only", () => {
    expect(isBanActive({ banned: true, banExpires: null }, NOW)).toBe(true);
    expect(isBanActive({ banned: true, banExpires: later }, NOW)).toBe(true);
    expect(isBanActive({ banned: true, banExpires: earlier }, NOW)).toBe(false);
    expect(isBanActive({ banned: false, banExpires: later }, NOW)).toBe(false);
    expect(isBanActive({ banned: null, banExpires: null }, NOW)).toBe(false);
  });
});

describe("validateAccessToken", () => {
  const record = {
    userId: "user_1",
    scopes: ["codes:read"],
    accessTokenExpiresAt: later,
  };

  it("accepts a live token of a user in good standing", async () => {
    db.selects.push([{ ...record, banned: false, banExpires: null }]);
    expect(await validateAccessToken("token")).toEqual(record);
  });

  it("rejects the token of a banned user", async () => {
    db.selects.push([{ ...record, banned: true, banExpires: null }]);
    expect(await validateAccessToken("token")).toBeNull();
  });

  it("accepts it again once a temporary ban has ended", async () => {
    db.selects.push([{ ...record, banned: true, banExpires: earlier }]);
    expect(await validateAccessToken("token")).toEqual(record);
  });
});

describe("POST /api/oauth/token", () => {
  const refresh = {
    grant_type: "refresh_token",
    client_id: "client",
    client_secret: "secret",
    refresh_token: "refresh",
  };

  it("refuses to refresh for a banned user and keeps the grant", async () => {
    db.selects.push([client], [{ banned: true, banExpires: null }]);
    const response = await token(tokenRequest(refresh));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
    expect(db.updateCalls).toBe(0);
    expect(db.inserts).toBe(0);
  });

  it("refreshes for a user in good standing", async () => {
    db.selects.push([client], [{ banned: false, banExpires: null }]);
    db.updates.push([
      {
        userId: "user_1",
        scopes: ["codes:read"],
        refreshTokenExpiresAt: later,
      },
    ]);
    const response = await token(tokenRequest(refresh));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token_type: "Bearer" });
    expect(db.inserts).toBe(1);
  });

  it("issues no tokens for a code whose user was banned", async () => {
    db.selects.push([client], [{ banned: true, banExpires: null }]);
    db.updates.push([
      {
        expiresAt: later,
        redirectUri: "https://app.example/callback",
        codeChallenge: null,
        codeChallengeMethod: null,
        userId: "user_1",
        scopes: ["codes:read"],
      },
    ]);
    const response = await token(
      tokenRequest({
        grant_type: "authorization_code",
        client_id: "client",
        client_secret: "secret",
        code: "code",
        redirect_uri: "https://app.example/callback",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
    expect(db.inserts).toBe(0);
  });
});
