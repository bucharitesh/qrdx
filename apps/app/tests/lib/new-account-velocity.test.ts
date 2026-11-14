// The new-account cap on dynamic codes (lib/safety/velocity.ts): 30 an hour
// during an account's first days, and a full CSV import an hour
// (NEW_PAID_ACCOUNT_CODES_PER_HOUR, 2,000) when the codes go to a paid
// workspace. The 429 says when the request will fit.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

const {
  enforceNewAccountVelocity,
  NEW_ACCOUNT_CODES_PER_HOUR,
  NEW_PAID_ACCOUNT_CODES_PER_HOUR,
} = await import("@/lib/safety/velocity");

const NOW = Date.now();

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.seed("user", [
    { id: "u_new", role: "user", createdAt: new Date(NOW - 3_600_000) },
    { id: "u_old", role: "user", createdAt: new Date(NOW - 30 * 86_400_000) },
  ]);
  fakeDb.seed(
    "qrCode",
    Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      userId: "u_new",
      createdAt: new Date(NOW - 60_000),
    })),
  );
});

describe("enforceNewAccountVelocity", () => {
  it("caps a new free account at 30 codes an hour", async () => {
    expect(NEW_ACCOUNT_CODES_PER_HOUR).toBe(30);
    await expect(enforceNewAccountVelocity("u_new", 10)).resolves.toBe(
      undefined,
    );
    await expect(enforceNewAccountVelocity("u_new", 11)).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      message: expect.stringContaining("up to 30 dynamic codes per hour"),
    });
  });

  it("lets a new account in a paid workspace create 2,000 an hour", async () => {
    expect(NEW_PAID_ACCOUNT_CODES_PER_HOUR).toBe(2000);
    await expect(
      enforceNewAccountVelocity("u_new", 1980, { paid: true }),
    ).resolves.toBe(undefined);
    await expect(
      enforceNewAccountVelocity("u_new", 1981, { paid: true }),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("up to 2,000 dynamic codes per hour"),
    });
  });

  it("says when a request will fit: once enough codes have left the hour", async () => {
    // 20 codes made 1 minute ago, 30 made 50 minutes ago: 50 in the hour.
    fakeDb.seed(
      "qrCode",
      Array.from({ length: 30 }, (_, i) => ({
        id: `old${i}`,
        userId: "u_new",
        createdAt: new Date(NOW - 50 * 60_000),
      })),
    );
    // 50 + 1960 = 2010: ten must leave, the oldest ten go in 10 minutes.
    const error = (await enforceNewAccountVelocity("u_new", 1960, {
      paid: true,
    }).catch((caught: unknown) => caught)) as {
      headers: Record<string, string>;
      message: string;
    };
    const retryAfter = Number(error.headers["Retry-After"]);
    expect(retryAfter).toBeGreaterThan(9 * 60);
    expect(retryAfter).toBeLessThanOrEqual(10 * 60 + 1);
    expect(error.message).toMatch(
      /You can create these 1,960 in 10 minutes\.$/,
    );
    // Needing room the 1-minute-old codes hold means most of an hour.
    const later = (await enforceNewAccountVelocity("u_new", 1990, {
      paid: true,
    }).catch((caught: unknown) => caught)) as {
      headers: Record<string, string>;
    };
    expect(Number(later.headers["Retry-After"])).toBeGreaterThan(58 * 60);
  });

  it("asks for smaller requests than the hourly cap", async () => {
    await expect(enforceNewAccountVelocity("u_new", 40)).rejects.toMatchObject({
      message: expect.stringContaining("send at most 30 at a time"),
    });
  });

  it("doesn't cap accounts past their first days", async () => {
    await expect(enforceNewAccountVelocity("u_old", 5000)).resolves.toBe(
      undefined,
    );
  });
});
