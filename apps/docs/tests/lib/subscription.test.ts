// Free-tier counting for AI requests with the database replaced by an
// in-memory table. The drizzle operators are swapped for predicates the fake
// table evaluates, so the real where-clauses in lib/subscription.ts decide
// which rows count. Nothing connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;
type Column = { table: string; name: string };

const store = vi.hoisted(() => ({ tables: new Map<string, Row[]>() }));

vi.mock("drizzle-orm", () => {
  const value = (row: Row, column: Column) => row[column.name];
  return {
    and:
      (...preds: (Predicate | undefined)[]) =>
      (row: Row) =>
        preds.every((p) => !p || p(row)),
    eq: (column: Column, expected: unknown) => (row: Row) =>
      value(row, column) === expected,
    inArray: (column: Column, list: unknown[]) => (row: Row) =>
      list.includes(value(row, column)),
    notInArray: (column: Column, list: unknown[]) => (row: Row) =>
      !list.includes(value(row, column)),
    count: () => ({ aggregate: "count" }),
    desc: (column: Column) => ({ desc: column }),
  };
});

vi.mock("@repo/database", () => {
  const table = (name: string, columns: string[]) =>
    Object.fromEntries([
      ["__table", name],
      ...columns.map((column) => [column, { table: name, name: column }]),
    ]);
  const rows = (t: { __table: string }) => {
    const name = t.__table;
    if (!store.tables.has(name)) store.tables.set(name, []);
    return store.tables.get(name) as Row[];
  };
  const aiUsage = table("ai_usage", [
    "id",
    "userId",
    "modelId",
    "daysSinceEpoch",
    "createdAt",
    "promptTokens",
    "completionTokens",
  ]);
  const database = {
    select: (shape?: Record<string, unknown>) => ({
      from: (t: { __table: string }) => {
        let where: Predicate = () => true;
        const run = (limit?: number) => {
          const matched = rows(t).filter(where);
          if (
            shape &&
            Object.values(shape).some(
              (v) => (v as { aggregate?: string })?.aggregate === "count",
            )
          ) {
            return [{ count: matched.length }];
          }
          return limit === undefined ? matched : matched.slice(0, limit);
        };
        const query = {
          where(predicate: Predicate) {
            where = predicate;
            return query;
          },
          orderBy: () => query,
          limit: (n: number) => Promise.resolve(run(n)),
          // biome-ignore lint/suspicious/noThenProperty: drizzle queries are awaitable builders
          then: (
            resolve: (value: unknown) => void,
            reject: (e: unknown) => void,
          ) => Promise.resolve(run()).then(resolve, reject),
        };
        return query;
      },
    }),
    insert: (t: { __table: string }) => ({
      values: (row: Row) => {
        rows(t).push({ ...row });
        return Promise.resolve();
      },
    }),
    delete: (t: { __table: string }) => ({
      where: (predicate: Predicate) => {
        const list = rows(t);
        for (let i = list.length - 1; i >= 0; i--) {
          if (predicate(list[i] as Row)) list.splice(i, 1);
        }
        return Promise.resolve();
      },
    }),
    update: (t: { __table: string }) => ({
      set: (patch: Row) => ({
        where: (predicate: Predicate) => {
          for (const row of rows(t))
            if (predicate(row)) Object.assign(row, patch);
          return Promise.resolve();
        },
      }),
    }),
  };
  return { aiUsage, database, __rows: rows };
});

vi.mock("@repo/database/schema", () => ({
  subscription: {
    __table: "subscription",
    userId: { table: "subscription", name: "userId" },
    status: { table: "subscription", name: "status" },
    createdAt: { table: "subscription", name: "createdAt" },
  },
}));

// lib/ai/art pulls in fal.ai and rate limiting; only its model ids matter here.
vi.mock("@/lib/ai/art", () => ({
  ART_MODEL_ID: "fal-ai/illusion-diffusion",
  ART_UPSCALE_MODEL_ID: "fal-ai/esrgan",
}));

const {
  finalizeAIRequest,
  releaseAIRequest,
  reserveAIRequest,
  validateSubscriptionAndUsage,
} = await import("@/lib/subscription");
const { AI_REQUEST_FREE_TIER_LIMIT } = await import("@/lib/constants");
const { SubscriptionRequiredError } = await import("@/types/errors");

const USER = "user-1";
const usage = () => store.tables.get("ai_usage") ?? [];
const addUsage = (modelId: string, userId = USER) =>
  usage().push({ id: `${modelId}-${usage().length}`, userId, modelId });
const subscribe = (status: string, userId = USER) => {
  if (!store.tables.has("subscription")) store.tables.set("subscription", []);
  store.tables
    .get("subscription")
    ?.push({ userId, status, createdAt: new Date() });
};

beforeEach(() => {
  store.tables.clear();
  store.tables.set("ai_usage", []);
});

