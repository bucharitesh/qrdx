// Workspace URLs and slugs: /dashboard/<slug>/..., the slug-free entry
// (/dashboard?to=...) for docs and messages, the switcher's "same section in
// another workspace", the reserved words, and the slug made for someone's
// own workspace.
import {
  ownWorkspaceId,
  ownWorkspaceMemberId,
} from "@repo/auth/own-workspace-id";
import {
  isReservedWorkspaceSlug,
  nextFreeSlug,
  ownWorkspaceName,
  ownWorkspaceSlugBase,
  RESERVED_WORKSPACE_SLUGS,
  slugifyWorkspaceName,
  workspaceSlugProblem,
} from "@repo/auth/workspace-rules";
import { describe, expect, it } from "vitest";
import { isPathShown } from "@/lib/feature-availability-rules";
import {
  dashboardEntry,
  entryPath,
  pathInWorkspace,
  switchWorkspaceHref,
  workspaceHref,
  workspaceLink,
  workspacePattern,
  workspaceSlugFromPath,
} from "@/lib/workspace-paths";

describe("workspace paths", () => {
  it("builds and reads /dashboard/<slug>/...", () => {
    expect(workspaceHref("acme")).toBe("/dashboard/acme");
    expect(workspaceHref("acme", "/codes/c1")).toBe("/dashboard/acme/codes/c1");
    expect(workspaceSlugFromPath("/dashboard/acme/codes/c1")).toBe("acme");
    expect(workspaceSlugFromPath("/dashboard/acme")).toBe("acme");
    expect(workspaceSlugFromPath("/dashboard")).toBeNull();
    expect(workspaceSlugFromPath("/settings/account")).toBeNull();
    expect(workspaceSlugFromPath("/dashboard/Acme")).toBeNull();
    expect(workspaceSlugFromPath("/dashboard/%E0%A4")).toBeNull();
    expect(pathInWorkspace("/dashboard/acme/codes/c1")).toBe("/codes/c1");
    expect(pathInWorkspace("/dashboard/acme")).toBe("");
    expect(pathInWorkspace("/dashboard/acme/")).toBe("");
  });

  it("switches to the same section in another workspace, query dropped", () => {
    expect(switchWorkspaceHref("/dashboard/acme", "beta")).toBe(
      "/dashboard/beta",
    );
    expect(switchWorkspaceHref("/dashboard/acme/codes/c1", "beta")).toBe(
      "/dashboard/beta/codes",
    );
    expect(switchWorkspaceHref("/dashboard/acme/pages/p1/responses", "b")).toBe(
      "/dashboard/b/pages",
    );
    expect(
      switchWorkspaceHref("/dashboard/acme/settings/webhooks/w1", "beta"),
    ).toBe("/dashboard/beta/settings/webhooks");
    expect(switchWorkspaceHref("/dashboard/acme/settings", "beta")).toBe(
      "/dashboard/beta/settings",
    );
    // From an account page, the other workspace's Home.
    expect(switchWorkspaceHref("/settings/account", "beta")).toBe(
      "/dashboard/beta",
    );
  });

  it("links into the default workspace when the slug isn't known", () => {
    expect(dashboardEntry("settings/developers")).toBe(
      "/dashboard?to=settings/developers",
    );
    expect(dashboardEntry("settings/developers", { new: "1" })).toBe(
      "/dashboard?to=settings/developers&new=1",
    );
    expect(workspaceLink(null, "/codes/c1?tab=settings#utm")).toBe(
      "/dashboard?to=codes/c1&tab=settings#utm",
    );
    expect(workspaceLink(null)).toBe("/dashboard");
    expect(workspaceLink("acme", "/codes")).toBe("/dashboard/acme/codes");
  });

  it("only follows ?to= into known sections", () => {
    expect(entryPath("settings/developers")).toBe("/settings/developers");
    expect(entryPath("/codes/")).toBe("/codes");
    expect(entryPath(["pages", "codes"])).toBe("/pages");
    for (const bad of [
      undefined,
      "",
      "admin",
      "../../evil",
      "//evil.com",
      "codes/../../x",
      "https://evil.com",
      "Codes",
      `codes/${"a".repeat(120)}`,
    ]) {
      expect(entryPath(bad), String(bad)).toBeNull();
    }
  });

  it("matches availability rules written once for every workspace", () => {
    expect(workspacePattern("/dashboard/acme/settings/domains?x=1")).toBe(
      "/dashboard/[workspace]/settings/domains",
    );
    expect(workspacePattern("/docs/custom-domains")).toBe(
      "/docs/custom-domains",
    );
    const hidden = ["/dashboard/[workspace]/settings/domains"];
    expect(isPathShown(hidden, "/dashboard/acme/settings/domains")).toBe(false);
    expect(isPathShown(hidden, "/dashboard/beta/settings/domains#x")).toBe(
      false,
    );
    expect(isPathShown(hidden, "/dashboard/acme/settings/team")).toBe(true);
  });
});

