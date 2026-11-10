// The new-account cap on dynamic codes (lib/safety/velocity.ts): 30 an hour
// during an account's first days, and a full CSV import an hour
// (MAX_IMPORT_ROWS) when the codes go to a paid workspace.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMPORT_ROWS } from "@/lib/bulk-limits";
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

  it("lets a new account in a paid workspace make a full import", async () => {
    expect(NEW_PAID_ACCOUNT_CODES_PER_HOUR).toBe(MAX_IMPORT_ROWS);
    await expect(
      enforceNewAccountVelocity("u_new", MAX_IMPORT_ROWS - 20, { paid: true }),
    ).resolves.toBe(undefined);
    await expect(
      enforceNewAccountVelocity("u_new", MAX_IMPORT_ROWS - 19, { paid: true }),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining(
        `up to ${MAX_IMPORT_ROWS.toLocaleString("en-US")} dynamic codes per hour`,
      ),
    });
  });

  it("doesn't cap accounts past their first days", async () => {
    await expect(enforceNewAccountVelocity("u_old", 5000)).resolves.toBe(
      undefined,
    );
  });
});