describe("validateSubscriptionAndUsage", () => {
  it("gives a new free user the whole free tier", async () => {
    expect(await validateSubscriptionAndUsage(USER)).toEqual({
      canProceed: true,
      isSubscribed: false,
      requestsUsed: 0,
      requestsRemaining: AI_REQUEST_FREE_TIER_LIMIT,
    });
  });

  it("does not count AI art or upscales against the free tier", async () => {
    for (let i = 0; i < 20; i++) addUsage("fal-ai/illusion-diffusion");
    addUsage("fal-ai/esrgan");
    addUsage("gemini-2.5-flash");
    const result = await validateSubscriptionAndUsage(USER);
    expect(result.requestsUsed).toBe(1);
    expect(result.canProceed).toBe(true);
  });

  it("only counts the user's own requests", async () => {
    for (let i = 0; i < 10; i++) addUsage("gemini-2.5-flash", "someone-else");
    expect((await validateSubscriptionAndUsage(USER)).requestsUsed).toBe(0);
  });

  it("blocks a free user at the limit with a clear message", async () => {
    for (let i = 0; i < AI_REQUEST_FREE_TIER_LIMIT; i++)
      addUsage("gemini-2.5-flash");
    const result = await validateSubscriptionAndUsage(USER);
    expect(result).toMatchObject({ canProceed: false, requestsRemaining: 0 });
    expect(result.error).toMatch(
      new RegExp(`free limit of ${AI_REQUEST_FREE_TIER_LIMIT}`),
    );
  });

  it.each([
    "active",
    "trialing",
  ])("lets a %s subscriber through without a limit", async (status) => {
    subscribe(status);
    for (let i = 0; i < 50; i++) addUsage("gemini-2.5-flash");
    expect(await validateSubscriptionAndUsage(USER)).toMatchObject({
      canProceed: true,
      isSubscribed: true,
      requestsRemaining: Number.POSITIVE_INFINITY,
    });
  });

  it.each([
    "canceled",
    "past_due",
    "unpaid",
    "incomplete",
    "incomplete_expired",
  ])("treats a %s subscription as free", async (status) => {
    subscribe(status);
    for (let i = 0; i < AI_REQUEST_FREE_TIER_LIMIT; i++)
      addUsage("gemini-2.5-flash");
    expect(await validateSubscriptionAndUsage(USER)).toMatchObject({
      canProceed: false,
      isSubscribed: false,
    });
  });
});

describe("reserveAIRequest", () => {
  it("records a usage row and returns its id", async () => {
    const id = await reserveAIRequest(USER, "gemini-2.5-flash");
    expect(usage()).toHaveLength(1);
    expect(usage()[0]).toMatchObject({
      id,
      userId: USER,
      modelId: "gemini-2.5-flash",
    });
  });

  it("allows exactly the free-tier number of requests, then rolls back and refuses", async () => {
    for (let i = 0; i < AI_REQUEST_FREE_TIER_LIMIT; i++) {
      await reserveAIRequest(USER, "gemini-2.5-flash");
    }
    await expect(
      reserveAIRequest(USER, "gemini-2.5-flash"),
    ).rejects.toBeInstanceOf(SubscriptionRequiredError);
    expect(usage()).toHaveLength(AI_REQUEST_FREE_TIER_LIMIT);
  });

  it("never lets parallel requests exceed the free tier", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        reserveAIRequest(USER, "gemini-2.5-flash"),
      ),
    );
    const granted = results.filter((r) => r.status === "fulfilled").length;
    expect(granted).toBeLessThanOrEqual(AI_REQUEST_FREE_TIER_LIMIT);
    expect(usage().length).toBe(granted);
  });

  it("does not let art usage block free theme requests", async () => {
    for (let i = 0; i < 30; i++) addUsage("fal-ai/illusion-diffusion");
    await expect(reserveAIRequest(USER, "gemini-2.5-flash")).resolves.toEqual(
      expect.any(String),
    );
  });

  it("never limits subscribers", async () => {
    subscribe("active");
    for (let i = 0; i < 20; i++)
      await reserveAIRequest(USER, "gemini-2.5-flash");
    expect(usage()).toHaveLength(20);
  });
});

describe("finalize and release", () => {
  it("stores token counts on the reserved row", async () => {
    const id = await reserveAIRequest(USER, "gemini-2.5-flash");
    await finalizeAIRequest(id, { inputTokens: 120, outputTokens: 30 });
    expect(usage()[0]).toMatchObject({
      promptTokens: "120",
      completionTokens: "30",
    });
    await finalizeAIRequest(id, {});
    expect(usage()[0]).toMatchObject({
      promptTokens: "0",
      completionTokens: "0",
    });
  });

  it("refunds a reserved request", async () => {
    const id = await reserveAIRequest(USER, "gemini-2.5-flash");
    await releaseAIRequest(id);
    expect(usage()).toHaveLength(0);
  });
});
