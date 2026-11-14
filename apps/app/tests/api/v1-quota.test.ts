// The daily REST API quota (lib/api-quota.ts), as
// content/docs/developers/rest-api.mdx describes it: what counts (every
// authenticated request, token or session), how the plan sizes it (1,000 / 10,000 / 100,000 a day), the 429 and the
// X-RateLimit-* headers, and what happens when Upstash is down or missing.
// Upstash is a stand-in that counts like its fixed-window script; the
// in-memory fallback is the real one from @repo/rate-limit/fallback.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

type Plan = "free" | "pro" | "business";
interface Window {
  kind: "sliding" | "fixed";
  tokens: number;
  window: string;
}
interface Result {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

const state = vi.hoisted(() => ({
  session: null as null | { userId: string; organizationId: string | null },
  /** Plan per scope ("user:<id>" or "org:<id>"); Free when missing */
  plans: {} as Record<string, Plan>,
}));

const rl = vi.hoisted(() => ({
  /** The per-minute limiters say no */
  burstBlocked: false,
  /** Every Upstash call fails */
  redisDown: false,
  /** No Upstash configured: createRateLimiter's no-op limiter */
  noRedis: false,
  /** Upstash's counters, by full key */
  upstash: new Map<string, number>(),
  limiters: [] as (Window & {
    prefix: string | undefined;
    limit: (id: string) => Promise<Result>;
  })[],
  closeBreaker: () => {},
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
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@repo/rate-limit", async () => {
  const {
    createCircuitBreaker,
    createMemoryLimiter,
    parseDuration,
    withFallback,
  } = await import("@repo/rate-limit/fallback");
  const breaker = createCircuitBreaker({ log: () => {} });
  rl.closeBreaker = () => breaker.onSuccess();

  return {
    slidingWindow: (tokens: number, window: string): Window => ({
      kind: "sliding",
      tokens,
      window,
    }),
    fixedWindow: (tokens: number, window: string): Window => ({
      kind: "fixed",
      tokens,
      window,
    }),
    createRateLimiter: ({
      prefix,
      limiter,
    }: {
      prefix?: string;
      limiter: Window;
    }) => {
      const windowMs = parseDuration(limiter.window);
      const upstash = async (id: string) => {
        if (rl.redisDown) throw new Error("fetch failed");
        if (limiter.kind === "sliding") {
          return {
            success: !rl.burstBlocked,
            limit: limiter.tokens,
            remaining: rl.burstBlocked ? 0 : limiter.tokens - 1,
            reset: Date.now() + 42_000,
            pending: Promise.resolve(),
          };
        }
        // Upstash's fixed window: one counter per window, INCR every time.
        const bucket = Math.floor(Date.now() / windowMs);
        const key = `${prefix}:${id}:${bucket}`;
        const used = (rl.upstash.get(key) ?? 0) + 1;
        rl.upstash.set(key, used);
        return {
          success: used <= limiter.tokens,
          limit: limiter.tokens,
          remaining: Math.max(0, limiter.tokens - used),
          reset: (bucket + 1) * windowMs,
          pending: Promise.resolve(),
        };
      };
      const fallback = withFallback(
        upstash,
        createMemoryLimiter({
          tokens: limiter.tokens,
          windowMs,
          sliding: limiter.kind === "sliding",
        }),
        breaker,
      );
      const limit = async (id: string) =>
        rl.noRedis
          ? {
              success: true,
              limit: Number.POSITIVE_INFINITY,
              remaining: Number.POSITIVE_INFINITY,
              reset: Date.now() + 60_000,
              pending: Promise.resolve(),
            }
          : fallback(id);
      rl.limiters.push({ prefix, ...limiter, limit });
      return { limit };
    },
  };
});
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async (scope: {
    userId: string;
    organizationId: string | null;
  }) => {
    // Someone's own workspace runs on their own plan (lib/plans.ts).
    const { isOwnWorkspaceOf } = await import("@repo/auth/own-workspace-id");
    const team =
      scope.organizationId &&
      !isOwnWorkspaceOf(scope.organizationId, scope.userId);
    return (
      state.plans[
        team ? `org:${scope.organizationId}` : `user:${scope.userId}`
      ] ?? "free"
    );
  },
}));
vi.mock("@/app/(app)/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/app/(app)/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => null,
}));
vi.mock("@/lib/code-versions", () => ({ snapshotCodeVersion: async () => {} }));
vi.mock("@/lib/safety/destinations", () => ({
  screenNewCodes: async (_scope: unknown, rows: unknown[]) => rows,
  screenUrlChange: async () => false,
}));
vi.mock("@/lib/events/emit", () => ({
  emitCodesCreated: () => {},
  emitCodeUpdated: () => {},
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const codes = await import("@/app/api/v1/codes/route");
const me = await import("@/app/api/v1/me/route");

const ORIGIN = "http://localhost:3000";
const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date("2026-11-01T12:00:00Z");
const MIDNIGHT = new Date("2026-11-02T00:00:00Z").getTime();
const BUCKET = Math.floor(NOW.getTime() / DAY);

// ─── Fixtures ───────────────────────────────────────────────────────────────

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function grant(token: string, userId: string, scopes: string[]) {
  fakeDb.seed("oauthToken", [
    {
      id: `tok_${token}`,
      accessTokenHash: sha256(token),
      refreshTokenHash: sha256(`${token}-refresh`),
      appId: "app_1",
      userId,
      scopes,
      accessTokenExpiresAt: new Date(NOW.getTime() + HOUR),
      refreshTokenExpiresAt: new Date(NOW.getTime() + 30 * 24 * HOUR),
      revokedAt: null,
    },
  ]);
}

/** Requests the scope has made today, as Upstash counts them. */
const used = (scope: string) =>
  rl.upstash.get(`qrdx:api-quota:${scope}:${BUCKET}`) ?? 0;
const setUsed = (scope: string, count: number) =>
  rl.upstash.set(`qrdx:api-quota:${scope}:${BUCKET}`, count);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  // Workspaces are organizations; members point at them.
  fakeDb.seed("organization", [
    { id: "org_acme", name: "Acme", slug: "acme", createdAt: new Date(0) },
  ]);
  fakeDb.seed("user", [
    { id: "u_alice", name: "Alice", email: "alice@example.com", image: null },
    { id: "u_bob", name: "Bob", email: "bob@example.com", image: null },
  ]);
  fakeDb.seed("oauthApp", [{ id: "app_1", isActive: true }]);
  fakeDb.seed("member", [
    { id: "m1", organizationId: "org_acme", userId: "u_alice", role: "owner" },
  ]);
  grant("read-token", "u_alice", ["codes:read"]);
  grant("bob-token", "u_bob", ["codes:read"]);
  grant("profile-token", "u_alice", ["profile:read"]);
  state.session = null;
  state.plans = {};
  rl.burstBlocked = false;
  rl.redisDown = false;
  rl.noRedis = false;
  rl.upstash.clear();
});

afterEach(() => {
  rl.closeBreaker();
  vi.useRealTimers();
});

// ─── Requests ───────────────────────────────────────────────────────────────

function list(call: { token?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...call.headers };
  if (call.token) headers.authorization = `Bearer ${call.token}`;
  return codes.GET(
    new NextRequest(new URL("/api/v1/codes", ORIGIN), { headers }),
  );
}

const getMe = (token: string) =>
  me.GET(
    new NextRequest(new URL("/api/v1/me", ORIGIN), {
      headers: { authorization: `Bearer ${token}` },
    }),
  );

const quotaHeaders = (response: Response) => ({
  limit: response.headers.get("x-ratelimit-limit"),
  remaining: response.headers.get("x-ratelimit-remaining"),
  reset: response.headers.get("x-ratelimit-reset"),
});

const read = { token: "read-token" };

// ─── What counts ────────────────────────────────────────────────────────────

describe("what counts toward the daily quota", () => {
  it("counts token requests against the token owner's personal workspace, with headers on every response", async () => {
    const first = await list(read);
    expect(first.status).toBe(200);
    expect(quotaHeaders(first)).toEqual({
      limit: "1000",
      remaining: "999",
      reset: String(MIDNIGHT / 1000),
    });
    expect(quotaHeaders(await list(read)).remaining).toBe("998");
    expect(used("user:u_alice")).toBe(2);
    // Other workspaces have their own count.
    expect(quotaHeaders(await list({ token: "bob-token" })).remaining).toBe(
      "999",
    );
  });

  it("counts /v1/me and /v1/themes calls too", async () => {
    const response = await getMe("profile-token");
    expect(response.status).toBe(200);
    expect(quotaHeaders(response)).toMatchObject({
      limit: "1000",
      remaining: "999",
    });
    expect(used("user:u_alice")).toBe(1);
  });

  it("counts session requests against the open team, sized by the team's plan", async () => {
    state.session = { userId: "u_alice", organizationId: "org_acme" };
    state.plans["org:org_acme"] = "business";

    const script = await list();
    expect(script.status).toBe(200);
    expect(quotaHeaders(script)).toMatchObject({
      limit: "100000",
      remaining: "99999",
    });
    expect(used("org:org_acme")).toBe(1);
    expect(used("user:u_alice")).toBe(0);
  });

  it("counts session requests whatever Sec-Fetch-Site or Origin say", async () => {
    // Any client can send these headers, so they exempt nothing.
    state.session = { userId: "u_alice", organizationId: null };
    const variants: Record<string, string>[] = [
      { "sec-fetch-site": "same-origin" },
      { "sec-fetch-site": "cross-site" },
      { origin: ORIGIN },
    ];
    for (const headers of variants) {
      const response = await list({ headers });
      expect(response.status).toBe(200);
      expect(quotaHeaders(response).limit).toBe("1000");
    }
    expect(used("user:u_alice")).toBe(3);
  });

  it("doesn't count requests refused before the quota is checked", async () => {
    expect((await list({ token: "made-up" })).status).toBe(401);
    expect((await list({ token: "profile-token" })).status).toBe(403);
    expect((await getMe("made-up")).status).toBe(401);

    // The per-minute limits answer first and keep their own 429.
    rl.burstBlocked = true;
    const burst = await list(read);
    expect(burst.status).toBe(429);
    expect(burst.headers.get("retry-after")).toBe("42");
    expect(quotaHeaders(burst).limit).toBeNull();
    expect(await burst.json()).toEqual({
      code: "RATE_LIMITED",
      message: "Rate limit exceeded. Please try again later.",
      status: 429,
    });

    expect(rl.upstash.size).toBe(0);
  });
});

// ─── Plans ──────────────────────────────────────────────────────────────────

describe("plan sizing", () => {
  it("allows 1,000 requests a day on Free, 10,000 on Pro and 100,000 on Business", async () => {
    const limits: Record<string, string | null> = {};
    for (const plan of ["free", "pro", "business"] as const) {
      state.plans["user:u_alice"] = plan;
      limits[plan] = (await list(read)).headers.get("x-ratelimit-limit");
    }
    expect(limits).toEqual({
      free: "1000",
      pro: "10000",
      business: "100000",
    });
  });

  it("uses one fixed UTC day under its own Redis prefix, next to the unchanged per-minute limits", () => {
    const daily = rl.limiters.filter((l) => l.prefix === "qrdx:api-quota");
    expect(
      daily.map(({ kind, tokens, window }) => [kind, tokens, window]),
    ).toEqual([
      ["fixed", 1000, "1 d"],
      ["fixed", 10_000, "1 d"],
      ["fixed", 100_000, "1 d"],
    ]);
    // The codes API's read, write and per-IP limits (default "qrdx" prefix)
    const burst = rl.limiters
      .filter((l) => l.kind === "sliding")
      .map(({ prefix, tokens, window }) => [prefix, tokens, window]);
    expect(burst).toEqual(
      expect.arrayContaining([
        [undefined, 120, "60 s"],
        [undefined, 30, "60 s"],
        [undefined, 300, "60 s"],
      ]),
    );
  });

  it("moves the cap, not the count, when the plan changes during the day", async () => {
    setUsed("user:u_alice", 1000);
    expect((await list(read)).status).toBe(429);

    state.plans["user:u_alice"] = "pro";
    const upgraded = await list(read);
    expect(upgraded.status).toBe(200);
    expect(upgraded.headers.get("x-ratelimit-limit")).toBe("10000");
    expect(
      Number(upgraded.headers.get("x-ratelimit-remaining")),
    ).toBeLessThanOrEqual(9000);
  });
});

// ─── Over the limit ─────────────────────────────────────────────────────────

describe("over the limit", () => {
  it("answers 429 RATE_LIMITED naming the plan and its daily limit, with Retry-After and the quota headers", async () => {
    setUsed("user:u_alice", 999);
    const last = await list(read);
    expect(last.status).toBe(200);
    expect(quotaHeaders(last).remaining).toBe("0");

    const over = await list(read);
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({
      code: "RATE_LIMITED",
      message:
        "Daily API limit reached: the Free plan allows 1,000 requests a day. It resets at 00:00 UTC. Upgrade your plan for a higher limit.",
      status: 429,
    });
    // 12:00 UTC: twelve hours until the reset
    expect(over.headers.get("retry-after")).toBe(String(12 * 3600));
    expect(quotaHeaders(over)).toEqual({
      limit: "1000",
      remaining: "0",
      reset: String(MIDNIGHT / 1000),
    });
    expect(over.headers.get("content-type")).toBe("application/json");
  });

  it("names Pro and Business limits, without an upgrade hint on Business", async () => {
    state.plans["user:u_alice"] = "pro";
    setUsed("user:u_alice", 10_000);
    expect(
      ((await (await list(read)).json()) as { message: string }).message,
    ).toBe(
      "Daily API limit reached: the Pro plan allows 10,000 requests a day. It resets at 00:00 UTC. Upgrade your plan for a higher limit.",
    );

    state.plans["user:u_alice"] = "business";
    setUsed("user:u_alice", 100_000);
    expect(
      ((await (await list(read)).json()) as { message: string }).message,
    ).toBe(
      "Daily API limit reached: the Business plan allows 100,000 requests a day. It resets at 00:00 UTC.",
    );
  });

  it("adds the OAuth error fields on /v1/me and /v1/themes", async () => {
    setUsed("user:u_alice", 1000);
    const response = await getMe("profile-token");
    expect(response.status).toBe(429);
    const message =
      "Daily API limit reached: the Free plan allows 1,000 requests a day. It resets at 00:00 UTC. Upgrade your plan for a higher limit.";
    expect(await response.json()).toEqual({
      error: "rate_limited",
      error_description: message,
      code: "RATE_LIMITED",
      message,
      status: 429,
    });
    expect(response.headers.get("retry-after")).toBe(String(12 * 3600));
    expect(quotaHeaders(response)).toMatchObject({
      limit: "1000",
      remaining: "0",
    });
  });

  it("starts over at 00:00 UTC", async () => {
    setUsed("user:u_alice", 1000);
    expect((await list(read)).status).toBe(429);
    const token = fakeDb.find("oauthToken", { id: "tok_read-token" });
    if (token) token.accessTokenExpiresAt = new Date(MIDNIGHT + HOUR);
    vi.setSystemTime(MIDNIGHT);
    const tomorrow = await list(read);
    expect(tomorrow.status).toBe(200);
    expect(quotaHeaders(tomorrow)).toEqual({
      limit: "1000",
      remaining: "999",
      reset: String((MIDNIGHT + DAY) / 1000),
    });
  });
});

// ─── Upstash failures ───────────────────────────────────────────────────────

describe("when Upstash fails or is missing", () => {
  it("keeps enforcing the plan's daily limit in memory while Upstash is down", async () => {
    rl.redisDown = true;
    const free = rl.limiters.find(
      (l) => l.prefix === "qrdx:api-quota" && l.tokens === 1000,
    );
    if (!free) throw new Error("no Free quota limiter");
    for (let i = 0; i < 999; i++) await free.limit("user:u_alice");

    const last = await list(read);
    expect(last.status).toBe(200);
    expect(quotaHeaders(last)).toEqual({
      limit: "1000",
      remaining: "0",
      reset: String(MIDNIGHT / 1000),
    });
    const over = await list(read);
    expect(over.status).toBe(429);
    expect(((await over.json()) as { code: string }).code).toBe("RATE_LIMITED");
    expect(over.headers.get("retry-after")).toBe(String(12 * 3600));
    expect(rl.upstash.size).toBe(0);
  });

  it("has no quota and no headers without Upstash (rate limiting off)", async () => {
    rl.noRedis = true;
    setUsed("user:u_alice", 5000);
    const response = await list(read);
    expect(response.status).toBe(200);
    expect(quotaHeaders(response).limit).toBeNull();
  });
});
