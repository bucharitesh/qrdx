import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// token-refresh reads and writes the integration row; keep it in memory.
const db = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@repo/database", () => ({
  integration: { id: "integration.id" },
  database: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(db.row ? [db.row] : []),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          db.updates.push(values);
          return Promise.resolve();
        },
      }),
    }),
  },
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}), and: () => ({}) }));

const { decryptApiKey, encryptApiKey } = await import("../src/core/encryption");
const { createOAuthHandler } = await import("../src/core/oauth");
const { refreshIntegrationToken } = await import("../src/core/token-refresh");
const { getIntegrationConfigWithEnv, registerAllIntegrations } = await import(
  "../src/registry/loader"
);

const ENV = {
  BITLY_CLIENT_ID: "bitly-id",
  BITLY_CLIENT_SECRET: "bitly-secret",
  DROPBOX_CLIENT_ID: "dbx-id",
  DROPBOX_CLIENT_SECRET: "dbx-secret",
  MICROSOFT_CLIENT_ID: "ms-id",
  MICROSOFT_CLIENT_SECRET: "ms-secret",
  BOX_CLIENT_ID: "box-id",
  BOX_CLIENT_SECRET: "box-secret",
  NOTION_CLIENT_ID: "ntn-id",
  NOTION_CLIENT_SECRET: "ntn-secret",
};
const getConfig = (slug: string) => getIntegrationConfigWithEnv(slug, ENV);

import { json, mockFetch } from "./helpers";

beforeAll(() => {
  vi.stubEnv(
    "INTEGRATION_ENCRYPTION_KEY",
    "test-key-0123456789-0123456789-abcdef"
  );
  registerAllIntegrations();
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv(
    "INTEGRATION_ENCRYPTION_KEY",
    "test-key-0123456789-0123456789-abcdef"
  );
  db.row = null;
  db.updates = [];
});

