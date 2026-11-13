// The dashboard tables' paging rules (app/(app)/dashboard/_lib/list-paging.ts)
// and how each list keeps them in its URL: page and size survive a link,
// a filter change starts again on page 1 and keeps the size, and the codes
// list's Type and Domain filters reach the query.
import { describe, expect, it } from "vitest";
import {
  GRID_PAGE_SIZES,
  pageSizeMenu,
  pageSizeParam,
  parsePageSize,
  TABLE_PAGE_SIZES,
  takePage,
} from "@/app/(app)/dashboard/_lib/list-paging";
import {
  barcodesHref,
  parseBarcodesFilters,
} from "@/app/(app)/dashboard/barcodes/_lib/filters";
import {
  codesHref,
  codesQueryOf,
  DEFAULT_DOMAIN_FILTER,
  parseCodesFilters,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import {
  linkSearchTerm,
  pagesHref,
  parsePagesFilters,
} from "@/app/(app)/dashboard/pages/_lib/filters";
import { MAX_PAGE } from "@/lib/paging";

describe("page size", () => {
  it("reads one of the list's sizes and falls back to its default", () => {
    expect(parsePageSize("50", TABLE_PAGE_SIZES)).toBe(50);
    expect(parsePageSize(["100", "25"], TABLE_PAGE_SIZES)).toBe(100);
    for (const bad of [undefined, "", "0", "-25", "37", "1e9", "abc"]) {
      expect(parsePageSize(bad, TABLE_PAGE_SIZES)).toBe(25);
    }
    // Another list's size isn't this list's.
    expect(parsePageSize("48", TABLE_PAGE_SIZES)).toBe(25);
    expect(parsePageSize("48", GRID_PAGE_SIZES)).toBe(48);
  });

  it("leaves the default out of the URL", () => {
    expect(pageSizeParam(25, TABLE_PAGE_SIZES)).toBeNull();
    expect(pageSizeParam(100, TABLE_PAGE_SIZES)).toBe("100");
  });

  it("offers sizes only when the rows don't fit on the smallest page", () => {
    const menu = (total: number) =>
      pageSizeMenu({
        options: TABLE_PAGE_SIZES,
        value: 50,
        total,
        label: (size) => `${size} per page`,
        href: (size) => `/codes?size=${size}`,
      });
    expect(menu(0)).toBeUndefined();
    expect(menu(25)).toBeUndefined();
    expect(menu(26)).toEqual({
      value: 50,
      options: [
        { value: 25, label: "25 per page", href: "/codes?size=25" },
        { value: 50, label: "50 per page", href: "/codes?size=50" },
        { value: 100, label: "100 per page", href: "/codes?size=100" },
      ],
    });
  });
});

describe("takePage (a next page without a total)", () => {
  const rows = Array.from({ length: 7 }, (_, index) => index);

  it("shows `limit` rows and says when one more was read", () => {
    expect(takePage(rows, 5)).toEqual({ rows: [0, 1, 2, 3, 4], hasMore: true });
  });

  it("has no next page when exactly `limit` rows came back", () => {
    expect(takePage(rows.slice(0, 5), 5)).toEqual({
      rows: [0, 1, 2, 3, 4],
      hasMore: false,
    });
  });

  it("handles a short last page and an empty list", () => {
    expect(takePage([1, 2], 5)).toEqual({ rows: [1, 2], hasMore: false });
    expect(takePage([], 5)).toEqual({ rows: [], hasMore: false });
  });
});

describe("codes list URL", () => {
  const base = "/dashboard/acme/codes";

  it("reads page and size, bounded", () => {
    expect(parseCodesFilters({}).page).toBe(1);
    expect(parseCodesFilters({}).size).toBe(25);
    expect(parseCodesFilters({ page: "3", size: "100" })).toMatchObject({
      page: 3,
      size: 100,
    });
    expect(parseCodesFilters({ page: "0" }).page).toBe(1);
    expect(parseCodesFilters({ page: "-4" }).page).toBe(1);
    expect(parseCodesFilters({ page: "99999999" }).page).toBe(MAX_PAGE);
    expect(parseCodesFilters({ size: "1000" }).size).toBe(25);
  });

  it("keeps filters, sort and size on Next and Previous", () => {
    const filters = parseCodesFilters({
      q: "menu",
      tags: "t1,t2",
      type: "link",
      domain: "dom_1",
      sort: "scans",
      size: "50",
      page: "2",
    });
    const next = codesHref(base, filters, { page: 3 });
    const params = new URL(next, "https://x.test").searchParams;
    expect(Object.fromEntries(params)).toEqual({
      q: "menu",
      tags: "t1,t2",
      type: "link",
      domain: "dom_1",
      sort: "scans",
      size: "50",
      page: "3",
    });
    expect(parseCodesFilters(Object.fromEntries(params))).toEqual({
      ...filters,
      page: 3,
    });
  });

  it("starts again on page 1 after a filter or size change, keeping the size", () => {
    const filters = parseCodesFilters({ size: "100", page: "4" });
    expect(codesHref(base, filters, { q: "menu" })).toBe(
      `${base}?q=menu&size=100`,
    );
    expect(codesHref(base, filters, { size: 25 })).toBe(base);
    expect(codesHref(base, filters, { size: 50 })).toBe(`${base}?size=50`);
  });

  it("sends the Type and Domain filters to the query", () => {
    const query = (params: Record<string, string>) =>
      codesQueryOf(parseCodesFilters(params));
    expect(query({})).toMatchObject({ kind: undefined, domainId: undefined });
    expect(query({ type: "link" }).kind).toBe("redirect");
    expect(query({ type: "page" }).kind).toBe("page");
    expect(query({ domain: DEFAULT_DOMAIN_FILTER }).domainId).toBeNull();
    expect(query({ domain: "dom_1" }).domainId).toBe("dom_1");
    expect(query({ folder: "none" }).folderId).toBeNull();
    expect(query({ folder: "f_1", fav: "1", q: "x" })).toMatchObject({
      folderId: "f_1",
      favorites: true,
      q: "x",
    });
  });
});

describe("barcodes list URL", () => {
  const base = "/dashboard/acme/barcodes";

  it("reads a grid size and keeps it across pages and filters", () => {
    const filters = parseBarcodesFilters({
      format: "ean13",
      size: "48",
      page: "2",
    });
    expect(filters).toMatchObject({ format: "ean13", size: 48, page: 2 });
    expect(barcodesHref(base, filters, { page: 3 })).toBe(
      `${base}?format=ean13&size=48&page=3`,
    );
    expect(barcodesHref(base, filters, { q: "590" })).toBe(
      `${base}?format=ean13&q=590&size=48`,
    );
    expect(parseBarcodesFilters({ size: "50" }).size).toBe(24);
    expect(parseBarcodesFilters({ page: "99999999" }).page).toBe(MAX_PAGE);
  });
});

describe("pages list URL", () => {
  const base = "/dashboard/acme/pages";

  it("reads q, type, page and size", () => {
    expect(
      parsePagesFilters({ q: " menu ", type: "links", page: "2", size: "50" }),
    ).toEqual({ q: "menu", type: "links", page: 2, size: 50 });
    expect(parsePagesFilters({ type: "../x" }).type).toBeNull();
    expect(parsePagesFilters({}).page).toBe(1);
  });

  it("keeps the filters on Next and starts again on page 1 after a change", () => {
    const filters = parsePagesFilters({ q: "menu", size: "50", page: "2" });
    expect(pagesHref(base, filters, { page: 3 })).toBe(
      `${base}?q=menu&size=50&page=3`,
    );
    expect(pagesHref(base, filters, { type: "feedback" })).toBe(
      `${base}?type=feedback&q=menu&size=50`,
    );
    expect(pagesHref(base, filters, { q: "" })).toBe(`${base}?size=50`);
  });

  it("searches a pasted page link by its back-half", () => {
    expect(linkSearchTerm("https://qrdx.dev/p/spring-menu")).toBe(
      "spring-menu",
    );
    expect(linkSearchTerm("go.brand.com/p/menu")).toBe("menu");
    expect(linkSearchTerm("menu")).toBe("menu");
  });
});
