// Offset paging (lib/paging.ts) and the admin pager: `?page=` is read as a
// page between 1 and MAX_PAGE, a page past the end loads the last page
// instead (and the pager's links start from that page), and there's no
// pager when there's nothing to page.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Pager } from "@/app/(app)/admin/_components/pager";
import {
  clampPage,
  loadPage,
  MAX_PAGE,
  offsetOf,
  PAGE_SIZE,
  pageCountOf,
  parsePage,
} from "@/lib/paging";

describe("parsePage", () => {
  it("reads a positive whole number", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("2")).toBe(2);
    expect(parsePage("37")).toBe(37);
    expect(parsePage("4abc")).toBe(4);
  });

  it("is 1 for anything else", () => {
    for (const value of [undefined, "", "0", "-3", "abc", "NaN", " "]) {
      expect(parsePage(value)).toBe(1);
    }
  });

  it("takes the first of repeated params", () => {
    expect(parsePage(["3", "9"])).toBe(3);
    expect(parsePage([])).toBe(1);
  });

  it("never goes past MAX_PAGE, however large the number", () => {
    expect(MAX_PAGE).toBe(10_000);
    expect(parsePage(String(MAX_PAGE))).toBe(MAX_PAGE);
    expect(parsePage(String(MAX_PAGE + 1))).toBe(MAX_PAGE);
    expect(parsePage("99999999999999999999")).toBe(MAX_PAGE);
    expect(parsePage("1e9")).toBe(1);
  });
});

describe("pageCountOf, clampPage and offsetOf", () => {
  it("counts whole pages, and one page for no rows", () => {
    expect(PAGE_SIZE).toBe(25);
    expect(pageCountOf(0)).toBe(1);
    expect(pageCountOf(1)).toBe(1);
    expect(pageCountOf(25)).toBe(1);
    expect(pageCountOf(26)).toBe(2);
    expect(pageCountOf(51)).toBe(3);
  });

  it("keeps a page between the first and the last", () => {
    expect(clampPage(1, 60)).toBe(1);
    expect(clampPage(3, 60)).toBe(3);
    expect(clampPage(4, 60)).toBe(3);
    expect(clampPage(MAX_PAGE, 60)).toBe(3);
    expect(clampPage(0, 60)).toBe(1);
    expect(clampPage(-2, 60)).toBe(1);
    expect(clampPage(5, 0)).toBe(1);
    expect(clampPage(Number.NaN, 60)).toBe(1);
  });

  it("starts each page PAGE_SIZE rows further on", () => {
    expect(offsetOf(1)).toBe(0);
    expect(offsetOf(2)).toBe(25);
    expect(offsetOf(4)).toBe(75);
  });
});

describe("loadPage", () => {
  // 60 rows: pages 1 and 2 are full, page 3 has 10.
  const rows = Array.from({ length: 60 }, (_, i) => i);
  const load = vi.fn(async (page: number) => ({
    total: rows.length,
    rows: rows.slice(offsetOf(page), offsetOf(page) + PAGE_SIZE),
  }));

  it("loads a page in range once", async () => {
    load.mockClear();
    const result = await loadPage(2, load);
    expect(result.page).toBe(2);
    expect(result.rows[0]).toBe(25);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads the last page instead of one past the end", async () => {
    load.mockClear();
    const result = await loadPage(7, load);
    expect(result.page).toBe(3);
    expect(result.rows).toEqual(rows.slice(50));
    expect(load.mock.calls.map(([page]) => page)).toEqual([7, 3]);
  });

  it("asks only once when there are no rows at all", async () => {
    const empty = vi.fn(async () => ({ total: 0, rows: [] as number[] }));
    const result = await loadPage(5, empty);
    expect(result).toEqual({ total: 0, rows: [], page: 1 });
    expect(empty).toHaveBeenCalledTimes(1);
  });
});

const render = (props: Parameters<typeof Pager>[0]) =>
  renderToStaticMarkup(createElement(Pager, props));

const hrefs = (html: string) =>
  [...html.matchAll(/href="([^"]*)"/g)].map((match) =>
    (match[1] as string).replaceAll("&amp;", "&"),
  );

describe("Pager", () => {
  it("links the pages around the current one and keeps the filters", () => {
    const html = render({
      basePath: "/admin/codes",
      page: 2,
      total: 60,
      params: { q: "summer", status: undefined, kind: "page" },
    });
    expect(html).toContain("Page 2 of 3 · 60 total");
    expect(hrefs(html)).toEqual([
      "/admin/codes?q=summer&kind=page",
      "/admin/codes?q=summer&kind=page&page=3",
    ]);
  });

  it("counts a page past the end as the last page", () => {
    const html = render({ basePath: "/admin/users", page: 40, total: 60 });
    expect(html).toContain("Page 3 of 3 · 60 total");
    // Previous goes to page 2, not 39; Next is off.
    expect(hrefs(html)).toEqual(["/admin/users?page=2"]);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Next<\/button>/);
  });

  it("has no links on a single page", () => {
    const html = render({ basePath: "/admin/users", page: 1, total: 3 });
    expect(html).toContain("Page 1 of 1 · 3 total");
    expect(hrefs(html)).toEqual([]);
  });

  it("isn't there when there's nothing to page", () => {
    expect(render({ basePath: "/admin/users", page: 1, total: 0 })).toBe("");
    expect(render({ basePath: "/admin/users", page: 9, total: 0 })).toBe("");
  });

  it("pages its own param and leaves the other lists where they are", () => {
    const html = render({
      basePath: "/admin/affiliates",
      page: 1,
      pageParam: "rejected",
      total: 30,
      params: { page: "2", rejected: "1", applications: undefined },
    });
    expect(hrefs(html)).toEqual(["/admin/affiliates?page=2&rejected=2"]);
  });
});
