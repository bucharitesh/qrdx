// "What's new" in the app shell (lib/changelog-feed.ts): which entries come
// first and which are new for someone. Pure; the content source is faked,
// and the real entries are read from disk only to check their dates and
// anchors.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  type ChangelogItem,
  changelogAnchor,
  effectiveSeenAt,
  isUnread,
  laterDay,
  newestDay,
  seenStorageKey,
  sortChangelog,
  toDay,
  unreadCount,
  unreadLabel,
} from "@/lib/changelog-feed";

const pages = vi.hoisted(() => ({
  list: [] as Array<{
    slugs: string[];
    data: {
      title: string;
      description?: string;
      date: string;
      version?: string;
      tags?: string[];
    };
  }>,
}));
vi.mock("@/lib/source", () => ({
  changelogSource: { getPages: () => pages.list },
}));
vi.mock("@repo/database", () => ({ database: {} }));

const { getChangelogFeed } = await import("@/lib/changelog-feed-server");

const item = (overrides: Partial<ChangelogItem>): ChangelogItem => ({
  slug: "entry",
  title: "Entry",
  description: "",
  date: "2026-10-31",
  tags: [],
  href: "/changelogs#entry",
  ...overrides,
});

describe("toDay and laterDay", () => {
  it("normalizes days, timestamps and dates to UTC days", () => {
    expect(toDay("2026-11-01")).toBe("2026-11-01");
    expect(toDay("2026-11-01T23:30:00.000Z")).toBe("2026-11-01");
    expect(toDay(new Date("2026-03-05T10:00:00Z"))).toBe("2026-03-05");
    expect(toDay("not a date")).toBeNull();
    expect(toDay(null)).toBeNull();
  });

  it("picks the later day, ignoring missing ones", () => {
    expect(laterDay("2026-10-31", "2026-11-01")).toBe("2026-11-01");
    expect(laterDay("2026-11-01", null)).toBe("2026-11-01");
    expect(laterDay(null, undefined)).toBeNull();
  });
});

describe("sortChangelog", () => {
  it("puts the newest day first, then the higher version on the same day", () => {
    const sorted = sortChangelog([
      item({ slug: "v0.0.6", date: "2026-10-31", version: "0.0.6" }),
      item({ slug: "v0.0.1", date: "2025-12-22", version: "0.0.1" }),
      item({ slug: "qrdx-0.0.47", date: "2026-11-01" }),
      item({ slug: "v0.1.0", date: "2026-10-31", version: "0.1.0" }),
    ]);
    expect(sorted.map((entry) => entry.slug)).toEqual([
      "qrdx-0.0.47",
      "v0.1.0",
      "v0.0.6",
      "v0.0.1",
    ]);
  });

  it("finds the newest day", () => {
    expect(
      newestDay([item({ date: "2026-03-05" }), item({ date: "2026-11-01" })]),
    ).toBe("2026-11-01");
    expect(newestDay([])).toBeNull();
  });
});

describe("unread", () => {
  const feed = [
    item({ slug: "a", date: "2026-11-01" }),
    item({ slug: "b", date: "2026-10-31" }),
    item({ slug: "c", date: "2026-10-31" }),
    item({ slug: "d", date: "2026-09-02" }),
  ];

  it("counts entries after the day seen; the day itself counts as seen", () => {
    expect(unreadCount(feed, "2026-10-31")).toBe(1);
    expect(unreadCount(feed, "2026-10-30")).toBe(3);
    expect(unreadCount(feed, "2026-11-01")).toBe(0);
    expect(isUnread(feed[0] as ChangelogItem, "2026-10-31")).toBe(true);
    expect(isUnread(feed[1] as ChangelogItem, "2026-10-31")).toBe(false);
  });

  it("treats everything as new when nothing was ever seen", () => {
    expect(unreadCount(feed, null)).toBe(4);
  });

  it("starts a new account at its sign-up day, not at the first release", () => {
    expect(
      effectiveSeenAt({
        stored: null,
        local: null,
        signedUpAt: "2026-11-02T08:00:00.000Z",
      }),
    ).toBe("2026-11-02");
    expect(
      unreadCount(
        feed,
        effectiveSeenAt({
          stored: null,
          local: null,
          signedUpAt: "2026-10-31",
        }),
      ),
    ).toBe(1);
  });

  it("takes the later of the account's day and this browser's", () => {
    expect(
      effectiveSeenAt({
        stored: "2026-10-31",
        local: "2026-11-01",
        signedUpAt: "2025-01-01",
      }),
    ).toBe("2026-11-01");
    expect(
      effectiveSeenAt({
        stored: "2026-11-01",
        local: "2026-09-02",
        signedUpAt: "2025-01-01",
      }),
    ).toBe("2026-11-01");
  });

  it("caps the badge at 9+ and keys this browser's copy by person", () => {
    expect(unreadLabel(3)).toBe("3");
    expect(unreadLabel(12)).toBe("9+");
    expect(seenStorageKey("user_1")).toBe("qrdx:changelog-seen:user_1");
  });
});

describe("getChangelogFeed", () => {
  it("maps entries newest first, limited, with /changelogs anchors", () => {
    pages.list = [
      {
        slugs: ["v0.0.5"],
        data: {
          title: "Google Drive integration",
          date: "2026-09-02",
          version: "0.0.5",
          tags: ["Integrations"],
        },
      },
      {
        slugs: ["qrdx-0.0.47"],
        data: {
          title: "qrdx 0.0.47",
          description: "Library release",
          date: "2026-11-01",
        },
      },
      {
        slugs: ["broken"],
        data: { title: "No date", date: "someday" },
      },
    ];
    const feed = getChangelogFeed(5);
    expect(feed.map((entry) => entry.slug)).toEqual(["qrdx-0.0.47", "v0.0.5"]);
    expect(feed[0]).toEqual({
      slug: "qrdx-0.0.47",
      title: "qrdx 0.0.47",
      description: "Library release",
      date: "2026-11-01",
      tags: [],
      href: "/changelogs#qrdx-0.0.47",
    });
    expect(feed[1]?.version).toBe("0.0.5");
    expect(getChangelogFeed(1)).toHaveLength(1);
  });
});

describe("content/changelog", () => {
  const dir = path.resolve(import.meta.dirname, "../../content/changelog");
  const files = readdirSync(dir).filter((file) => file.endsWith(".mdx"));

  it("dates every entry as a day, so unread maths works", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), "utf8");
      const date = /^date:\s*"?([^"\n]+)"?/m.exec(source)?.[1];
      expect(date && toDay(date), file).toBe(date);
    }
  });

  it("gives every entry a distinct anchor", () => {
    const anchors = files.map((file) =>
      changelogAnchor([file.replace(/\.mdx$/, "")]),
    );
    expect(new Set(anchors).size).toBe(anchors.length);
  });
});
