// "What's new" cards, announcements and spotlights (lib/changelog-feed.ts,
// lib/spotlights.ts): which entries become sidebar cards, which one opens by
// itself, and how dismissed lists merge. Pure; nothing reads the disk or a
// database.
import { describe, expect, it } from "vitest";
import {
  addDays,
  appendRecent,
  type ChangelogItem,
  DISMISSED_LIMIT,
  dismissedStorageKey,
  FEATURE_CARD_LIMIT,
  featureCards,
  knownIds,
  pickAnnouncement,
  storedList,
} from "@/lib/changelog-feed";
import { activeSpotlight, spotlightStorageKey } from "@/lib/spotlights";

const item = (overrides: Partial<ChangelogItem>): ChangelogItem => ({
  slug: "entry",
  title: "Entry",
  description: "",
  date: "2026-11-01",
  tags: [],
  href: "/changelogs#entry",
  ...overrides,
});

const TODAY = "2026-11-13";

describe("addDays", () => {
  it("moves UTC days across months and years", () => {
    expect(addDays("2026-11-13", -60)).toBe("2026-09-14");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("featureCards", () => {
  const feed = [
    item({
      slug: "v0.3.0",
      date: "2026-11-05",
      version: "0.3.0",
      image: "/c/3.webp",
    }),
    item({
      slug: "v0.5.0",
      date: "2026-11-09",
      version: "0.5.0",
      image: "/c/5.webp",
    }),
    item({
      slug: "v0.2.0",
      date: "2026-11-05",
      version: "0.2.0",
      image: "/c/2.webp",
    }),
    item({
      slug: "v0.4.0",
      date: "2026-11-07",
      version: "0.4.0",
      image: "/c/4.webp",
    }),
    item({ slug: "no-picture", date: "2026-11-12" }),
  ];

  it("lists the newest entries with a picture, at most three", () => {
    const cards = featureCards(feed, { dismissed: [], today: TODAY });
    expect(cards.map((card) => card.slug)).toEqual([
      "v0.5.0",
      "v0.4.0",
      "v0.3.0",
    ]);
    expect(cards).toHaveLength(FEATURE_CARD_LIMIT);
  });

  it("orders same-day entries by version, highest first", () => {
    const cards = featureCards(feed, {
      dismissed: ["v0.5.0", "v0.4.0"],
      today: TODAY,
    });
    expect(cards.map((card) => card.slug)).toEqual(["v0.3.0", "v0.2.0"]);
  });

  it("leaves out dismissed entries, and the next one moves up", () => {
    const cards = featureCards(feed, { dismissed: ["v0.5.0"], today: TODAY });
    expect(cards.map((card) => card.slug)).toEqual([
      "v0.4.0",
      "v0.3.0",
      "v0.2.0",
    ]);
  });

  it("only shows entries from the last 60 days", () => {
    const old = [
      item({ slug: "edge", date: "2026-09-14", image: "/c/e.webp" }),
      item({ slug: "too-old", date: "2026-09-13", image: "/c/o.webp" }),
    ];
    expect(
      featureCards(old, { dismissed: [], today: TODAY }).map((c) => c.slug),
    ).toEqual(["edge"]);
  });

  it("shows nothing when every entry is dismissed or has no picture", () => {
    expect(
      featureCards(feed, {
        dismissed: ["v0.5.0", "v0.4.0", "v0.3.0", "v0.2.0"],
        today: TODAY,
      }),
    ).toEqual([]);
    expect(featureCards([], { dismissed: [], today: TODAY })).toEqual([]);
  });
});

describe("pickAnnouncement", () => {
  const announced = item({
    slug: "v0.6.0",
    date: "2026-11-12",
    version: "0.6.0",
    announce: true,
  });
  const older = item({
    slug: "v0.5.0",
    date: "2026-11-09",
    version: "0.5.0",
    announce: true,
  });
  const quiet = item({ slug: "v0.7.0", date: "2026-11-13", version: "0.7.0" });
  const base = {
    today: TODAY,
    signedUpAt: "2026-10-01T09:00:00.000Z",
    seenAt: "2026-11-01",
    dismissed: [] as string[],
  };

  it("picks the newest announced entry the person hasn't seen", () => {
    expect(pickAnnouncement([older, quiet, announced], base)?.slug).toBe(
      "v0.6.0",
    );
  });

  it("only ever considers the newest announced entry", () => {
    // Once v0.6.0 is closed, v0.5.0 doesn't follow on a later visit.
    expect(
      pickAnnouncement([older, announced], { ...base, dismissed: ["v0.6.0"] }),
    ).toBeNull();
  });

  it("shows once: not after it was closed or seen", () => {
    expect(
      pickAnnouncement([announced], { ...base, dismissed: ["v0.6.0"] }),
    ).toBeNull();
    // Opening What's new (or the entry) since its release counts as seen.
    expect(
      pickAnnouncement([announced], { ...base, seenAt: "2026-11-12" }),
    ).toBeNull();
  });

  it("never shows on the sign-up day", () => {
    expect(
      pickAnnouncement([announced], {
        ...base,
        signedUpAt: "2026-11-13T08:00:00.000Z",
        seenAt: null,
      }),
    ).toBeNull();
  });

  it("only announces what came out after the person joined", () => {
    expect(
      pickAnnouncement([announced], {
        ...base,
        signedUpAt: "2026-11-12T08:00:00.000Z",
        seenAt: null,
      }),
    ).toBeNull();
    expect(
      pickAnnouncement([announced], {
        ...base,
        signedUpAt: "2026-11-11T08:00:00.000Z",
        seenAt: null,
      })?.slug,
    ).toBe("v0.6.0");
  });

  it("needs a sign-up day and an announced entry", () => {
    expect(pickAnnouncement([announced], { ...base, signedUpAt: null })).toBe(
      null,
    );
    expect(pickAnnouncement([quiet], base)).toBeNull();
  });
});

describe("appendRecent", () => {
  it("adds to the end, moving one already there", () => {
    expect(appendRecent(["a", "b", "c"], ["b"])).toEqual(["a", "c", "b"]);
    expect(appendRecent([], ["a", "a"])).toEqual(["a"]);
  });

  it("keeps only the newest ones", () => {
    const full = Array.from({ length: DISMISSED_LIMIT }, (_, i) => `e${i}`);
    const next = appendRecent(full, ["new"]);
    expect(next).toHaveLength(DISMISSED_LIMIT);
    expect(next[0]).toBe("e1");
    expect(next.at(-1)).toBe("new");
    expect(appendRecent(["a", "b", "c"], ["d"], 2)).toEqual(["c", "d"]);
  });
});

describe("knownIds and storedList", () => {
  const known = new Set(["v0.4.0", "v0.5.0"]);

  it("drops unknown slugs, non-strings and repeats", () => {
    expect(
      knownIds(["v0.5.0", "nope", 4, null, "v0.5.0", "v0.4.0"], known),
    ).toEqual(["v0.5.0", "v0.4.0"]);
    expect(knownIds("v0.4.0", known)).toEqual(["v0.4.0"]);
    expect(knownIds({ slug: "v0.4.0" }, known)).toEqual([]);
    expect(knownIds(undefined, known)).toEqual([]);
  });

  it("takes at most `max` from one request", () => {
    expect(knownIds(["v0.4.0", "v0.5.0"], known, 1)).toEqual(["v0.4.0"]);
  });

  it("reads back only lists of strings", () => {
    expect(storedList(["a", 1, "b"])).toEqual(["a", "b"]);
    expect(storedList("a")).toEqual([]);
    expect(storedList(undefined)).toEqual([]);
  });
});

describe("storage keys and the spotlight queue", () => {
  it("keeps each person's copy apart", () => {
    expect(dismissedStorageKey("user_1")).toBe(
      "qrdx:whats-new-dismissed:user_1",
    );
    expect(dismissedStorageKey(null)).toBe("qrdx:whats-new-dismissed:anyone");
    expect(spotlightStorageKey("user_1")).toBe("qrdx:spotlights-seen:user_1");
  });

  it("shows one spotlight at a time, the first one waiting", () => {
    expect(activeSpotlight(["a", "b"], new Set())).toBe("a");
    expect(activeSpotlight(["a", "b"], new Set(["a"]))).toBe("b");
    expect(activeSpotlight(["a"], new Set(["a"]))).toBeNull();
    expect(activeSpotlight([], new Set())).toBeNull();
  });
});
