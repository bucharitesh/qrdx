// Large batches on POST /v1/codes (lib/bulk-limits.ts): up to
// MAX_CODES_PER_REQUEST codes per request, inserted in chunks, with slugs that
// can't collide, every row's problem listed by index, an Idempotency-Key
// that makes retries safe, and `Prefer: return=minimal`. Same in-memory
// harness as v1-codes.test.ts: the real codes service, stubbed side systems.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chunkRows,
  idempotentCodeId,
  uniqueSlugs,
} from "@/app/dashboard/codes/_lib/bulk";
import { MAX_CODES_PER_REQUEST } from "@/lib/bulk-limits";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "pro" as "free" | "pro" | "business",
  defaultStyle: null as null | Record<string, unknown>,
  /** Slugs generateSlug hands out first (then random ones). */
  slugQueue: [] as string[],
  /** INSERTs into qr_code */
  inserts: 0,
  blocked: new Set<string>(),
  /** Destinations Web Risk "didn't answer" for */
  unchecked: new Set<string>(),
  rechecked: [] as string[][],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock("@repo/database", async () => {
  const { repoDatabase } = await import("../support/fake-db");
  const database = repoDatabase.database as {
    insert: (table: unknown) => unknown;
  };
  const insert = database.insert.bind(database);
  return {
    ...repoDatabase,
    database: new Proxy(database, {
      get(target, key, receiver) {
        if (key === "insert") {
          return (table: unknown) => {
            if (table === repoDatabase.qrCode) state.inserts++;
            return insert(table);
          };
        }
        return Reflect.get(target, key, receiver);
      },
    }),
  };
});
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 42_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/lib/short-links", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/short-links")>();
  return {
    ...actual,
    generateSlug: () => state.slugQueue.shift() ?? actual.generateSlug(),
  };
});
vi.mock("@/app/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/app/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => state.defaultStyle,
}));
vi.mock("@/lib/code-versions", () => ({ snapshotCodeVersion: async () => {} }));
vi.mock("@/lib/safety/destinations", async () => {
  const { HttpError } = await import("@/lib/error-response");
  return {
    screenNewCodes: async (
      _scope: unknown,
      rows: { destinationUrl: string }[],
      { indexOf = (p: number) => p } = {},
    ) => {
      const details = rows.flatMap((row, position) =>
        state.blocked.has(row.destinationUrl)
          ? [
              {
                index: indexOf(position),
                path: `${indexOf(position)}.destinationUrl`,
                message: "unsafe",
              },
            ]
          : [],
      );
      const marked = rows.map((row) =>
        state.unchecked.has(row.destinationUrl)
          ? { ...row, webRiskRecheckAt: new Date() }
          : row,
      );
      if (details.length > 0) {
        throw new HttpError(
          422,
          "UNSAFE_DESTINATION",
          "unsafe",
          undefined,
          undefined,
          {
            details,
          },
        );
      }
      return marked;
    },
    screenUrlChange: async () => false,
  };
});
vi.mock("@/lib/safety/recheck", () => ({
  recheckAfterResponse: (ids: string[]) => {
    if (ids.length > 0) state.rechecked.push(ids);
  },
}));
vi.mock("@/lib/events/emit", () => ({
  emitCodesCreated: () => {},
  emitCodeUpdated: () => {},
}));
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: () => {},
}));

