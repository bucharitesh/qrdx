// The docs zone (@repo/i18n/docs, @repo/next-config/docs-zone): with DOCS_ZONE_URL set, the
// main app proxies the docs' URLs to the docs site (apps/docs-site); unset,
// nothing changes. Also the manifest the sitemap and llms.txt read from it.
import {
  docsZoneRewrites,
  isDocsPagePath,
  translatedDocsSegments,
} from "@repo/i18n/docs";
import {
  DOCS_MANIFEST_PATH,
  parseDocsManifest,
} from "@repo/next-config/docs-zone";
import { afterEach, describe, expect, it, vi } from "vitest";

const SEGMENTS = translatedDocsSegments();
const LANG = `:lang(${SEGMENTS.join("|")})`;
const MARKDOWN = {
  has: [
    { type: "header" as const, key: "accept", value: "markdown" },
    { type: "host" as const, value: "qrdx\\.dev" },
  ],
  missing: [{ type: "host" as const, value: "api\\.qrdx\\.dev" }],
};
const options = { translatedSegments: SEGMENTS, markdown: MARKDOWN };

describe("docsZoneRewrites", () => {
  it("adds nothing while DOCS_ZONE_URL is unset", () => {
    expect(docsZoneRewrites(undefined, options)).toEqual([]);
    expect(docsZoneRewrites("", options)).toEqual([]);
  });

  it("proxies every docs URL to the zone, Markdown requests first", () => {
    const rules = docsZoneRewrites("https://docs.qrdx.dev/", options);
    expect(
      rules.map(({ source, destination, has, missing }) => ({
        source,
        destination,
        markdown: has === MARKDOWN.has && missing === MARKDOWN.missing,
      })),
    ).toEqual([
      // Accept: text/markdown at a page's own URL: its Markdown.
      {
        source: "/docs",
        destination: "https://docs.qrdx.dev/llms.mdx",
        markdown: true,
      },
      {
        source: "/docs/:path+",
        destination: "https://docs.qrdx.dev/llms.mdx/:path+",
        markdown: true,
      },
      {
        source: `/${LANG}/docs`,
        destination: "https://docs.qrdx.dev/docs-md/:lang",
        markdown: true,
      },
      {
        source: `/${LANG}/docs/:path+`,
        destination: "https://docs.qrdx.dev/docs-md/:lang/:path+",
        markdown: true,
      },
      // The pages, and their .md and .mdx versions (the zone maps those).
      {
        source: "/docs",
        destination: "https://docs.qrdx.dev/docs",
        markdown: false,
      },
      {
        source: "/docs.md",
        destination: "https://docs.qrdx.dev/docs.md",
        markdown: false,
      },
      {
        source: "/docs.mdx",
        destination: "https://docs.qrdx.dev/docs.mdx",
        markdown: false,
      },
      {
        source: "/docs/:path*",
        destination: "https://docs.qrdx.dev/docs/:path*",
        markdown: false,
      },
      {
        source: `/${LANG}/docs`,
        destination: "https://docs.qrdx.dev/:lang/docs",
        markdown: false,
      },
      {
        source: `/${LANG}/docs.md`,
        destination: "https://docs.qrdx.dev/:lang/docs.md",
        markdown: false,
      },
      {
        source: `/${LANG}/docs.mdx`,
        destination: "https://docs.qrdx.dev/:lang/docs.mdx",
        markdown: false,
      },
      {
        source: `/${LANG}/docs/:path*`,
        destination: "https://docs.qrdx.dev/:lang/docs/:path*",
        markdown: false,
      },
      // The docs' routes and the zone's build assets.
      ...[
        "/llms.mdx/:path*",
        "/docs-md/:path*",
        "/og/docs/:path*",
        "/api/search",
        "/llms-full.txt",
        "/docs-static/:path*",
      ].map((source) => ({
        source,
        destination: `https://docs.qrdx.dev${source}`,
        markdown: false,
      })),
    ]);
  });

  it("lists every language with translated docs", () => {
    expect(SEGMENTS).toContain("pt-br");
    expect(SEGMENTS).not.toContain("en");
  });

  it("works with no translated docs", () => {
    const rules = docsZoneRewrites("https://docs.example.com", {
      ...options,
      translatedSegments: [],
    });
    expect(rules.some((rule) => rule.source.includes(":lang"))).toBe(false);
    expect(rules).toHaveLength(12);
  });
});

describe("isDocsPagePath", () => {
  it.each([
    "/docs",
    "/docs/dynamic-qr-codes",
    "/docs/developers/rest-api?x=1#auth",
    "/es/docs",
    "/pt-br/docs/help/faq",
  ])("%s is a docs page", (href) => {
    expect(isDocsPagePath(href, SEGMENTS)).toBe(true);
  });

  it.each([
    "/",
    "/pricing",
    "/es/pricing",
    "/docs.md",
    "/docs/dynamic-qr-codes.md",
    "/es/docs/x.mdx",
    "/docsy",
    "/en/docs",
    "/xx/docs",
    "https://qrdx.dev/docs",
    "//qrdx.dev/docs",
    "docs/relative",
  ])("%s isn't", (href) => {
    expect(isDocsPagePath(href, SEGMENTS)).toBe(false);
  });
});

describe("parseDocsManifest", () => {
  const manifest = {
    version: 1,
    sitemap: [
      {
        url: "https://qrdx.dev/docs",
        lastModified: "2026-11-01T00:00:00.000Z",
        changeFrequency: "weekly",
        priority: 0.8,
      },
    ],
    sections: [{ title: "", pages: [{ title: "Introduction", url: "/docs" }] }],
  };

  it("accepts a manifest", () => {
    expect(parseDocsManifest(manifest)).toEqual(manifest);
  });

  it.each([
    ["an error page", "<html>"],
    ["another version", { ...manifest, version: 2 }],
    ["entries without a url", { ...manifest, sitemap: [{}] }],
    ["sections without pages", { ...manifest, sections: [{ title: "" }] }],
  ])("rejects %s", (_name, value) => {
    expect(() => parseDocsManifest(value)).toThrow(/Docs manifest/);
  });
});

describe("docsZoneManifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is null while DOCS_ZONE_URL is unset, without a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { docsZoneManifest } = await import("@/lib/docs-zone-manifest");
    expect(await docsZoneManifest(undefined)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the zone's manifest, revalidated hourly", async () => {
    const body = { version: 1, sitemap: [], sections: [] };
    const fetch = vi.fn(async () => Response.json(body));
    vi.stubGlobal("fetch", fetch);
    const { docsZoneManifest } = await import("@/lib/docs-zone-manifest");
    expect(await docsZoneManifest("https://docs.qrdx.dev")).toEqual(body);
    expect(fetch).toHaveBeenCalledWith(
      new URL(DOCS_MANIFEST_PATH, "https://docs.qrdx.dev"),
      { next: { revalidate: 3600 } },
    );
  });

  it("throws when the zone doesn't answer, so the last good copy stays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    const { docsZoneManifest } = await import("@/lib/docs-zone-manifest");
    await expect(docsZoneManifest("https://docs.qrdx.dev")).rejects.toThrow(
      /answered 503/,
    );
  });
});
