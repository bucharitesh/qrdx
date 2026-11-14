// A deployment's own abuse limits (SAFETY_*, lib/safety/limits.ts) reach the
// new-account cap (lib/safety/velocity.ts) and the Web Risk recheck pass
// (lib/safety/recheck.ts) in place of the public defaults.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({ lookups: 0 }));

vi.mock("@/lib/safety/limits", () => ({
  safetyLimits: () => ({
    youngAccountDays: 14,
    youngAccountDynamicPerHour: 5,
    recheckBatch: 2,
  }),
}));
vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/safety/web-risk", () => ({
  lookupWebRisk: async () => {
    state.lookups++;
    return { status: "safe" };
  },
}));
vi.mock("@/lib/events/worker-due", () => ({
  scheduleWorkerRun: async () => undefined,
}));

const velocity = await import("@/lib/safety/velocity");
const { recheckWebRisk } = await import("@/lib/safety/recheck");

const NOW = Date.now();
const DAY = 86_400_000;

beforeEach(() => {
  fakeDb.resetAll();
  state.lookups = 0;
});

describe("configured abuse limits", () => {
  it("keep an account new for the configured days", () => {
    expect(velocity.NEW_ACCOUNT_DAYS).toBe(14);
    expect(velocity.isNewAccount(new Date(NOW - 10 * DAY), new Date(NOW))).toBe(
      true,
    );
    expect(velocity.isNewAccount(new Date(NOW - 15 * DAY), new Date(NOW))).toBe(
      false,
    );
  });

  it("cap a new account at the configured codes an hour", async () => {
    expect(velocity.NEW_ACCOUNT_CODES_PER_HOUR).toBe(5);
    fakeDb.seed("user", [
      { id: "u_new", role: "user", createdAt: new Date(NOW - 3_600_000) },
    ]);
    fakeDb.seed("qrCode", [
      { id: "c1", userId: "u_new", createdAt: new Date(NOW - 60_000) },
      { id: "c2", userId: "u_new", createdAt: new Date(NOW - 60_000) },
    ]);
    await expect(velocity.enforceNewAccountVelocity("u_new", 3)).resolves.toBe(
      undefined,
    );
    await expect(
      velocity.enforceNewAccountVelocity("u_new", 4),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining(
        "During their first 14 days, accounts can create up to 5 dynamic codes per hour",
      ),
    });
  });

  it("look up the configured number of destinations per recheck pass", async () => {
    fakeDb.seed(
      "qrCode",
      Array.from({ length: 4 }, (_, i) => ({
        id: `c${i}`,
        userId: "u",
        organizationId: "org",
        slug: `c${i}`,
        destinationUrl: `https://shop.example.com/${i}`,
        isActive: true,
        webRiskRecheckAt: new Date(NOW - 1000 * (i + 1)),
      })),
    );
    const summary = await recheckWebRisk({ deadline: Date.now() + 5000 });
    expect(state.lookups).toBe(2);
    expect(summary.checked).toBe(2);
    // The two oldest were looked up; the other two wait for the next pass.
    expect(
      fakeDb
        .rows("qrCode")
        .filter((row) => row.webRiskRecheckAt)
        .map((row) => row.id)
        .sort(),
    ).toEqual(["c0", "c1"]);
  });
});
