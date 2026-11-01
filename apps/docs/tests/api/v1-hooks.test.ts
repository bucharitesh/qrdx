// REST Hooks (/v1/hooks) as content/docs/webhooks.mdx and rest-api.mdx
// describe them: Business only, codes:write to subscribe and unsubscribe,
// Zapier/Make body shapes, https URLs on public hosts only, the signing
// secret shown once, secret-bearing target URLs masked for read-only callers,
// and deletion on every plan. Route handlers run the real endpoint service
// against in-memory tables; DNS is stubbed and nothing is ever delivered.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  session: null as null | { userId: string; organizationId: string | null },
  plan: "business" as "free" | "pro" | "business",
  dns: new Map<string, string[]>(),
  fetches: 0,
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
        state.session
          ? {
              user: { id: state.session.userId },
              session: { activeOrganizationId: state.session.organizationId },
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
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("node:dns/promises", () => {
  const lookup = async (hostname: string) => {
    const addresses = state.dns.get(hostname);
    if (!addresses) {
      throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
        code: "ENOTFOUND",
      });
    }
    return addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 : 4,
    }));
  };
  return { lookup, default: { lookup } };
});
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const hooks = await import("@/app/api/v1/hooks/route");
const hook = await import("@/app/api/v1/hooks/[id]/route");

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-01T12:00:00Z");
const ZAP = "https://hooks.zapier.com/hooks/standard/123/abc-secret-path/";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function grant(token: string, userId: string, scopes: string[]) {
  fakeDb.seed("oauthToken", [
    {
      id: `tok_${token}`,
      accessTokenHash: sha256(token),
      appId: "app_1",
      userId,
      scopes,
      accessTokenExpiresAt: new Date(NOW.getTime() + 3_600_000),
      revokedAt: null,
    },
  ]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  fakeDb.defaults("webhookEndpoint", () => ({ createdAt: new Date() }));
  fakeDb.seed("user", [
    { id: "u_alice", banned: false, banExpires: null },
    { id: "u_bob", banned: false, banExpires: null },
  ]);
  fakeDb.seed("oauthApp", [{ id: "app_1", isActive: true }]);
  fakeDb.seed("member", [
    { id: "m1", organizationId: "org_acme", userId: "u_alice", role: "owner" },
    { id: "m2", organizationId: "org_acme", userId: "u_bob", role: "member" },
  ]);
  grant("write-token", "u_alice", ["codes:write"]);
  grant("read-token", "u_alice", ["codes:read"]);
  grant("bob-write", "u_bob", ["codes:write"]);
  state.session = null;
  state.plan = "business";
  state.fetches = 0;
  state.dns = new Map([
    ["hooks.zapier.com", ["54.86.10.20"]],
    ["hook.eu1.make.com", ["3.120.1.2"]],
    [
      "example.com",
      ["93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c"],
    ],
    ["internal.example.com", ["10.0.0.5"]],
    ["mixed.example.com", ["93.184.215.14", "127.0.0.1"]],
    ["metadata.example.com", ["169.254.169.254"]],
    ["mapped.example.com", ["::ffff:192.168.1.1"]],
  ]);
  vi.stubGlobal("fetch", async () => {
    state.fetches += 1;
    throw new Error("tests never deliver webhooks");
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

interface Call {
  token?: string;
  headers?: Record<string, string>;
}

function request(
  method: string,
  path: string,
  body?: unknown,
  call: Call = {},
) {
  const headers: Record<string, string> = { ...call.headers };
  if (call.token) headers.authorization = `Bearer ${call.token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(new URL(path, ORIGIN), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const subscribe = (body: unknown, call: Call = { token: "write-token" }) =>
  hooks.POST(request("POST", "/api/v1/hooks", body, call));
const listHooks = (call: Call) =>
  hooks.GET(request("GET", "/api/v1/hooks", undefined, call));
const getHook = (id: string, call: Call) =>
  hook.GET(request("GET", `/api/v1/hooks/${id}`, undefined, call), ctx(id));
const unsubscribe = (id: string, call: Call = { token: "write-token" }) =>
  hook.DELETE(
    request("DELETE", `/api/v1/hooks/${id}`, undefined, call),
    ctx(id),
  );

interface HookJson {
  id: string;
  target_url: string;
  events: string[];
  event: string | null;
  active: boolean;
  created_at: string;
  secret?: string;
}

const body = async <T>(response: Response) => (await response.json()) as T;
const errorOf = (response: Response) =>
  body<{ code: string; message: string; status: number }>(response);

// ─── Subscribing ────────────────────────────────────────────────────────────

describe("POST /v1/hooks", () => {
  it("subscribes a Zapier hook and returns its signing secret once", async () => {
    const response = await subscribe({ hookUrl: ZAP, event: "scan.created" });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const created = await body<HookJson>(response);
    expect(created).toMatchObject({
      target_url: ZAP,
      events: ["scan.created"],
      event: "scan.created",
      active: true,
      created_at: NOW.toISOString(),
    });
    expect(created.secret).toMatch(/^whsec_/);

    const listed = await body<{ data: HookJson[] }>(
      await listHooks({ token: "write-token" }),
    );
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.id).toBe(created.id);
    expect(JSON.stringify(listed)).not.toContain(created.secret as string);
    expect(
      JSON.stringify(
        await body(await getHook(created.id, { token: "write-token" })),
      ),
    ).not.toContain(created.secret as string);
    expect(state.fetches).toBe(0);
  });

  it("accepts Make's target_url, a plain url, and several events", async () => {
    const make = await subscribe({
      target_url: "https://hook.eu1.make.com/abc",
      event: "code.created",
    });
    expect(make.status).toBe(201);
    const several = await body<HookJson>(
      await subscribe({
        url: "https://example.com/hook",
        events: ["scan.created", "form.submitted", "scan.created"],
      }),
    );
    expect(several.events).toEqual(["scan.created", "form.submitted"]);
    expect(several.event).toBeNull();
  });

  it("explains missing or unknown events and URLs", async () => {
    const noUrl = await subscribe({ event: "scan.created" });
    expect(noUrl.status).toBe(400);
    expect(JSON.stringify(await body(noUrl))).toContain(
      "target_url is required",
    );
    const noEvent = await subscribe({ hookUrl: ZAP });
    expect(noEvent.status).toBe(400);
    expect(JSON.stringify(await body(noEvent))).toContain(
      "event must be one of",
    );
    expect(
      (await subscribe({ hookUrl: ZAP, event: "code.deleted" })).status,
    ).toBe(400);
  });

  it.each([
    ["http://example.com/hook", "Webhook URLs must use https://"],
    ["https://93.184.215.14/hook", "Use a host name, not an IP address."],
    ["https://[::1]/hook", "Use a host name, not an IP address."],
    ["https://localhost/hook", "Use a public host name."],
    ["https://user:pw@example.com/hook", "Remove the user name and password"],
    ["not a url", "Enter a full URL, starting with https://"],
  ])("refuses %s", async (url, message) => {
    const response = await subscribe({ url, event: "scan.created" });
    expect(response.status).toBe(400);
    expect(JSON.stringify(await body(response))).toContain(message);
    expect(fakeDb.rows("webhookEndpoint")).toHaveLength(0);
  });

  it.each([
    "internal.example.com",
    "mixed.example.com",
    "metadata.example.com",
    "mapped.example.com",
  ])("refuses %s, which resolves to a private address", async (host) => {
    const response = await subscribe({
      url: `https://${host}/hook`,
      event: "scan.created",
    });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).message).toBe(
      `${host} points to a private or reserved address.`,
    );
  });

  it("refuses hosts that don't resolve", async () => {
    const response = await subscribe({
      url: "https://nowhere.example.org/hook",
      event: "scan.created",
    });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).message).toContain(
      "could not be resolved",
    );
  });

  it.each([
    "free",
    "pro",
  ] as const)("is a Business feature (402 PLAN_REQUIRED on %s)", async (plan) => {
    state.plan = plan;
    const response = await subscribe({ hookUrl: ZAP, event: "scan.created" });
    expect(response.status).toBe(402);
    expect(await errorOf(response)).toMatchObject({
      code: "PLAN_REQUIRED",
      message: expect.stringContaining("Business"),
    });
  });

  it("needs codes:write", async () => {
    const response = await subscribe(
      { hookUrl: ZAP, event: "scan.created" },
      { token: "read-token" },
    );
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("INSUFFICIENT_SCOPE");
  });

  it("caps a workspace at 20 endpoints", async () => {
    for (let i = 0; i < 20; i++) {
      expect(
        (
          await subscribe({
            url: `https://example.com/${i}`,
            event: "scan.created",
          })
        ).status,
      ).toBe(201);
    }
    const response = await subscribe({
      url: "https://example.com/21",
      event: "scan.created",
    });
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("LIMIT_REACHED");
    // Another workspace has its own 20.
    expect(
      (
        await subscribe(
          { url: "https://example.com/bob", event: "scan.created" },
          { token: "bob-write" },
        )
      ).status,
    ).toBe(201);
  });

  it("lets only team owners and admins subscribe from the dashboard session", async () => {
    state.session = { userId: "u_bob", organizationId: "org_acme" };
    const member = await subscribe(
      { hookUrl: ZAP, event: "scan.created" },
      { headers: { origin: ORIGIN } },
    );
    expect(member.status).toBe(403);
    expect((await errorOf(member)).code).toBe("FORBIDDEN");

    state.session = { userId: "u_alice", organizationId: "org_acme" };
    const owner = await subscribe(
      { hookUrl: ZAP, event: "scan.created" },
      { headers: { origin: ORIGIN } },
    );
    expect(owner.status).toBe(201);
    expect(fakeDb.rows("webhookEndpoint")[0]).toMatchObject({
      organizationId: "org_acme",
    });
  });

  it("rejects cross-site session subscriptions", async () => {
    state.session = { userId: "u_alice", organizationId: null };
    const response = await subscribe(
      { hookUrl: ZAP, event: "scan.created" },
      { headers: { origin: "https://evil.example" } },
    );
    expect(response.status).toBe(403);
    expect(fakeDb.rows("webhookEndpoint")).toHaveLength(0);
  });
});

