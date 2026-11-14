// The sidebar's areas: which URL opens which area, what each holds, and
// which way the panels slide.
import { describe, expect, it } from "vitest";
import {
  areaForPath,
  areaOffset,
  NAV_AREAS,
  type NavArea,
  navAreas,
  slideDirection,
} from "@/components/app-shell/nav-areas";
import { isNavItemActive } from "@/components/app-shell/nav-config";

const SLUG = "acme";
const W = "/dashboard/acme";

const labels = (area: NavArea) =>
  area.groups.flatMap((group) =>
    group.rows.map((row) =>
      row.kind === "link"
        ? row.item.label
        : row.kind === "area"
          ? `${row.label} ›`
          : `${row.label} (action)`,
    ),
  );

describe("sidebar areas", () => {
  it("opens the area of the URL", () => {
    const cases: [string, string][] = [
      [W, "dashboard"],
      [`${W}/files`, "dashboard"],
      [`${W}/themes`, "dashboard"],
      [`${W}/codes`, "codes"],
      [`${W}/codes/abc123`, "codes"],
      [`${W}/codes/import`, "codes"],
      [`${W}/analytics`, "codes"],
      [`${W}/pages`, "pages"],
      [`${W}/pages/p1`, "pages"],
      [`${W}/pages/p1/responses`, "pages"],
      [`${W}/settings`, "settings"],
      [`${W}/settings/team`, "settings"],
      ["/settings/account", "settings"],
    ];
    for (const [path, area] of cases) {
      expect(areaForPath(path, SLUG), path).toBe(area);
    }
  });

  it("doesn't mistake a look-alike segment for an area", () => {
    expect(areaForPath(`${W}/codesx`, SLUG)).toBe("dashboard");
    expect(areaForPath(`${W}/pages-old`, SLUG)).toBe("dashboard");
  });

  it("offers only the account settings without a workspace", () => {
    expect(areaForPath("/settings/account", null)).toBe("settings");
    const areas = navAreas(null);
    expect(labels(areas.settings)).toEqual([
      "Profile & security",
      "Preferences",
      "Notifications",
      "Integrations",
      "Authorized apps",
      // Hidden where the program is off (feature-availability-rules.ts).
      "Affiliate program",
    ]);
    expect(areas.settings.back?.href).toBe("/dashboard");
  });

  it("lists what each area holds", () => {
    const areas = navAreas(SLUG);
    expect(labels(areas.dashboard)).toEqual([
      "Home",
      "Codes ›",
      "Pages & forms ›",
      "Barcodes",
      "Files",
      "Themes",
      "Settings ›",
    ]);
    expect(labels(areas.codes)).toEqual(["All codes", "Analytics", "Import"]);
    expect(labels(areas.pages)).toEqual([
      "All pages",
      "Page templates (action)",
      "Form templates (action)",
    ]);
    expect(labels(areas.settings)).toContain("Plan & usage");
    expect(labels(areas.settings)).toContain("Profile & security");
  });

  it("gives every area but the top level a way back to the dashboard", () => {
    const areas = navAreas(SLUG);
    expect(areas.dashboard.back).toBeNull();
    for (const id of ["codes", "pages", "settings"] as const) {
      expect(areas[id].back).toEqual({ href: W, label: "Dashboard" });
    }
  });

  it("opens each area from the top level at its own page", () => {
    const rows = navAreas(SLUG).dashboard.groups.flatMap((g) => g.rows);
    const opens = Object.fromEntries(
      rows.flatMap((row) =>
        row.kind === "area" ? [[row.area, row.href]] : [],
      ),
    );
    expect(opens).toEqual({
      codes: `${W}/codes`,
      pages: `${W}/pages`,
      settings: `${W}/settings`,
    });
    // Each lands in the area it names.
    for (const [area, href] of Object.entries(opens)) {
      expect(areaForPath(href, SLUG)).toBe(area);
    }
  });

  it("marks All codes on a code's page but not on Import", () => {
    const rows = navAreas(SLUG).codes.groups.flatMap((g) => g.rows);
    const item = (label: string) => {
      const row = rows.find((r) => r.kind === "link" && r.item.label === label);
      if (row?.kind !== "link") throw new Error(label);
      return row.item;
    };
    expect(isNavItemActive(item("All codes"), `${W}/codes`)).toBe(true);
    expect(isNavItemActive(item("All codes"), `${W}/codes/abc`)).toBe(true);
    expect(isNavItemActive(item("All codes"), `${W}/codes/import`)).toBe(false);
    expect(isNavItemActive(item("Import"), `${W}/codes/import`)).toBe(true);
  });

  it("never repeats an icon within an area", () => {
    for (const area of Object.values(navAreas(SLUG))) {
      const icons = area.groups.flatMap((g) =>
        g.rows.map((row) => (row.kind === "link" ? row.item.icon : row.icon)),
      );
      expect(new Set(icons).size, area.id).toBe(icons.length);
    }
  });
});

describe("the slide", () => {
  it("keeps areas waiting on the side they come from", () => {
    expect(areaOffset("dashboard", "dashboard")).toBe(0);
    expect(areaOffset("codes", "dashboard")).toBe(1);
    expect(areaOffset("dashboard", "codes")).toBe(-1);
    expect(areaOffset("pages", "codes")).toBe(1);
    expect(areaOffset("codes", "settings")).toBe(-1);
  });

  it("goes forward into an area and back out of it", () => {
    expect(slideDirection("dashboard", "codes")).toBe("forward");
    expect(slideDirection("codes", "dashboard")).toBe("back");
    expect(slideDirection("dashboard", "settings")).toBe("forward");
    expect(slideDirection("settings", "dashboard")).toBe("back");
    expect(slideDirection("codes", "codes")).toBeNull();
  });

  it("has exactly one open area for every pair", () => {
    for (const current of NAV_AREAS) {
      const open = NAV_AREAS.filter((id) => areaOffset(id, current) === 0);
      expect(open).toEqual([current]);
    }
  });
});
