// lib/paging.ts for lists held in memory: the numbered pages the community
// galleries render on the server and the pages their infinite list appends
// (components/infinite). The offset helpers are tested in
// tests/admin/paging.test.ts, appendUnique in tests/lib/cursor-list.test.ts.
import { describe, expect, it } from "vitest";
import { MAX_PAGE, pageSlice, parsePage, withPageParam } from "@/lib/paging";

describe("pageSlice", () => {
  const items = Array.from({ length: 50 }, (_, index) => index);

  it("cuts a page and says which page comes next", () => {
    expect(pageSlice(items, 1, 24)).toEqual({
      page: 1,
      pages: 3,
      items: items.slice(0, 24),
      nextPage: 2,
    });
    expect(pageSlice(items, 3, 24)).toMatchObject({
      page: 3,
      items: [48, 49],
      nextPage: null,
    });
  });

  it("clamps a page past the end, or a bad one, into range", () => {
    expect(pageSlice(items, 9, 24)).toMatchObject({ page: 3, nextPage: null });
    expect(pageSlice(items, Number.NaN, 24)).toMatchObject({ page: 1 });
    expect(pageSlice(items, parsePage("99999999"), 24)).toMatchObject({
      page: 3,
    });
    expect(parsePage("99999999")).toBe(MAX_PAGE);
    expect(pageSlice([], 4, 24)).toEqual({
      page: 1,
      pages: 1,
      items: [],
      nextPage: null,
    });
  });

  it("covers every item exactly once, page after page", () => {
    const seen: number[] = [];
    let page: number | null = 1;
    while (page !== null) {
      const slice: ReturnType<typeof pageSlice<number>> = pageSlice(
        items,
        page,
        7,
      );
      seen.push(...slice.items);
      page = slice.nextPage;
    }
    expect(seen).toEqual(items);
  });
});

describe("withPageParam", () => {
  it("keeps the list's filters, sort and search", () => {
    expect(
      withPageParam("/community/frames?from=official&sort=newest", 3),
    ).toBe("/community/frames?from=official&sort=newest&page=3");
    expect(withPageParam("/list?q=menu%20card&page=2", 4)).toBe(
      "/list?q=menu+card&page=4",
    );
  });

  it("drops the parameter for page 1 and keeps a hash", () => {
    expect(withPageParam("/community/kits?page=5&tag=cafe#top", 1)).toBe(
      "/community/kits?tag=cafe#top",
    );
    expect(withPageParam("/community/kits", 1)).toBe("/community/kits");
    expect(withPageParam("/list", 2, "p")).toBe("/list?p=2");
  });
});