// ─── Reading ────────────────────────────────────────────────────────────────

describe("GET /v1/hooks", () => {
  it("shows target URLs in full only to callers who manage subscriptions", async () => {
    const { id } = await body<HookJson>(
      await subscribe({ hookUrl: ZAP, event: "scan.created" }),
    );
    const readOnly = await body<{ data: HookJson[] }>(
      await listHooks({ token: "read-token" }),
    );
    expect(readOnly.data[0]?.target_url).toBe("https://hooks.zapier.com/…");
    expect(JSON.stringify(readOnly)).not.toContain("abc-secret-path");
    const single = await body<{ data: HookJson }>(
      await getHook(id, { token: "read-token" }),
    );
    expect(single.data.target_url).toBe("https://hooks.zapier.com/…");

    const writer = await body<{ data: HookJson[] }>(
      await listHooks({ token: "write-token" }),
    );
    expect(writer.data[0]?.target_url).toBe(ZAP);
  });

  it("masks URLs for team members but not owners", async () => {
    state.session = { userId: "u_alice", organizationId: "org_acme" };
    await subscribe(
      { hookUrl: ZAP, event: "scan.created" },
      {
        headers: { origin: ORIGIN },
      },
    );
    const owner = await body<{ data: HookJson[] }>(await listHooks({}));
    expect(owner.data[0]?.target_url).toBe(ZAP);

    state.session = { userId: "u_bob", organizationId: "org_acme" };
    const member = await body<{ data: HookJson[] }>(await listHooks({}));
    expect(member.data[0]?.target_url).toBe("https://hooks.zapier.com/…");
  });

  it("lists only the caller's workspace", async () => {
    await subscribe({ hookUrl: ZAP, event: "scan.created" });
    const bob = await body<{ data: HookJson[] }>(
      await listHooks({ token: "bob-write" }),
    );
    expect(bob.data).toEqual([]);
  });
});

