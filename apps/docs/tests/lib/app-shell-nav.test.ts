// The app shell's information architecture: which nav item is active, which
// pages count as settings, the ⌘K match rule, and old /dashboard links.
import { describe, expect, it } from "vitest";
import {
  legacyCodesRedirect,
  legacyCodesUrl,
} from "@/app/dashboard/_components/home/legacy-codes-url";
import {
  ALL_NAV_ITEMS,
  findActiveNavItem,
  isSettingsPath,
  MAIN_NAV,
  SETTINGS_HOME,
  SETTINGS_NAV,
} from "@/components/app-shell/nav-config";
import { paletteFilter } from "@/components/app-shell/palette-filter";

describe("app nav", () => {
  it("has Home, Codes, Pages & forms, Analytics and a Library", () => {
    expect(MAIN_NAV.flatMap((g) => g.items.map((i) => i.label))).toEqual([
      "Home",
      "Codes",
      "Pages & forms",
      "Analytics",
      "Files",
      "Themes",
    ]);
    expect(MAIN_NAV.find((g) => g.id === "library")?.label).toBe("Library");
  });

  it("groups settings as Workspace, Developer and Account", () => {
    expect(SETTINGS_NAV.map((g) => g.label)).toEqual([
      "Workspace",
      "Developer",
      "Account",
    ]);
    expect(SETTINGS_HOME).toBe("/settings/usage");
    const labels = (id: string) =>
      SETTINGS_NAV.find((g) => g.id === id)?.items.map((i) => i.label);
    expect(labels("workspace")).toEqual([
      "Plan & usage",
      "Team",
      "Domains",
      "Webhooks",
      "Integrations",
    ]);
    expect(labels("developer")).toEqual(["API keys & apps", "Authorized apps"]);
    expect(labels("account")).toEqual([
      "Profile & security",
      "Preferences",
      "Notifications",
    ]);
  });

  it("keeps settings pages that live under /dashboard at their URLs", () => {
    const hrefs = SETTINGS_NAV.flatMap((g) => g.items.map((i) => i.href));
    for (const href of [
      "/dashboard/team",
      "/dashboard/domains",
      "/dashboard/webhooks",
    ]) {
      expect(hrefs).toContain(href);
    }
    // The dashboard sidebar is product only.
    const main = MAIN_NAV.flatMap((g) => g.items.map((i) => i.href));
    expect(main.some((href) => hrefs.includes(href))).toBe(false);
  });

  it("links every destination once, with its own icon", () => {
    const hrefs = ALL_NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    const icons = ALL_NAV_ITEMS.map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("marks Home only on /dashboard, and Codes on code pages", () => {
    expect(findActiveNavItem("/dashboard")?.label).toBe("Home");
    expect(findActiveNavItem("/dashboard/codes")?.label).toBe("Codes");
    expect(findActiveNavItem("/dashboard/codes/abc123")?.label).toBe("Codes");
    expect(findActiveNavItem("/dashboard/pages/p1")?.label).toBe(
      "Pages & forms",
    );
  });

  it("treats settings pages under /dashboard as settings", () => {
    for (const path of [
      "/settings",
      "/settings/usage",
      "/settings/developers/new",
      "/dashboard/team",
      "/dashboard/domains",
      "/dashboard/webhooks/w1",
    ]) {
      expect(isSettingsPath(path), path).toBe(true);
    }
    for (const path of [
      "/dashboard",
      "/dashboard/codes",
      "/dashboard/themes",
    ]) {
      expect(isSettingsPath(path), path).toBe(false);
    }
  });
});

describe("paletteFilter", () => {
  it("needs every word in the label or keywords", () => {
    expect(paletteFilter("Plan & usage", "plan")).toBe(1);
    expect(paletteFilter("Plan & usage", "billing", ["billing"])).toBe(1);
    expect(paletteFilter("Connect a domain", "connect domain")).toBe(1);
    // cmdk's fuzzy default matched this; the palette doesn't.
    expect(paletteFilter("Codes", "domain", ["dynamic", "qr"])).toBe(0);
    expect(paletteFilter("Codes", "")).toBe(1);
  });
});

describe("legacyCodesUrl", () => {
  it("sends old codes-list links on to /dashboard/codes", () => {
    expect(legacyCodesUrl({ status: "archived" })).toBe(
      "/dashboard/codes?status=archived",
    );
    expect(legacyCodesUrl({ q: "menu", page: "2" })).toBe(
      "/dashboard/codes?q=menu&page=2",
    );
    expect(legacyCodesUrl({ import: "bitly", connect_error: "denied" })).toBe(
      "/dashboard/codes?import=bitly&connect_error=denied",
    );
    expect(legacyCodesUrl({ tags: ["a", "b"] })).toBe(
      "/dashboard/codes?tags=a&tags=b",
    );
  });

  it("keeps Home for plain /dashboard and unrelated params", () => {
    expect(legacyCodesUrl({})).toBeNull();
    expect(legacyCodesUrl({ utm_source: "email" })).toBeNull();
  });
});

describe("legacyCodesRedirect", () => {
  it("moves /dashboard links with list params to /dashboard/codes, query untouched", () => {
    expect(legacyCodesRedirect("/dashboard", "?q=spring%20menu")).toBe(
      "/dashboard/codes?q=spring%20menu",
    );
    expect(legacyCodesRedirect("/dashboard", "?folder=f1&utm_source=x")).toBe(
      "/dashboard/codes?folder=f1&utm_source=x",
    );
    expect(legacyCodesRedirect("/dashboard", "?import=bitly")).toBe(
      "/dashboard/codes?import=bitly",
    );
    expect(legacyCodesRedirect("/dashboard", "?tags=a,b&fav=1")).toBe(
      "/dashboard/codes?tags=a,b&fav=1",
    );
  });

  it("leaves Home, other params and other paths alone", () => {
    expect(legacyCodesRedirect("/dashboard", "")).toBeNull();
    expect(legacyCodesRedirect("/dashboard", "?utm_source=email")).toBeNull();
    expect(legacyCodesRedirect("/dashboard/codes", "?q=menu")).toBeNull();
    expect(legacyCodesRedirect("/dashboard/analytics", "?page=2")).toBeNull();
  });
});