const { NextRequest } = await import("next/server");
const list = await import("@/app/api/v1/codes/route");

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-11T12:00:00Z");
const HOUR = 3_600_000;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  fakeDb.defaults("qrCode", () => ({
    slugScope: "",
    contentType: "url",
    style: null,
    title: null,
    domainId: null,
    isActive: true,
    archivedAt: null,
    scanCount: 0,
    lastScannedAt: null,
    kind: "redirect",
    pageId: null,
    folderId: null,
    notes: null,
    isFavorite: false,
    pausedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  fakeDb.unique("qrCode", "id");
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.unique("qrCode", "domainId", "slug");
  fakeDb.seed("user", [{ id: "u_alice", banned: false, banExpires: null }]);
  fakeDb.seed("oauthApp", [{ id: "app_1", isActive: true }]);
  fakeDb.seed("oauthToken", [
    {
      id: "tok_write",
      accessTokenHash: sha256("write-token"),
      refreshTokenHash: sha256("write-token-refresh"),
      appId: "app_1",
      userId: "u_alice",
      scopes: ["codes:write"],
      accessTokenExpiresAt: new Date(NOW.getTime() + HOUR),
      refreshTokenExpiresAt: new Date(NOW.getTime() + 30 * 24 * HOUR),
      revokedAt: null,
    },
  ]);
  state.plan = "pro";
  state.defaultStyle = null;
  state.slugQueue = [];
  state.inserts = 0;
  state.blocked = new Set();
  state.unchecked = new Set();
  state.rechecked = [];
});

afterEach(() => {
  vi.useRealTimers();
});

function create(body: unknown, headers: Record<string, string> = {}) {
  return list.POST(
    new NextRequest(new URL("/api/v1/codes", ORIGIN), {
      method: "POST",
      headers: {
        authorization: "Bearer write-token",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

interface CodeJson {
  id: string;
  slug: string;
  destinationUrl: string;
  style?: unknown;
}
interface ErrorJson {
  code: string;
  message: string;
  data?: { details: { index?: number; path: string; message: string }[] };
}

const rows = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => ({
    destinationUrl: `https://example.com/item/${from + i}`,
    title: `Item ${from + i}`,
  }));

const codes = () => fakeDb.rows("qrCode");

// ─── Helpers ────────────────────────────────────────────────────────────────

describe("chunkRows", () => {
  it("caps each chunk by rows and by bytes, keeping order", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(chunkRows(items, { maxRows: 4 })).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9],
    ]);
    // 3 bytes each, 7 per chunk: two per chunk.
    expect(
      chunkRows(items.slice(0, 5), {
        maxRows: 100,
        maxBytes: 7,
        sizeOf: () => 3,
      }),
    ).toEqual([[0, 1], [2, 3], [4]]);
    // An item bigger than the budget still gets a chunk of its own.
    expect(
      chunkRows([1, 2], { maxRows: 9, maxBytes: 1, sizeOf: () => 5 }),
    ).toEqual([[1], [2]]);
    expect(chunkRows([], { maxRows: 3 })).toEqual([]);
  });
});

describe("uniqueSlugs", () => {
  it("never repeats a slug in the batch and rerolls taken ones", async () => {
    const sequence = [
      "aaaaaaa",
      "aaaaaaa",
      "bbbbbbb",
      "taken01",
      "ccccccc",
      "ddddddd",
    ];
    const generate = () => sequence.shift() ?? "zzzzzzz";
    const asked: string[][] = [];
    const slugs = await uniqueSlugs(
      3,
      async (candidates) => {
        asked.push(candidates);
        return new Set(candidates.filter((slug) => slug === "taken01"));
      },
      generate,
    );
    expect(slugs).toEqual(["aaaaaaa", "bbbbbbb", "ccccccc"]);
    expect(asked).toEqual([["aaaaaaa", "bbbbbbb", "taken01"], ["ccccccc"]]);
  });

  it("gives up after the last round", async () => {
    await expect(
      uniqueSlugs(1, async (candidates) => new Set(candidates), undefined, 2),
    ).rejects.toThrow(/free slugs/);
  });
});

describe("idempotentCodeId", () => {
  it("is stable for the same request and differs otherwise", () => {
    const id = idempotentCodeId("org_a", "key-1", 0, "row");
    expect(id).toMatch(/^c[0-9a-z]{24}$/);
    expect(idempotentCodeId("org_a", "key-1", 0, "row")).toBe(id);
    for (const other of [
      idempotentCodeId("org_b", "key-1", 0, "row"),
      idempotentCodeId("org_a", "key-2", 0, "row"),
      idempotentCodeId("org_a", "key-1", 1, "row"),
      idempotentCodeId("org_a", "key-1", 0, "row2"),
    ]) {
      expect(other).not.toBe(id);
    }
  });
});

// ─── POST /v1/codes with large arrays ───────────────────────────────────────

describe("POST /v1/codes batches", () => {
  it(`creates ${MAX_CODES_PER_REQUEST} codes in one request, in chunked inserts`, async () => {
    const response = await create(rows(MAX_CODES_PER_REQUEST));
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: CodeJson[] };
    expect(data).toHaveLength(MAX_CODES_PER_REQUEST);
    expect(data.map((code) => code.destinationUrl)).toEqual(
      rows(MAX_CODES_PER_REQUEST).map((row) => row.destinationUrl),
    );
    expect(new Set(data.map((code) => code.slug)).size).toBe(
      MAX_CODES_PER_REQUEST,
    );
    expect(codes()).toHaveLength(MAX_CODES_PER_REQUEST);
    // 250 rows per INSERT.
    expect(state.inserts).toBe(Math.ceil(MAX_CODES_PER_REQUEST / 250));
  });

  it(`refuses more than ${MAX_CODES_PER_REQUEST} codes up front`, async () => {
    const response = await create(rows(MAX_CODES_PER_REQUEST + 1));
    expect(response.status).toBe(400);
    expect(
      ((await response.json()) as ErrorJson).data?.details[0]?.message,
    ).toBe(
      `Send up to ${MAX_CODES_PER_REQUEST.toLocaleString("en-US")} codes per request`,
    );
    expect(codes()).toHaveLength(0);
  });

  it("generates slugs that collide neither within the batch nor with existing codes", async () => {
    fakeDb.seed("qrCode", [
      {
        id: "old",
        userId: "u_alice",
        organizationId: null,
        slug: "Taken00",
        slugScope: "",
        destinationUrl: "https://example.com/old",
      },
    ]);
    // The generator repeats itself and offers the existing slug first.
    state.slugQueue = ["Taken00", "Same000", "Same000", "Same000", "Fresh01"];
    const response = await create(rows(3));
    expect(response.status).toBe(201);
    const slugs = ((await response.json()) as { data: CodeJson[] }).data.map(
      (code) => code.slug,
    );
    expect(new Set(slugs).size).toBe(3);
    expect(slugs).not.toContain("Taken00");
    expect(slugs).toEqual(expect.arrayContaining(["Same000", "Fresh01"]));
  });

  it("lists every invalid row by index and creates nothing", async () => {
    const body = rows(6);
    body[2] = { destinationUrl: "ftp://example.com/x", title: "x" };
    body[5] = { destinationUrl: "not a url", title: "y" };
    const response = await create(body);
    expect(response.status).toBe(400);
    const error = (await response.json()) as ErrorJson;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toMatch(/^2 of 6 codes have problems/);
    expect(error.data?.details.map((detail) => detail.index)).toEqual([2, 5]);
    expect(error.data?.details[0]?.path).toBe("2.destinationUrl");
    expect(codes()).toHaveLength(0);
  });

  it("lists reserved, repeated and taken back-halves by index", async () => {
    fakeDb.seed("qrCode", [
      {
        id: "old",
        userId: "u_alice",
        organizationId: null,
        slug: "spring-menu",
        slugScope: "",
        destinationUrl: "https://example.com/old",
      },
    ]);
    const body = rows(4).map((row, i) => ({ ...row, slug: `menu-${i}` }));
    body[1] = { ...body[1], slug: "menu-0" } as (typeof body)[number];
    let response = await create(body);
    expect(response.status).toBe(400);
    let error = (await response.json()) as ErrorJson;
    expect(error.code).toBe("INVALID_SLUG");
    expect(error.data?.details).toEqual([
      {
        index: 1,
        path: "1.slug",
        message: "menu-0 is in the request more than once.",
      },
    ]);

    body[1] = { ...body[1], slug: "spring-menu" } as (typeof body)[number];
    body[3] = { ...body[3], slug: "spring-menu-2" } as (typeof body)[number];
    response = await create(body);
    expect(response.status).toBe(409);
    error = (await response.json()) as ErrorJson;
    expect(error.code).toBe("SLUG_TAKEN");
    expect(error.data?.details.map((detail) => detail.index)).toEqual([1]);
    expect(codes()).toHaveLength(1);
  });

  it("lists unsafe destinations by index", async () => {
    const body = rows(5);
    state.blocked = new Set([body[3]?.destinationUrl as string]);
    const response = await create(body);
    expect(response.status).toBe(422);
    const error = (await response.json()) as ErrorJson;
    expect(error.data?.details.map((detail) => detail.index)).toEqual([3]);
    expect(codes()).toHaveLength(0);
  });
});