// ─── Unsubscribing ──────────────────────────────────────────────────────────

describe("DELETE /v1/hooks/{id}", () => {
  it("unsubscribes (204) and the hook is gone", async () => {
    const { id } = await body<HookJson>(
      await subscribe({ hookUrl: ZAP, event: "scan.created" }),
    );
    const response = await unsubscribe(id);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect((await getHook(id, { token: "write-token" })).status).toBe(404);
    expect((await unsubscribe(id)).status).toBe(404);
  });

  it("works on every plan, so a downgraded Zap can still be turned off", async () => {
    const { id } = await body<HookJson>(
      await subscribe({ hookUrl: ZAP, event: "scan.created" }),
    );
    state.plan = "free";
    expect((await unsubscribe(id)).status).toBe(204);
  });

  it("can't touch another workspace's hook", async () => {
    const { id } = await body<HookJson>(
      await subscribe({ hookUrl: ZAP, event: "scan.created" }),
    );
    expect((await unsubscribe(id, { token: "bob-write" })).status).toBe(404);
    expect((await getHook(id, { token: "bob-write" })).status).toBe(404);
    expect(fakeDb.rows("webhookEndpoint")).toHaveLength(1);
  });

  it("needs codes:write", async () => {
    const { id } = await body<HookJson>(
      await subscribe({ hookUrl: ZAP, event: "scan.created" }),
    );
    expect((await unsubscribe(id, { token: "read-token" })).status).toBe(403);
  });
});
