// The public catalog drives /integrations, /plugins, the sitemap, llms.txt
// and the redirects from old /integrations/<slug> URLs, so its shape is
// checked here: every entry says where it lives, and nothing that moved off
// /integrations is left without a destination.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATALOG_CATEGORIES,
  type CatalogSurface,
  getCatalogBySurface,
  getCatalogEntry,
  getCatalogRedirect,
  getIntegrationCatalog,
  getRelatedEntries,
  getUsedCategories,
  isListedIntegration,
} from "../src/catalog";

const PUBLIC = join(__dirname, "../../../apps/docs/public");

const slugs = (surface: CatalogSurface) =>
  getCatalogBySurface(surface).map((entry) => entry.slug);

describe("catalog surfaces", () => {
  it("lists only third-party connections on /integrations", () => {
    expect(slugs("integrations").sort()).toEqual(
      [
        "slack",
        "discord",
        "google-sheets",
        "hubspot",
        "mailchimp",
        "zapier",
        "make",
        "n8n",
        "dub",
        "bitly",
        "rebrandly",
        "short-io",
        "google-drive",
        "dropbox",
        "onedrive",
        "box",
        "notion",
        "stripe",
        "shopify",
        "calcom",
        "calendly",
        "youtube",
        "spotify",
        "google-analytics",
        "google-tag-manager",
        "meta-pixel",
        "tiktok-pixel",
        "linkedin-insight-tag",
      ].sort(),
    );
  });

  it("moves AI assistants, developer tools, plugins and features elsewhere", () => {
    expect(slugs("mcp").sort()).toEqual(
      [
        "chatgpt",
        "claude",
        "claude-code",
        "codex",
        "cursor",
        "gemini-cli",
        "vscode",
        "windsurf",
      ].sort(),
    );
    expect(slugs("developers").sort()).toEqual(
      ["cli", "image-api", "react", "rest-api", "shadcn", "webhooks"].sort(),
    );
    expect(slugs("plugins")).toEqual(["chrome", "figma", "raycast", "canva"]);
    expect(slugs("feature").sort()).toEqual(["custom-domains", "email-alerts"]);
  });

  it("gives every entry exactly one known surface", () => {
    const all = getIntegrationCatalog();
    const bySurface = (
      ["integrations", "mcp", "developers", "plugins", "feature"] as const
    ).flatMap(slugs);
    expect(bySurface).toHaveLength(all.length);
    expect(new Set(all.map((entry) => entry.slug)).size).toBe(all.length);
  });

  it("sends every moved entry to a page on this site", () => {
    for (const entry of getIntegrationCatalog()) {
      const target = getCatalogRedirect(entry);
      if (isListedIntegration(entry)) {
        expect(target, entry.slug).toBeUndefined();
        continue;
      }
      expect(target, entry.slug).toMatch(/^\/(mcp\?tab=|plugins#|docs\/)/);
      expect(target, entry.slug).not.toMatch(/^\/integrations/);
    }
  });

  it("points AI assistants at their /mcp tab and plugins at their anchor", () => {
    expect(getCatalogRedirect(getCatalogEntry("cursor")!)).toBe(
      "/mcp?tab=cursor",
    );
    expect(getCatalogRedirect(getCatalogEntry("gemini-cli")!)).toBe(
      "/mcp?tab=gemini",
    );
    for (const entry of getCatalogBySurface("plugins")) {
      expect(getCatalogRedirect(entry)).toBe(`/plugins#${entry.slug}`);
    }
  });
});

describe("catalog data", () => {
  it("has a logo file for every image logo", () => {
    for (const entry of getIntegrationCatalog()) {
      if (entry.logo.type !== "image") continue;
      expect(existsSync(join(PUBLIC, entry.logo.src)), entry.logo.src).toBe(
        true,
      );
    }
  });

  it("only relates entries that exist", () => {
    for (const entry of getIntegrationCatalog()) {
      for (const slug of entry.related ?? []) {
        expect(getCatalogEntry(slug), `${entry.slug} → ${slug}`).toBeDefined();
      }
    }
  });

  it("relates integrations only to other listed integrations", () => {
    for (const entry of getCatalogBySurface("integrations")) {
      const related = getRelatedEntries(entry, 3);
      expect(related.length, entry.slug).toBeGreaterThan(0);
      for (const item of related) {
        expect(isListedIntegration(item), `${entry.slug} → ${item.slug}`).toBe(
          true,
        );
        expect(item.slug).not.toBe(entry.slug);
      }
    }
  });

  it("hides categories that have no listed integration", () => {
    const used = getUsedCategories(getCatalogBySurface("integrations")).map(
      (category) => category.id,
    );
    expect(used).not.toContain("ai");
    expect(used).not.toContain("plugins");
    expect(used).not.toContain("developers");
    // Display order is kept.
    expect(used).toEqual(
      CATALOG_CATEGORIES.map((category) => category.id).filter((id) =>
        used.includes(id),
      ),
    );
  });
});