describe("Web Risk re-checks", () => {
  it("marks the codes Web Risk didn't answer for and looks them up after the response", async () => {
    const body = rows(4);
    state.unchecked = new Set([
      body[1]?.destinationUrl as string,
      body[3]?.destinationUrl as string,
    ]);
    const response = await create(body);
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: CodeJson[] };
    const pending = codes().filter((row) => row.webRiskRecheckAt);
    expect(pending.map((row) => row.destinationUrl).sort()).toEqual(
      [body[1]?.destinationUrl, body[3]?.destinationUrl].sort(),
    );
    expect(state.rechecked).toEqual([[data[1]?.id, data[3]?.id]]);
  });

  it("has nothing to re-check when every lookup answered", async () => {
    await create(rows(3));
    expect(state.rechecked).toEqual([]);
    expect(codes().some((row) => row.webRiskRecheckAt)).toBe(false);
  });
});

describe("Idempotency-Key", () => {
  const key = { "idempotency-key": "batch-2026-11-11-a" };

  it("returns the first request's codes on a retry, creating nothing", async () => {
    const first = await create(rows(300), key);
    expect(first.status).toBe(201);
    expect(first.headers.get("idempotent-replayed")).toBe("false");
    const firstIds = ((await first.json()) as { data: CodeJson[] }).data.map(
      (code) => code.id,
    );
    const retry = await create(rows(300), key);
    expect(retry.status).toBe(201);
    expect(retry.headers.get("idempotent-replayed")).toBe("true");
    const retryData = ((await retry.json()) as { data: CodeJson[] }).data;
    expect(retryData.map((code) => code.id)).toEqual(firstIds);
    expect(codes()).toHaveLength(300);
  });

  it("finishes a request that was cut off part way", async () => {
    await create(rows(10), key);
    // As if the first try stopped after six rows.
    const kept = new Set(
      codes()
        .slice(0, 6)
        .map((row) => row.id),
    );
    for (const row of [...codes()]) {
      if (!kept.has(row.id as string)) codes().splice(codes().indexOf(row), 1);
    }
    expect(codes()).toHaveLength(6);
    const retry = await create(rows(10), key);
    expect(retry.status).toBe(201);
    expect(retry.headers.get("idempotent-replayed")).toBe("false");
    expect(codes()).toHaveLength(10);
    expect(new Set(codes().map((row) => row.destinationUrl)).size).toBe(10);
  });

  it("makes new codes for a new key, and for rows that changed", async () => {
    await create(rows(5), key);
    await create(rows(5), { "idempotency-key": "another" });
    expect(codes()).toHaveLength(10);
    const changed = rows(5);
    changed[4] = { destinationUrl: "https://example.com/changed", title: "c" };
    await create(changed, key);
    expect(codes()).toHaveLength(11);
  });

  it("refuses a key that isn't printable ASCII or is too long", async () => {
    for (const value of ["x".repeat(256), "clé"]) {
      const response = await create(rows(1), { "idempotency-key": value });
      expect(response.status, value).toBe(400);
    }
    expect(codes()).toHaveLength(0);
  });
});

describe("response size", () => {
  const logo = `data:image/png;base64,${"A".repeat(200_000)}`;

  it("refuses a batch whose designs wouldn't fit in a response, before creating anything", async () => {
    state.defaultStyle = { showLogo: true, customLogo: logo };
    const response = await create(rows(40));
    expect(response.status).toBe(413);
    const error = (await response.json()) as ErrorJson;
    expect(error.message).toMatch(/Prefer: return=minimal/);
    expect(codes()).toHaveLength(0);
  });

  it("returns codes without their design for Prefer: return=minimal", async () => {
    state.defaultStyle = { showLogo: true, customLogo: logo };
    const response = await create(rows(40), { prefer: "return=minimal" });
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as { data: CodeJson[] };
    expect(data).toHaveLength(40);
    expect(data[0]).not.toHaveProperty("style");
    expect(data[0]).toMatchObject({ slug: expect.any(String) });
    // The codes still carry the default design.
    expect(codes()[0]?.style).toMatchObject({ customLogo: logo });
  });
});
