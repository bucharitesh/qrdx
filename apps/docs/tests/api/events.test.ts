// POST /api/events (hosted-page analytics) against inflation: bots are
// dropped, only published pages count, each visitor counts one view per page
// per 30 minutes, rotating user agents from one IP hits a per-page cap, and no
// raw IP reaches storage or the rate limiter. Tables are in memory
// (tests/support/fake-db.ts); the limiters run in memory with the real
// windows. Nothing connects to a database or Upstash.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  pending: [] as Promise<unknown>[],
  keys: [] as string[],
  /** Bumped per test: every limiter starts empty again */
  generation: 0,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => {
    state.pending.push(task());
  },
}));
vi.mock("@repo/rate-limit", async () => {
  const { createMemoryLimiter, parseDuration } = await import(
    "@repo/rate-limit/fallback"
  );
  return {
    slidingWindow: (tokens: number, window: string) => ({
      tokens,
      windowMs: parseDuration(window),
    }),
    createRateLimiter: ({
      limiter,
    }: {
      limiter: { tokens: number; windowMs: number };
    }) => {
      let generation = -1;
      let memory = createMemoryLimiter(limiter);
      return {
        limit: async (key: string) => {
          if (generation !== state.generation) {
            generation = state.generation;
            memory = createMemoryLimiter(limiter);
          }
          state.keys.push(key);
          return memory.limit(key);
        },
      };
    },
  };
});

const { POST } = await import("@/app/api/events/route");

const IP = "203.0.113.7";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function send(
  body: unknown,
  { ip = IP, ua = UA }: { ip?: string; ua?: string } = {},
) {
  return POST(
    new NextRequest("https://qrdx.dev/api/events", {
      method: "POST",
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        "user-agent": ua,
        "x-forwarded-for": ip,
      },
      body: JSON.stringify(body),
    }),
  );
}

async function settle() {
  await Promise.all(state.pending.splice(0));
}

const events = () => fakeDb.rows("landingEvent");

function seed() {
  fakeDb.reset();
  fakeDb.seed("landingPage", [
    { id: "page_live", userId: "u1", organizationId: null, type: "links" },
    { id: "page_draft", userId: "u1", organizationId: null, type: "links" },
    { id: "page_paused", userId: "u1", organizationId: null, type: "links" },
  ]);
  const code = (id: string, pageId: string, extra = {}) => ({
    id,
    userId: "u1",
    slug: id.replace(/_/g, ""),
    kind: "page",
    pageId,
    isActive: true,
    archivedAt: null,
    deletedAt: null,
    ...extra,
  });
  fakeDb.seed("qrCode", [
    code("code_live", "page_live"),
    code("code_paused", "page_paused", { isActive: false }),
    code("code_gone", "page_paused", { deletedAt: new Date() }),
  ]);
}

beforeEach(() => {
  seed();
  state.pending = [];
  state.keys = [];
  state.generation++;
});

describe("POST /api/events", () => {
  it("records a view of a published page once per visitor", async () => {
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await send({
            pageId: "page_live",
            qrCodeId: "code_live",
            type: "view",
          })
        ).status,
      ).toBe(204);
    }
    await settle();
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      pageId: "page_live",
      qrCodeId: "code_live",
      type: "view",
    });
  });

  it("rejects pages that don't exist or aren't published", async () => {
    for (const body of [
      { pageId: "page_missing", type: "view" },
      // A page no live code opens (never published).
      { pageId: "page_draft", type: "view" },
      // Its only codes are paused or deleted.
      { pageId: "page_paused", type: "view" },
      { slug: "codepaused", type: "view" },
      { slug: "nope", type: "view" },
    ]) {
      expect((await send(body)).status, JSON.stringify(body)).toBe(404);
    }
    await settle();
    expect(events()).toHaveLength(0);
  });

  it("doesn't credit a code that isn't the page's", async () => {
    await send({ pageId: "page_live", qrCodeId: "code_gone", type: "view" });
    await settle();
    expect(events()[0]).toMatchObject({ pageId: "page_live", qrCodeId: null });
  });

  it("ignores bots and requests without a user agent", async () => {
    for (const ua of [
      "",
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
      "facebookexternalhit/1.1",
      "curl/8.4.0",
    ]) {
      expect(
        (await send({ pageId: "page_live", type: "view" }, { ua })).status,
      ).toBe(204);
    }
    await settle();
    expect(events()).toHaveLength(0);
  });

  it("caps views per IP and page however the user agent rotates", async () => {
    for (let i = 0; i < 40; i++) {
      await send(
        { pageId: "page_live", type: "view" },
        { ua: `${UA} build/${i}` },
      );
    }
    await settle();
    // 40 "different visitors" from one network count at most 20.
    expect(events()).toHaveLength(20);
    // Another network is unaffected.
    await send({ pageId: "page_live", type: "view" }, { ip: "198.51.100.9" });
    await settle();
    expect(events()).toHaveLength(21);
  });

  it("rate limits interactions per visitor and page", async () => {
    for (let i = 0; i < 30; i++) {
      await send({ pageId: "page_live", type: "click", target: `link-${i}` });
    }
    await settle();
    expect(events()).toHaveLength(20);
  });

  it("never stores or sends a raw IP", async () => {
    await send({ pageId: "page_live", type: "view" });
    await send({ pageId: "page_live", type: "click", target: "b1" });
    await settle();
    expect(state.keys.length).toBeGreaterThan(0);
    for (const key of state.keys) expect(key).not.toContain(IP);
    expect(JSON.stringify(events())).not.toContain(IP);
    expect(events()[0]?.visitorHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("answers 429 past the IP's request budget", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) {
      statuses.push(
        (await send({ pageId: "page_live", type: "click", target: "x" }))
          .status,
      );
    }
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
  });

  it("rejects malformed bodies", async () => {
    expect((await send({ type: "view" })).status).toBe(400);
    expect((await send({ pageId: "page_live", type: "View!" })).status).toBe(
      400,
    );
  });
});
