// The app shell's information architecture: which nav item is active, which
// pages count as settings, and the ⌘K match rule, for a workspace's URLs
// (/dashboard/<slug>/...) and the account's (/settings/...).
import { describe, expect, it } from "vitest";
import {
  allNavItems,
  findActiveNavItem,
  isSettingsPath,
  mainNav,
  settingsHome,
  settingsNav,
} from "@/components/app-shell/nav-config";
import { paletteFilter } from "@/components/app-shell/palette-filter";

const SLUG = "acme";

describe("app nav", () => {
  it("has Home, Codes, Pages & forms, Analytics and a Library", () => {
    const nav = mainNav(SLUG);
    expect(nav.flatMap((g) => g.items.map((i) => i.label))).toEqual([
      "Home",
      "Codes",
      "Pages & forms",
      "Analytics",
      "Files",
      "Themes",
    ]);
    expect(nav.find((g) => g.id === "library")?.label).toBe("Library");
    expect(nav.flatMap((g) => g.items.map((i) => i.href))).toEqual([
      "/dashboard/acme",
      "/dashboard/acme/codes",
      "/dashboard/acme/pages",
      "/dashboard/acme/analytics",
      "/dashboard/acme/files",
      "/dashboard/acme/themes",
    ]);
  });

  it("splits settings into the workspace's and the account's", () => {
    const nav = settingsNav(SLUG);
    expect(nav.map((g) => g.label)).toEqual(["Workspace", "Account"]);
    expect(settingsHome(SLUG)).toBe("/dashboard/acme/settings");
    const group = (id: string) => nav.find((g) => g.id === id)?.items ?? [];
    expect(group("workspace").map((i) => [i.label, i.href])).toEqual([
      ["General", "/dashboard/acme/settings"],
      ["Plan & usage", "/dashboard/acme/settings/usage"],
      ["Team", "/dashboard/acme/settings/team"],
      ["Domains", "/dashboard/acme/settings/domains"],
      ["Single sign-on", "/dashboard/acme/settings/sso"],
      ["Audit log", "/dashboard/acme/settings/audit-log"],
      ["Webhooks", "/dashboard/acme/settings/webhooks"],
      ["API keys & apps", "/dashboard/acme/settings/developers"],
    ]);
    // Account pages are the same in every workspace.
    expect(group("account").map((i) => [i.label, i.href])).toEqual([
      ["Profile & security", "/settings/account"],
      ["Preferences", "/settings/general"],
      ["Notifications", "/settings/notifications"],
      ["Integrations", "/settings/integrations"],
      ["Authorized apps", "/settings/authorized-apps"],
      // Hidden where the program is off (feature-availability-rules.ts).
      ["Affiliate program", "/settings/affiliate"],
    ]);
    expect(settingsNav("other").find((g) => g.id === "account")).toEqual(
      expect.objectContaining({ label: "Account" }),
    );
  });

  it("links every destination once, with its own icon", () => {
    const items = allNavItems(SLUG);
    const hrefs = items.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    const icons = items.map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("marks Home only on the workspace root, and Codes on code pages", () => {
    expect(findActiveNavItem("/dashboard/acme", SLUG)?.label).toBe("Home");
    expect(findActiveNavItem("/dashboard/acme/codes", SLUG)?.label).toBe(
      "Codes",
    );
    expect(findActiveNavItem("/dashboard/acme/codes/abc123", SLUG)?.label).toBe(
      "Codes",
    );
    expect(findActiveNavItem("/dashboard/acme/pages/p1", SLUG)?.label).toBe(
      "Pages & forms",
    );
    // General is only the settings root, not every settings page.
    expect(
      findActiveNavItem("/dashboard/acme/settings/usage", SLUG)?.label,
    ).toBe("Plan & usage");
    expect(findActiveNavItem("/dashboard/acme/settings", SLUG)?.label).toBe(
      "General",
    );
    expect(
      findActiveNavItem("/dashboard/acme/settings/webhooks/w1", SLUG)?.label,
    ).toBe("Webhooks");
  });

  it("treats the workspace's and the account's settings as settings", () => {
    for (const path of [
      "/settings",
      "/settings/account",
      "/settings/notifications",
      "/dashboard/acme/settings",
      "/dashboard/acme/settings/developers/new",
      "/dashboard/other/settings/webhooks/w1",
    ]) {
      expect(isSettingsPath(path), path).toBe(true);
    }
    for (const path of [
      "/dashboard",
      "/dashboard/acme",
      "/dashboard/acme/codes",
      "/dashboard/acme/themes",
      // A workspace may be called "settings-team"; only the segment counts.
      "/dashboard/settings-team/codes",
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
