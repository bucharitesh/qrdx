// The "What's new" and spotlight server actions (actions/changelog.ts,
// actions/spotlights.ts) are public: they store only slugs of built-in
// changelog entries and known spotlight ids, for the signed-in person, as
// one merge that keeps the list capped. Nothing connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Fragment {
  text: string;
  values: unknown[];
}

const state = vi.hoisted(() => ({
  session: { user: { id: "user_1" } } as { user: { id: string } } | null,
  writes: [] as Array<{ settings: Fragment; where: unknown }>,
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
      set: (values: { settings: Fragment }) => ({
        where: async (where: unknown) => {
          if (state.fail) throw new Error("connection lost");
          state.writes.push({ settings: values.settings, where });
        },
      }),
    }),
  },
}));
vi.mock("@/lib/changelog-feed-server", () => {
  const feed = [
    { slug: "v0.5.0", date: "2026-11-09" },
    { slug: "v0.4.0", date: "2026-11-07" },
  ];
  return {
    getChangelogFeed: () => feed,
    changelogSlugs: () => new Set(feed.map((entry) => entry.slug)),
  };
});
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const { dismissWhatsNew, markChangelogEntrySeen } = await import(
  "@/actions/changelog"
);
const { markSpotlightSeen } = await import("@/actions/spotlights");

/** Every value in a fragment, nested fragments included. */
function valuesOf(fragment: Fragment): unknown[] {
  return fragment.values.flatMap((value) =>
    value && typeof value === "object" && "values" in value
      ? valuesOf(value as Fragment)
      : [value],
  );
}

/** The fragment's SQL text, nested fragments included. */
function textOf(fragment: Fragment): string {
  return [
    fragment.text,
    ...fragment.values
      .filter(
        (value): value is Fragment =>
          typeof value === "object" && value !== null && "text" in value,
      )
      .map(textOf),
  ].join(" ");
}

beforeEach(() => {
  state.session = { user: { id: "user_1" } };
  state.writes = [];
  state.fail = false;
});

describe("dismissWhatsNew", () => {
  it("does nothing when signed out", async () => {
    state.session = null;
    expect(await dismissWhatsNew(["v0.5.0"])).toEqual({ ok: false });
    expect(state.writes).toHaveLength(0);
  });

  it("stores only slugs of built-in entries, for the signed-in person", async () => {
    expect(
      await dismissWhatsNew(["v0.5.0", "made-up", 7, "v0.5.0", "v0.4.0"]),
    ).toEqual({ ok: true, dismissed: ["v0.5.0", "v0.4.0"] });
    const write = state.writes[0];
    expect(write?.where).toEqual({ column: "user.id", value: "user_1" });
    const values = valuesOf(write?.settings as Fragment);
    expect(values).toContain("whatsNewDismissed");
    expect(values).toContain(JSON.stringify(["v0.5.0", "v0.4.0"]));
    expect(values.join(" ")).not.toContain("made-up");
  });

  it("writes nothing when no slug is known", async () => {
    expect(await dismissWhatsNew(["made-up", { slug: "v0.5.0" }])).toEqual({
      ok: false,
    });
    expect(await dismissWhatsNew("2099-01-01")).toEqual({ ok: false });
    expect(state.writes).toHaveLength(0);
  });

  it("merges into the stored list and keeps the newest 50", async () => {
    await dismissWhatsNew("v0.4.0");
    const settings = state.writes[0]?.settings as Fragment;
    const text = textOf(settings);
    // One statement: the other settings stay, the list is appended to and
    // capped, and anything that isn't a list of strings is ignored.
    expect(text).toContain("|| jsonb_build_object(");
    expect(text).toContain("jsonb_array_elements(");
    expect(text).toContain("jsonb_typeof(prev.value) = 'string'");
    expect(text).toContain("limit ?");
    expect(valuesOf(settings)).toContain(50);
  });

  it("reports a failed write without throwing", async () => {
    state.fail = true;
    expect(await dismissWhatsNew(["v0.5.0"])).toEqual({ ok: false });
  });
});

describe("markChangelogEntrySeen", () => {
  it("stores the entry's own day, never moving back", async () => {
    expect(await markChangelogEntrySeen("v0.4.0")).toEqual({
      ok: true,
      seenAt: "2026-11-07",
    });
    const settings = state.writes[0]?.settings as Fragment;
    expect(settings.text).toContain("jsonb_build_object('changelogSeenAt'");
    expect(settings.text).toContain("greatest(");
    expect(settings.values).toContain("2026-11-07");
  });

  it("stores nothing for an unknown slug or when signed out", async () => {
    expect(await markChangelogEntrySeen("2099-01-01")).toEqual({ ok: false });
    state.session = null;
    expect(await markChangelogEntrySeen("v0.4.0")).toEqual({ ok: false });
    expect(state.writes).toHaveLength(0);
  });
});

describe("markSpotlightSeen", () => {
  it("stores a known spotlight id", async () => {
    expect(await markSpotlightSeen("passkey-second-step")).toEqual({
      ok: true,
      id: "passkey-second-step",
    });
    const values = valuesOf(state.writes[0]?.settings as Fragment);
    expect(values).toContain("spotlightsSeen");
    expect(values).toContain(JSON.stringify(["passkey-second-step"]));
  });

  it("drops unknown ids and lists", async () => {
    expect(await markSpotlightSeen("made-up")).toEqual({ ok: false });
    expect(await markSpotlightSeen(["made-up", "passkey-second-step"])).toEqual(
      { ok: true, id: "passkey-second-step" },
    );
    expect(state.writes).toHaveLength(1);
  });

  it("does nothing when signed out", async () => {
    state.session = null;
    expect(await markSpotlightSeen("passkey-second-step")).toEqual({
      ok: false,
    });
    expect(state.writes).toHaveLength(0);
  });
});
