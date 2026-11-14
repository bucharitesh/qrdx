// Dub is a partner (owner decision, 2026-11-05): the Dub integration stays
// and Dub stops being an import source. This drives the real route handlers:
// Enable (OAuth with PKCE) → the callback stores the encrypted token → the
// editor's picker lists links and creates one. Then, with that same live
// connection, the Import API offers no Dub and refuses a Dub import.
// Tables live in memory (tests/support/fake-db.ts) and Dub's API is a stubbed
// fetch, so nothing connects to a database or to Dub.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  userId: "user_dub" as string | null,
  cookies: new Map<string, string>(),
}));

// Obviously fake app credentials, so the OAuth flow can start.
vi.stubEnv("DUB_CLIENT_ID", "dub_client_test");
vi.stubEnv("DUB_CLIENT_SECRET", "dub_secret_test");
vi.stubEnv(
  "DUB_REDIRECT_URI",
  "http://localhost:3000/api/integrations/dub/callback",
);

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
        state.userId
          ? {
              user: { id: state.userId },
              session: { activeOrganizationId: null },
            }
          : null,
    },
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
  // The OAuth state, PKCE verifier and return path live in these cookies.
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name)
        ? { name, value: state.cookies.get(name) as string }
        : undefined,
    set: (name: string, value: string) => {
      state.cookies.set(name, value);
    },
    delete: (name: string) => {
      state.cookies.delete(name);
    },
  }),
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/analytics/server", () => ({
  trackServer: () => {},
  hasAnalyticsConsent: async () => false,
}));
// Import calls run in the signed-in person's own workspace.
vi.mock("@/lib/scope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scope")>()),
  getActiveScope: async () => ({
    userId: state.userId as string,
    organizationId: "org_dub",
    role: "owner" as const,
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => "pro",
}));

const connect = await import("@/app/api/integrations/[provider]/route");
const callback = await import(
  "@/app/api/integrations/[provider]/callback/route"
);
const dubLinks = await import("@/app/api/integrations/dub/links/route");
const migrateProviders = await import("@/app/api/migrate/providers/route");
const migrateLinks = await import("@/app/api/migrate/[provider]/links/route");
const migratePreview = await import("@/app/api/migrate/preview/route");
const migrateJobs = await import("@/app/api/migrate/jobs/route");

const ORIGIN = "http://localhost:3000";
const ACCESS_TOKEN = "dub_access_token_test";
const params = (provider: string) => ({
  params: Promise.resolve({ provider }),
});

interface DubCall {
  method: string;
  url: URL;
  auth: string | null;
  body: string | null;
}
let dubCalls: DubCall[] = [];

const LINK = {
  id: "link_spring",
  domain: "dub.sh",
  key: "spring",
  url: "https://example.com/spring",
  title: "Spring menu",
  archived: false,
  clicks: 12,
  createdAt: "2026-10-01T00:00:00.000Z",
};

/** Dub's API as the integration calls it; anything else fails the test. */
function stubDub() {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      dubCalls.push({
        method,
        url,
        auth: headers.get("authorization"),
        body:
          typeof init?.body === "string"
            ? init.body
            : (init?.body?.toString() ?? null),
      });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "content-type": "application/json" },
        });
      if (url.origin !== "https://api.dub.co") {
        throw new Error(`Unexpected request to ${url.origin}`);
      }
      if (method === "POST" && url.pathname === "/oauth/token") {
        return json({
          access_token: ACCESS_TOKEN,
          refresh_token: "dub_refresh_token_test",
          expires_in: 7200,
          token_type: "Bearer",
          scope: "workspaces.read workspaces.write links.read links.write",
        });
      }
      if (headers.get("authorization") !== `Bearer ${ACCESS_TOKEN}`) {
        return json({ error: { message: "Unauthorized" } }, 401);
      }
      if (method === "GET" && url.pathname === "/workspaces") {
        return json([{ id: "ws_test", name: "Test workspace", slug: "test" }]);
      }
      if (method === "GET" && url.pathname === "/links") return json([LINK]);
      if (method === "POST" && url.pathname === "/links") {
        const body = JSON.parse(String(init?.body));
        return json({ ...LINK, id: "link_new", key: "new", url: body.url });
      }
      throw new Error(`Unexpected Dub call ${method} ${url.pathname}`);
    },
  );
}

