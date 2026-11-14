// The sitemap and llms.txt with and without a docs site: with DOCS_ZONE_URL
// set they list the docs from its manifest (lib/docs-zone-manifest.ts);
// without it the sitemap lists no docs (their URLs redirect to qrdx.dev) and
// llms.txt links the docs on qrdx.dev.
import type { DocsManifest } from "@repo/next-config/docs-zone";
import { beforeEach, describe, expect, it, vi } from "vitest";

const zone = vi.hoisted(() => ({
  manifest: null as DocsManifest | null,
}));

vi.mock("@/lib/docs-zone-manifest", () => ({
  docsZoneManifest: async () => zone.manifest,
}));
// No MDX here: the other collections are empty.
vi.mock("@/lib/content-source", () => {
  const empty = { getPages: () => [], pageTree: { children: [] } };
  return {
    blogAuthorsSource: empty,
    blogSource: empty,
    changelogSource: empty,
    compareSource: empty,
    customersSource: empty,
    legalSource: empty,
  };
});
vi.mock("@/lib/npm-version", () => ({ getPublishedVersion: async () => null }));

const { default: sitemap } = await import("@/app/sitemap");
const { llmsTxt } = await import("@/lib/agents/llms-content");

const MANIFEST: DocsManifest = {
  version: 1,
  sitemap: [
    {
      url: "http://localhost:3000/docs/dynamic-qr-codes",
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ],
  sections: [
    {
      title: "Guides",
      pages: [{ title: "Dynamic QR codes", url: "/docs/dynamic-qr-codes" }],
    },
  ],
};

const isDocs = (url: string) =>
  /^\/(?:[a-z-]+\/)?docs(?:\/|$)/.test(new URL(url).pathname);

describe("without a docs site", () => {
  beforeEach(() => {
    zone.manifest = null;
  });

  it("the sitemap lists no docs", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter(isDocs)).toEqual([]);
  });

  it("llms.txt links the docs on qrdx.dev", async () => {
    const text = await llmsTxt();
    expect(text).toContain("- [QRdx docs](https://qrdx.dev/docs)");
    expect(text).toContain("(https://qrdx.dev/docs/developers/mcp)");
    expect(text).toContain("(https://qrdx.dev/llms-full.txt)");
    expect(text).not.toMatch(/http:\/\/localhost:3000\/(?:docs|llms-full)/);
    expect(text).toContain("(http://localhost:3000/pricing)");
  });
});

describe("with a docs site", () => {
  beforeEach(() => {
    zone.manifest = MANIFEST;
  });

  it("the sitemap lists the docs site's entries", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.filter(isDocs)).toEqual([
      "http://localhost:3000/docs/dynamic-qr-codes",
    ]);
  });

  it("llms.txt lists its sections, on this site", async () => {
    const text = await llmsTxt();
    expect(text).toContain(
      "- [Dynamic QR codes](http://localhost:3000/docs/dynamic-qr-codes): Guides",
    );
    expect(text).not.toContain("https://qrdx.dev/docs");
    expect(text).not.toContain("[QRdx docs]");
  });
});
