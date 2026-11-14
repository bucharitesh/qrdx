import { describe, expect, it } from "vitest";
import {
  CODE_PROPERTIES,
  DEFAULT_DISPLAY,
  displayCookie,
  parseDisplay,
  serializeDisplay,
  toggleProperty,
} from "@/app/(app)/dashboard/codes/_lib/display";
import {
  codesHref,
  DEFAULT_DOMAIN_FILTER,
  isUnfiltered,
  parseCodesFilters,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";

describe("list display", () => {
  it("starts as cards with every property", () => {
    expect(parseDisplay(undefined)).toEqual(DEFAULT_DISPLAY);
    expect(DEFAULT_DISPLAY.view).toBe("cards");
    expect(DEFAULT_DISPLAY.properties).toEqual([...CODE_PROPERTIES]);
  });

  it("round-trips through the cookie value", () => {
    const display = { view: "rows" as const, properties: ["scans" as const] };
    expect(parseDisplay(serializeDisplay(display))).toEqual(display);
    expect(parseDisplay(encodeURIComponent("rows:scans"))).toEqual(display);
  });

  it("keeps the properties in their own order and drops unknown ones", () => {
    expect(parseDisplay("cards:created,nope,shortLink").properties).toEqual([
      "shortLink",
      "created",
    ]);
    expect(parseDisplay("cards:").properties).toEqual([]);
  });

  it("falls back on an unknown view", () => {
    expect(parseDisplay("grid:scans").view).toBe("cards");
  });

  it("switches one property at a time", () => {
    const off = toggleProperty(DEFAULT_DISPLAY, "tags");
    expect(off.properties).not.toContain("tags");
    expect(toggleProperty(off, "tags").properties).toEqual([
      ...CODE_PROPERTIES,
    ]);
  });

  it("remembers it for a year, on every path", () => {
    const cookie = displayCookie("codes", DEFAULT_DISPLAY);
    expect(cookie).toMatch(/^qrdx_codes_display=/);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 365}`);
    expect(displayCookie("pages", DEFAULT_DISPLAY)).toMatch(
      /^qrdx_pages_display=/,
    );
  });
});

describe("codes filters: type and domain", () => {
  const base = "/dashboard/acme/codes";

  it("reads them from the URL, ignoring bad values", () => {
    const filters = parseCodesFilters({ type: "page", domain: "dom_1" });
    expect(filters.type).toBe("page");
    expect(filters.domain).toBe("dom_1");
    const bad = parseCodesFilters({ type: "wifi", domain: "../x" });
    expect(bad.type).toBeNull();
    expect(bad.domain).toBeNull();
  });

  it("writes them back, and counts them as filters", () => {
    const filters = parseCodesFilters({});
    expect(isUnfiltered(filters)).toBe(true);
    const typed = { ...filters, type: "link" as const };
    expect(codesHref(base, typed)).toBe(`${base}?type=link`);
    expect(isUnfiltered(typed)).toBe(false);
    const onDefault = { ...filters, domain: DEFAULT_DOMAIN_FILTER };
    expect(codesHref(base, onDefault)).toBe(`${base}?domain=default`);
    expect(isUnfiltered(onDefault)).toBe(false);
  });
});