beforeEach(() => {
  fakeDb.reset();
  state.userId = "user_dub";
  state.cookies.clear();
  dubCalls = [];
  stubDub();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Enable → Dub's consent screen → back to the callback, as a browser would. */
async function connectDub() {
  const start = await connect.GET(
    new Request(`${ORIGIN}/api/integrations/dub?action=connect`),
    params("dub"),
  );
  expect(start.status).toBe(200);
  const authUrl = new URL((await start.json()).url);
  const back = await callback.GET(
    new Request(
      `${ORIGIN}/api/integrations/dub/callback?code=code_test&state=${authUrl.searchParams.get("state")}`,
    ),
    params("dub"),
  );
  return { authUrl, back };
}

describe("Dub integration: connect and pick a link", () => {
  it("starts OAuth with PKCE and stores the token encrypted on callback", async () => {
    const { authUrl, back } = await connectDub();

    expect(authUrl.origin + authUrl.pathname).toBe(
      "https://app.dub.co/oauth/authorize",
    );
    expect(authUrl.searchParams.get("client_id")).toBe("dub_client_test");
    expect(authUrl.searchParams.get("code_challenge")).toBeTruthy();
    expect(authUrl.searchParams.get("scope")).toContain("links.read");

    expect(back.status).toBe(307);
    expect(new URL(back.headers.get("location") as string).search).toBe(
      "?success=dub_connected",
    );
    // The code went back with the PKCE verifier and the app's credentials.
    const tokenCall = dubCalls.find(
      (call) => call.url.pathname === "/oauth/token",
    );
    const form = new URLSearchParams(tokenCall?.body ?? "");
    expect(form.get("code")).toBe("code_test");
    expect(form.get("code_verifier")).toBeTruthy();
    // The flow cookies are single use.
    expect([...state.cookies.keys()]).toEqual([]);

    const [row] = fakeDb.rows("integration");
    expect(row).toMatchObject({
      userId: "user_dub",
      provider: "dub",
      status: "active",
      metadata: { workspace: { id: "ws_test" } },
    });
    expect(row?.accessToken).not.toContain(ACCESS_TOKEN);
  });

  it("refuses a callback whose state doesn't match", async () => {
    await connect.GET(
      new Request(`${ORIGIN}/api/integrations/dub?action=connect`),
      params("dub"),
    );
    const back = await callback.GET(
      new Request(
        `${ORIGIN}/api/integrations/dub/callback?code=code_test&state=forged`,
      ),
      params("dub"),
    );
    expect(new URL(back.headers.get("location") as string).search).toBe(
      "?error=invalid_state",
    );
    expect(fakeDb.rows("integration")).toEqual([]);
  });

  it("lists the account's links for the picker and creates one", async () => {
    await connectDub();

    const listed = (await dubLinks.GET(
      new Request(`${ORIGIN}/api/integrations/dub/links?search=spring`),
    )) as Response;
    expect(listed.status).toBe(200);
    const body = await listed.json();
    expect(body.links).toEqual([LINK]);
    const listCall = dubCalls.find(
      (call) => call.method === "GET" && call.url.pathname === "/links",
    );
    expect(listCall?.auth).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(listCall?.url.searchParams.get("search")).toBe("spring");

    const created = (await dubLinks.POST(
      new Request(`${ORIGIN}/api/integrations/dub/links`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/new" }),
      }),
    )) as Response;
    expect(created.status).toBe(201);
    expect((await created.json()).link).toMatchObject({
      id: "link_new",
      url: "https://example.com/new",
    });
  });

  it("tells the picker when Dub isn't connected", async () => {
    const listed = (await dubLinks.GET(
      new Request(`${ORIGIN}/api/integrations/dub/links`),
    )) as Response;
    expect(listed.status).toBe(404);
    expect(dubCalls).toEqual([]);
  });
});

describe("Import: no Dub, even with Dub connected", () => {
  const json = (path: string, body: unknown) =>
    new Request(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify(body),
    });
  const request = {
    provider: "dub",
    links: [
      {
        id: LINK.id,
        shortLink: "https://dub.sh/spring",
        domain: "dub.sh",
        backHalf: "spring",
        destinationUrl: LINK.url,
        title: LINK.title,
        tags: [],
        clicks: 12,
        createdAt: LINK.createdAt,
        archived: false,
      },
    ],
    options: {
      folderName: "Imported from Dub",
      carryTags: true,
      includeDuplicates: false,
      backHalfDomain: null,
      keepBackHalves: false,
      useSuggestions: true,
      limit: null,
    },
  };

  it("leaves Dub out of the provider list", async () => {
    await connectDub();
    const response = await migrateProviders.GET(
      new Request(`${ORIGIN}/api/migrate/providers`),
    );
    expect(response.status).toBe(200);
    const ids = (await response.json()).data.providers.map(
      (provider: { id: string }) => provider.id,
    );
    expect(ids).toEqual(["bitly", "rebrandly", "short-io"]);
  });

  it("refuses to list, preview or start a Dub import", async () => {
    await connectDub();
    const before = dubCalls.length;

    const links = await migrateLinks.GET(
      new Request(`${ORIGIN}/api/migrate/dub/links`),
      params("dub"),
    );
    const preview = await migratePreview.POST(
      json("/api/migrate/preview", request),
    );
    const start = await migrateJobs.POST(json("/api/migrate/jobs", request));

    for (const response of [links, preview, start]) {
      expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({
        code: "PROVIDER_RETIRED",
        message: expect.stringMatching(/^Imports from Dub have ended\./),
      });
    }
    // Dub was never asked for links, and no import job or code was stored.
    expect(dubCalls.length).toBe(before);
    expect(fakeDb.rows("integration").map((row) => row.provider)).toEqual([
      "dub",
    ]);
    expect(fakeDb.rows("qrCode")).toEqual([]);
  });
});
