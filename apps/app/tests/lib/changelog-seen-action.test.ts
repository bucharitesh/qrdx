// markChangelogSeen (actions/changelog.ts) is a public server action: it
// stores the newest released day for the signed-in person only, never a day
// the caller picks. Nothing connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: { user: { id: "user_1" } } as { user: { id: string } } | null,
  writes: [] as Array<{
    settings: { text: string; values: unknown[] };
    where: unknown;
  }>,
  fail: false,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => state.session } },
}));
vi.mock("@repo/database/schema", () => ({
  user: { id: "user.id", settings: "user.settings" },
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join("?"),
    values,
  }),
}));
vi.mock("@repo/database", () => ({
  database: {
    update: () => ({
      set: (values: { settings: { text: string; values: unknown[] } }) => ({
        where: async (where: unknown) => {
          if (state.fail) throw new Error("connection lost");
          state.writes.push({ settings: values.settings, where });
        },
      }),
    }),
  },
}));
vi.mock("@/lib/changelog-feed-server", () => ({
  getChangelogFeed: () => [
    { slug: "b", date: "2026-10-31" },
    { slug: "a", date: "2026-11-01" },
  ],
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const { markChangelogSeen } = await import("@/actions/changelog");

beforeEach(() => {
  state.session = { user: { id: "user_1" } };
  state.writes = [];
  state.fail = false;
});

describe("markChangelogSeen", () => {
  it("does nothing when signed out", async () => {
    state.session = null;
    expect(await markChangelogSeen()).toEqual({ ok: false });
    expect(state.writes).toHaveLength(0);
  });

  it("stores the newest released day for the signed-in person", async () => {
    expect(await markChangelogSeen()).toEqual({
      ok: true,
      seenAt: "2026-11-01",
    });
    expect(state.writes).toHaveLength(1);
    const write = state.writes[0];
    expect(write?.where).toEqual({ column: "user.id", value: "user_1" });
    // One merge that keeps other settings and never moves the day back.
    expect(write?.settings.text).toContain(
      "jsonb_build_object('changelogSeenAt'",
    );
    expect(write?.settings.text).toContain("greatest(");
    expect(write?.settings.values).toContain("2026-11-01");
  });

  it("ignores anything the caller sends", async () => {
    await (markChangelogSeen as (input: unknown) => Promise<unknown>)(
      "2099-01-01",
    );
    expect(state.writes[0]?.settings.values).not.toContain("2099-01-01");
  });

  it("reports a failed write without throwing", async () => {
    state.fail = true;
    expect(await markChangelogSeen()).toEqual({ ok: false });
  });
});
