// Community full-text search (lib/community/search.ts, manual-sql/0017):
// queries are built from letters and digits only, searchCommunity uses
// Postgres full-text search once 0017's index is valid and otherwise (or
// when it fails) keeps today's in-memory search, and the SQL files are
// additive, concurrent and idempotent with a dry run first.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityItemCard } from "@/lib/community/types";

const state = vi.hoisted(() => ({
  available: false,
  fullText: vi.fn(),
  listItems: vi.fn(),
  logged: [] as string[],
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/log-error", () => ({
  logError: (_error: Error, context: { action?: string }) =>
    state.logged.push(String(context.action)),
}));
vi.mock("@/lib/community/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/community/search")>()),
  fullTextSearchAvailable: async () => state.available,
}));
vi.mock("@/lib/community/queries", () => ({
  getItem: vi.fn(),
  listFrames: async () => [],
  listItems: (...args: unknown[]) => state.listItems(...args),
  searchItemsFullText: (...args: unknown[]) => state.fullText(...args),
}));

import { searchCommunity } from "@/lib/community/api";
import { searchWords, toPrefixQuery } from "@/lib/community/search";

const card = (slug: string, name: string): CommunityItemCard => ({
  id: `ci_${slug}`,
  type: "theme",
  slug,
  name,
  description: null,
  creator: {
    profileId: "p1",
    handle: "qrdx",
    displayName: "QRdx",
    avatarUrl: null,
    official: true,
    verified: true,
  },
  isOfficial: true,
  version: 1,
  likeCount: 0,
  saveCount: 0,
  useCount: 0,
  tags: [],
  publishedAt: null,
  preview: {},
});

beforeEach(() => {
  state.available = false;
  state.fullText.mockReset();
  state.listItems.mockReset();
  state.listItems.mockResolvedValue([
    card("wifi-navy", "Wi-Fi navy"),
    card("bistro-ink", "Bistro ink"),
  ]);
  state.logged.length = 0;
});

describe("toPrefixQuery", () => {
  it("matches every word as a prefix, accents and punctuation dropped", () => {
    expect(toPrefixQuery("Wi-Fi  Café!")).toBe("wifi:* & cafe:*");
    expect(searchWords("Wi-Fi  Café!")).toEqual(["wifi", "cafe"]);
    expect(toPrefixQuery("   ")).toBeNull();
    expect(toPrefixQuery("!!! &&")).toBeNull();
  });

  it("can't change the query's syntax", () => {
    expect(toPrefixQuery("a & b | !c:* (d) 'e'")).toBe(
      "a:* & b:* & c:* & d:* & e:*",
    );
    expect(toPrefixQuery("one two three four five six seven eight nine")).toBe(
      "one:* & two:* & three:* & four:* & five:* & six:* & seven:* & eight:*",
    );
  });
});

describe("searchCommunity", () => {
  it("keeps the in-memory search until 0017's index is there", async () => {
    const result = await searchCommunity({ type: "theme", q: "bistro" });
    expect(state.fullText).not.toHaveBeenCalled();
    expect(result.items.map((item) => item.id)).toEqual(["theme:bistro-ink"]);
  });

  it("uses Postgres full-text search once the index is valid", async () => {
    state.available = true;
    state.fullText.mockResolvedValue({
      cards: [card("wifi-navy", "Wi-Fi navy")],
      total: 7,
    });
    const result = await searchCommunity({
      type: "theme",
      q: "Wi-Fi",
      tag: "Minimal",
      limit: 5,
      offset: 10,
    });
    expect(state.fullText).toHaveBeenCalledWith({
      query: "wifi:*",
      words: ["wifi"],
      type: "theme",
      tag: "minimal",
      limit: 5,
      offset: 10,
    });
    expect(state.listItems).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      total: 7,
      items: [{ id: "theme:wifi-navy" }],
    });
  });

  it("falls back to the in-memory search when full-text search fails", async () => {
    state.available = true;
    state.fullText.mockRejectedValue(new Error("syntax error in tsquery"));
    const result = await searchCommunity({ type: "theme", q: "bistro" });
    expect(result.items.map((item) => item.id)).toEqual(["theme:bistro-ink"]);
    expect(state.logged).toEqual(["community full-text search"]);
  });

  it("doesn't search the index without words", async () => {
    state.available = true;
    await searchCommunity({ type: "theme", q: "  " });
    expect(state.fullText).not.toHaveBeenCalled();
  });
});

describe("the SQL", () => {
  const dir = join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "packages",
    "database",
    "manual-sql",
  );
  const read = (file: string) => readFileSync(join(dir, file), "utf8");
  const statements = (text: string) =>
    text
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

  for (const file of [
    "0017_community_search.sql",
    "0018_community_use_preset_index.sql",
  ]) {
    it(`${file}: a dry run first, then one concurrent, idempotent index`, () => {
      const text = read(file);
      const code = statements(text);
      // The read-only dry run comes before the one write.
      expect(text).toContain("Dry run");
      expect(code.indexOf("SELECT")).toBeGreaterThan(-1);
      expect(code.indexOf("SELECT")).toBeLessThan(code.indexOf("CREATE INDEX"));
      expect(code.match(/CREATE INDEX/g)).toHaveLength(1);
      expect(code).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/);
      expect(code).not.toMatch(
        /\b(DROP|DELETE|UPDATE|ALTER|TRUNCATE|INSERT|BEGIN|COMMIT)\b/i,
      );
    });
  }

  it("indexes exactly the document the app queries", () => {
    const flat = (text: string) => text.replace(/\s+/g, "").replace(/"/g, "");
    expect(flat(statements(read("0017_community_search.sql")))).toContain(
      flat(
        "to_tsvector('simple'::regconfig, coalesce(name, '') || ' ' || coalesce(description, ''))",
      ),
    );
  });
});