describe("authorization URLs", () => {
  it("Dropbox: PKCE, state, offline tokens, minimal scopes, app-origin callback", () => {
    const url = new URL(
      createOAuthHandler(getConfig("dropbox")).generateAuthUrl(
        "verifier",
        "st8"
      )
    );
    expect(url.origin + url.pathname).toBe(
      "https://www.dropbox.com/oauth2/authorize"
    );
    expect(url.searchParams.get("client_id")).toBe("dbx-id");
    expect(url.searchParams.get("state")).toBe("st8");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("token_access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toBe(
      "account_info.read files.metadata.read sharing.read sharing.write"
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/dropbox/callback"
    );
  });

  it("Microsoft: PKCE with offline_access and Files.ReadWrite", () => {
    const url = new URL(
      createOAuthHandler(getConfig("onedrive")).generateAuthUrl("v", "s")
    );
    expect(url.hostname).toBe("login.microsoftonline.com");
    expect(url.searchParams.get("scope")).toBe(
      "offline_access Files.ReadWrite"
    );
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("Bitly and Notion send no empty scope and no PKCE", () => {
    const bitly = new URL(
      createOAuthHandler(getConfig("bitly")).generateAuthUrl("v", "s")
    );
    expect(bitly.searchParams.has("scope")).toBe(false);
    expect(bitly.searchParams.has("code_challenge")).toBe(false);
    expect(bitly.searchParams.get("state")).toBe("s");

    const notion = new URL(
      createOAuthHandler(getConfig("notion")).generateAuthUrl("v", "s")
    );
    expect(notion.searchParams.get("owner")).toBe("user");
    expect(notion.searchParams.has("scope")).toBe(false);
  });

  it("Box asks only for root_readwrite", () => {
    const url = new URL(
      createOAuthHandler(getConfig("box")).generateAuthUrl("v", "s")
    );
    expect(url.searchParams.get("scope")).toBe("root_readwrite");
    expect(url.searchParams.has("code_challenge")).toBe(false);
  });
});

describe("code exchange", () => {
  it("Dropbox posts a form with the PKCE verifier", async () => {
    const { calls } = mockFetch(
      json({
        access_token: "a",
        refresh_token: "r",
        expires_in: 14_400,
        token_type: "bearer",
      })
    );
    await createOAuthHandler(getConfig("dropbox")).exchangeCodeForTokens(
      "code1",
      "ver1"
    );
    const form = Object.fromEntries(new URLSearchParams(calls[0]?.body));
    expect(calls[0]?.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded"
    );
    expect(form).toMatchObject({
      grant_type: "authorization_code",
      code: "code1",
      code_verifier: "ver1",
      client_id: "dbx-id",
      client_secret: "dbx-secret",
      redirect_uri: "http://localhost:3000/api/integrations/dropbox/callback",
    });
  });

  it("Notion uses Basic auth and JSON without client credentials in the body", async () => {
    const { calls } = mockFetch(
      json({
        access_token: "secret_x",
        token_type: "bearer",
        workspace_name: "Acme",
      })
    );
    await createOAuthHandler(getConfig("notion")).exchangeCodeForTokens(
      "c",
      "v"
    );
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("ntn-id:ntn-secret").toString("base64")}`
    );
    expect(calls[0]?.headers["content-type"]).toBe("application/json");
    const body = JSON.parse(calls[0]?.body ?? "{}");
    expect(body).toEqual({
      grant_type: "authorization_code",
      code: "c",
      redirect_uri: "http://localhost:3000/api/integrations/notion/callback",
    });
  });
});

describe("token refresh (core/token-refresh)", () => {
  function storeRow(provider: string, refreshToken: string) {
    db.row = {
      id: "int_1",
      provider,
      accessToken: encryptApiKey("old-access"),
      refreshToken: encryptApiKey(refreshToken),
    };
  }

  it("refreshes a Dropbox token and keeps the refresh token", async () => {
    storeRow("dropbox", "dbx-refresh");
    const { calls } = mockFetch(
      json({
        access_token: "new-access",
        expires_in: 14_400,
        token_type: "bearer",
      })
    );
    const before = Date.now();
    await expect(refreshIntegrationToken("int_1", getConfig)).resolves.toBe(
      "new-access"
    );
    expect(calls[0]?.url).toBe("https://api.dropboxapi.com/oauth2/token");
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      client_id: "dbx-id",
      client_secret: "dbx-secret",
      grant_type: "refresh_token",
      refresh_token: "dbx-refresh",
    });
    const update = db.updates[0] ?? {};
    expect(decryptApiKey(update.accessToken as string)).toBe("new-access");
    expect(update.refreshToken).toBe(db.row?.refreshToken);
    expect(update.status).toBe("active");
    expect((update.expiresAt as Date).getTime()).toBeGreaterThanOrEqual(
      before + 14_400_000
    );
  });

  it("stores Box's rotated refresh token, encrypted", async () => {
    storeRow("box", "box-r1");
    mockFetch(
      json({
        access_token: "box-a2",
        refresh_token: "box-r2",
        expires_in: 3600,
        token_type: "bearer",
      })
    );
    await refreshIntegrationToken("int_1", getConfig);
    const update = db.updates[0] ?? {};
    expect(update.refreshToken).not.toBe("box-r2");
    expect(decryptApiKey(update.refreshToken as string)).toBe("box-r2");
  });

  it("refreshes Microsoft tokens at the v2.0 endpoint", async () => {
    storeRow("onedrive", "ms-r1");
    const { calls } = mockFetch(
      json({
        access_token: "ms-a2",
        refresh_token: "ms-r2",
        expires_in: 3600,
        token_type: "Bearer",
      })
    );
    await refreshIntegrationToken("int_1", getConfig);
    expect(calls[0]?.url).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    );
  });

  it("marks the integration as errored when refresh fails, without leaking tokens", async () => {
    storeRow("dropbox", "dbx-refresh-secret");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockFetch(json({ error: "invalid_grant" }, 400));
    const error = (await refreshIntegrationToken("int_1", getConfig).catch(
      (e: unknown) => e
    )) as Error;
    expect(error.message).toContain("Failed to refresh token");
    expect(error.message).not.toContain("dbx-refresh-secret");
    expect(db.updates[0]?.status).toBe("error");
  });
});

describe("loader", () => {
  it("builds production callbacks from the app URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://qrdx.dev/");
    expect(getConfig("box").redirectUri).toBe(
      "https://qrdx.dev/api/integrations/box/callback"
    );
  });

  it("needs no credentials for API-key providers", () => {
    const config = getIntegrationConfigWithEnv("rebrandly", {});
    expect(config.type).toBe("api_key");
    expect(config.supportsRefresh).toBe(false);
    expect(getIntegrationConfigWithEnv("short-io", {}).slug).toBe("short-io");
  });

  it("names the missing variables, never their values", () => {
    expect(() => getIntegrationConfigWithEnv("dropbox", {})).toThrow(
      "Required: DROPBOX_CLIENT_ID, DROPBOX_CLIENT_SECRET"
    );
  });
});
