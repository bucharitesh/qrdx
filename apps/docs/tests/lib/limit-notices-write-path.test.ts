// A write path that crosses a limit while limit_notice can't be reached
// (an error such as a timeout, or no answer at all) still succeeds: the
// notice is fire and forget, and the problem is only logged. Runs the real
// createCodes against in-memory tables with email delivery switched on;
// sendEmail is a mock, so nothing is sent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, repoDatabase } from "../support/fake-db";

const state = vi.hoisted(() => ({ sent: 0 }));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({ success: true, reset: Date.now() + 60_000 }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => "free",
  getPlan: async () => "free",
}));
vi.mock("@/app/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/app/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => null,
  countThemesInScope: async () => 0,
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
// Production with email configured: notices would go out.
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => true,
}));
vi.mock("@/lib/feature-availability", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/feature-availability")>();
  return {
    ...actual,
    isFeatureAvailable: (id: string) =>
      id === "email" ? true : actual.isFeatureAvailable(id as never),
  };
});
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: true,
  sendEmail: async () => {
    state.sent += 1;
    return { sent: true, id: "em_1" };
  },
}));

const { createCodes } = await import("@/app/dashboard/codes/_lib/qr-codes");
const { NOTICE_TIMEOUT_MS } = await import("@/lib/limit-notices");

const scope = {
  userId: "u_alice",
  organizationId: "org_acme",
  role: "owner" as const,
};

/** Makes every insert into limit_notice do `fail()` instead. */
function breakLimitNotice(fail: () => Promise<never>) {
  const database = repoDatabase.database as {
    insert: (table: unknown) => unknown;
  };
  const realInsert = database.insert.bind(database);
  return vi.spyOn(database, "insert").mockImplementation(((table: unknown) =>
    table === repoDatabase.limitNotice
      ? {
          values: () => ({
            onConflictDoNothing: () => ({ returning: fail }),
          }),
        }
      : realInsert(table)) as never);
}

let errors: string[] = [];

beforeEach(() => {
  fakeDb.resetAll();
  state.sent = 0;
  errors = [];
  vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    errors.push(String(line));
  });
  fakeDb.seed("organization", [{ id: "org_acme", name: "Acme", slug: "acme" }]);
  fakeDb.defaults("qrCode", () => ({
    slugScope: "",
    kind: "redirect",
    isActive: true,
    scanCount: 0,
    archivedAt: null,
    deletedAt: null,
    domainId: null,
    pageId: null,
    folderId: null,
    style: null,
  }));
  // 8 of Free's 10: the next code reaches 90%.
  fakeDb.seed(
    "qrCode",
    Array.from({ length: 8 }, (_, i) => ({
      id: `c_${i}`,
      userId: "u_alice",
      organizationId: "org_acme",
      slug: `Seed${i}xx`,
      destinationUrl: "https://example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const create = () =>
  createCodes(scope, [{ destinationUrl: "https://example.com/new" } as never]);

describe("limit notices never fail the write", () => {
  it("creates the code when limit_notice errors (a timeout), and logs it", async () => {
    breakLimitNotice(() =>
      Promise.reject(
        Object.assign(new Error("Connection terminated due to timeout"), {
          code: "ETIMEDOUT",
        }),
      ),
    );
    const [created] = await create();
    expect(created?.destinationUrl).toBe("https://example.com/new");
    expect(fakeDb.rows("qrCode")).toHaveLength(9);
    await vi.waitFor(() =>
      expect(errors.some((line) => line.includes("limit_notice.failed"))).toBe(
        true,
      ),
    );
    expect(
      errors.find((line) => line.includes("limit_notice.failed")),
    ).toContain("Connection terminated due to timeout");
    expect(state.sent).toBe(0);
  });

  it("returns at once when limit_notice never answers, and gives up after the timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    breakLimitNotice(() => new Promise<never>(() => {}));
    const [created] = await create();
    expect(created).toBeDefined();
    expect(errors).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(NOTICE_TIMEOUT_MS + 1);
    expect(
      errors.some(
        (line) =>
          line.includes("limit_notice.failed") && line.includes("timed out"),
      ),
    ).toBe(true);
    expect(state.sent).toBe(0);
  });

  it("sends the notice when limit_notice works (the same write path)", async () => {
    fakeDb.seed("member", [
      {
        id: "m1",
        organizationId: "org_acme",
        userId: "u_alice",
        role: "owner",
      },
    ]);
    fakeDb.seed("user", [
      { id: "u_alice", email: "alice@example.com", banned: false },
    ]);
    await create();
    await vi.waitFor(() => expect(state.sent).toBe(1));
    expect(fakeDb.rows("limitNotice")).toMatchObject([
      { organizationId: "org_acme", limitId: "dynamicCodes", threshold: 90 },
    ]);
  });
});
