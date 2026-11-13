// A community gallery's infinite scroll (app/(app)/(home)/community): the
// server draws page 1, and loadCommunityGalleryPage returns each page after
// it with the same filters, against in-memory tables (tests/support/
// fake-db) where the frames gallery is the engine's official library.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/log-error", () => ({ logError: vi.fn() }));
vi.mock("@/lib/community/viewer", () => ({ viewerId: async () => null }));
// next/font only works inside Next's compiler.
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }) => ({
    className: "",
    variable: `font-var${options.variable}`,
    style: { fontFamily: "" },
  });
  return {
    Bricolage_Grotesque: font,
    Cormorant_Garamond: font,
    DM_Sans: font,
    Fraunces: font,
    Instrument_Serif: font,
    Space_Grotesk: font,
  };
});

import { OFFICIAL_FRAME_COLLECTIONS, OFFICIAL_FRAMES } from "qrdx";
import {
  galleryCards,
  galleryHref,
  galleryListKey,
  galleryPerPage,
  groupOf,
  parseGalleryQuery,
} from "@/app/(app)/(home)/community/[type]/gallery";
import { loadCommunityGalleryPage } from "@/app/(app)/(home)/community/actions";
import { cardKey } from "@/components/community/item-card";
import { pageSlice } from "@/lib/paging";
import { fakeDb } from "../support/fake-db";

beforeEach(() => {
  fakeDb.resetAll();
});

/** Page 1 the way the page draws it, then every page the list loads. */
async function scrollThrough(type: string, params: Record<string, string>) {
  const query = parseGalleryQuery(type, params);
  if (!query) throw new Error("bad query");
  const { shown } = await galleryCards(query);
  const first = pageSlice(shown, 1, galleryPerPage(query.type));
  const keys = first.items.map(cardKey);
  const pages = [first.items.length];
  let next = first.nextPage;
  while (next !== null) {
    const page = await loadCommunityGalleryPage(type, params, next);
    expect(page.items.length).toBeGreaterThan(0);
    keys.push(...page.items.map((item) => item.key));
    pages.push(page.items.length);
    expect(page.nextPage === null || page.nextPage === next + 1).toBe(true);
    next = page.nextPage;
  }
  return { shown, keys, pages };
}

describe("community gallery pages", () => {
  it("load every frame once, a page at a time, in order", async () => {
    const { shown, keys, pages } = await scrollThrough("frame", {});
    expect(shown.length).toBe(OFFICIAL_FRAMES.length);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(shown.map(cardKey));
    expect(pages.slice(0, -1).every((size) => size === 24)).toBe(true);
  });

  it("keep the group filter on every page", async () => {
    const group = OFFICIAL_FRAME_COLLECTIONS.find(
      (item) =>
        OFFICIAL_FRAMES.filter((frame) => frame.collection === item.id).length >
        24,
    );
    if (!group) throw new Error("no group spans two pages");
    const { shown, keys } = await scrollThrough("frame", { group: group.id });
    expect(shown.length).toBeGreaterThan(24);
    expect(shown.every((card) => groupOf(card) === group.id)).toBe(true);
    expect(keys).toEqual(shown.map(cardKey));
  });

  it("keep the sort on every page", async () => {
    const popular = await scrollThrough("frame", {});
    const oldest = await scrollThrough("frame", { sort: "oldest" });
    expect(new Set(oldest.keys)).toEqual(new Set(popular.keys));
    expect(oldest.keys).toEqual(oldest.shown.map(cardKey));
  });

  it("answer nothing for page 1, pages past the end and bad input", async () => {
    const empty = { items: [], nextPage: null };
    expect(await loadCommunityGalleryPage("frame", {}, 1)).toEqual(empty);
    expect(await loadCommunityGalleryPage("frame", {}, 999)).toEqual(empty);
    expect(await loadCommunityGalleryPage("frame", {}, 2.5)).toEqual(empty);
    expect(await loadCommunityGalleryPage("theme", {}, 2)).toEqual(empty);
    expect(await loadCommunityGalleryPage("nope", {}, 2)).toEqual(empty);
    // Signed out, "mine" has nothing to page through.
    expect(
      await loadCommunityGalleryPage("frame", { from: "mine" }, 2),
    ).toEqual(empty);
  });
});

describe("gallery queries", () => {
  it("keep the filters a URL has and drop unknown ones", () => {
    const group = OFFICIAL_FRAME_COLLECTIONS[0]?.id ?? "";
    expect(
      parseGalleryQuery("frame", {
        from: "official",
        sort: ["newest"],
        group,
        tag: "cafe",
      }),
    ).toEqual({
      type: "frame",
      filter: "official",
      sort: "newest",
      group,
      // Frames have groups, not tags.
      tag: null,
    });
    expect(
      parseGalleryQuery("page-template", {
        from: "everything",
        sort: "random",
        group,
        tag: "cafe",
      }),
    ).toEqual({
      type: "page-template",
      filter: "all",
      sort: "popular",
      group: null,
      tag: "cafe",
    });
    expect(parseGalleryQuery("theme", {})).toBeNull();
  });

  it("link pages with the filters kept, and name each list apart", () => {
    const query = parseGalleryQuery("collection", {
      from: "community",
      sort: "oldest",
      tag: "menu",
    });
    if (!query) throw new Error("bad query");
    expect(galleryHref(query, { page: 3 })).toBe(
      "/community/collections?from=community&sort=oldest&tag=menu&page=3",
    );
    // A new filter starts over at page 1.
    expect(galleryHref(query, { filter: "official" })).toBe(
      "/community/collections?from=official&sort=oldest&tag=menu",
    );
    const other = parseGalleryQuery("collection", { from: "community" });
    if (!other) throw new Error("bad query");
    expect(galleryListKey(query)).not.toBe(galleryListKey(other));
  });

  it("draw shorter pages of page templates and kits", () => {
    expect(galleryPerPage("frame")).toBe(24);
    expect(galleryPerPage("collection")).toBe(24);
    expect(galleryPerPage("page-template")).toBe(6);
    expect(galleryPerPage("kit")).toBe(6);
  });
});