describe("workspace slugs", () => {
  it("accepts 3-48 lowercase letters, digits and inner dashes", () => {
    expect(workspaceSlugProblem("acme-marketing")).toBeNull();
    expect(workspaceSlugProblem("a1b")).toBeNull();
    for (const bad of [
      "ab",
      "-acme",
      "acme-",
      "Acme",
      "acme_x",
      "a".repeat(49),
    ]) {
      expect(workspaceSlugProblem(bad), bad).toMatch(/lowercase/);
    }
  });

  it("reserves every old dashboard section and app word", () => {
    for (const slug of [
      "codes",
      "pages",
      "analytics",
      "files",
      "themes",
      "team",
      "domains",
      "webhooks",
      "settings",
      "import",
      "new",
      "personal",
      "api",
      "admin",
      "dashboard",
      "invite",
      "oauth",
    ]) {
      expect(isReservedWorkspaceSlug(slug), slug).toBe(true);
      expect(workspaceSlugProblem(slug), slug).toMatch(/reserved/);
    }
    expect(new Set(RESERVED_WORKSPACE_SLUGS).size).toBe(
      RESERVED_WORKSPACE_SLUGS.length,
    );
  });

  it("makes a valid, free slug and a name for someone's own workspace", () => {
    expect(slugifyWorkspaceName("Acme Marketing!")).toBe("acme-marketing");
    expect(
      ownWorkspaceSlugBase({ name: "Ritesh Bucha", email: "r@x.dev" }),
    ).toBe("ritesh-bucha");
    // Falls back to the email; short or reserved bases are lengthened.
    expect(ownWorkspaceSlugBase({ name: "  ", email: "maria@x.dev" })).toBe(
      "maria",
    );
    expect(ownWorkspaceSlugBase({ name: "Al", email: "al@x.dev" })).toBe(
      "al-workspace",
    );
    expect(ownWorkspaceSlugBase({ name: "Admin", email: "a@x.dev" })).toBe(
      "admin-workspace",
    );
    expect(ownWorkspaceSlugBase({ name: "李", email: "李@x.dev" })).toBe(
      "workspace-1",
    );
    const long = ownWorkspaceSlugBase({ name: "a".repeat(80), email: "x@y.z" });
    expect(long.length).toBeLessThanOrEqual(43);
    for (const person of [
      { name: "Ritesh Bucha", email: "r@x.dev" },
      { name: null, email: "team@qrdx.dev" },
      { name: "QRdx", email: "team@qrdx.dev" },
      { name: "-", email: "--@x.dev" },
    ]) {
      expect(workspaceSlugProblem(ownWorkspaceSlugBase(person))).toBeNull();
    }
    expect(nextFreeSlug("acme", new Set())).toBe("acme");
    expect(nextFreeSlug("acme", new Set(["acme", "acme-2"]))).toBe("acme-3");
    expect(nextFreeSlug("codes", new Set())).toBe("codes-2");
    expect(ownWorkspaceName({ name: "Ritesh Bucha", email: "r@x.dev" })).toBe(
      "Ritesh's workspace",
    );
    expect(ownWorkspaceName({ name: "", email: "maria@x.dev" })).toBe(
      "maria's workspace",
    );
    expect(ownWorkspaceName({ name: "", email: "" })).toBe("My workspace");
  });

  it("derives the own workspace's ids from the user id, stably", () => {
    expect(ownWorkspaceId("u1")).toBe(ownWorkspaceId("u1"));
    expect(ownWorkspaceId("u1")).not.toBe(ownWorkspaceId("u2"));
    expect(ownWorkspaceId("u1")).toMatch(/^ws_[0-9a-f]{32}$/);
    expect(ownWorkspaceMemberId("u1")).toMatch(/^wsm_[0-9a-f]{32}$/);
    // Never change the formula: existing workspaces are found by it.
    // (sha256("qrdx:own-workspace:user_123"), first 32 hex characters)
    expect(ownWorkspaceId("user_123")).toBe(
      "ws_5f426e9a1d60e95976fb178ed1d4dd03",
    );
    expect(ownWorkspaceMemberId("user_123")).toBe(
      "wsm_5f426e9a1d60e95976fb178ed1d4dd03",
    );
  });
});
