// The docs site's route handlers against a small docs index
// (.source/docs-index, as lib/docs-index-plugin.ts writes it): the
// Markdown copies, llms-full.txt, the manifest the main app's sitemap and
// llms.txt read, and robots.txt.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocsManifest } from "@repo/next-config/docs-zone";
import { afterAll, describe, expect, it, vi } from "vitest";

const root = mkdtempSync(join(tmpdir(), "docs-site-routes-"));
const dir = join(root, ".source/docs-index");
mkdirSync(dir, { recursive: true });

const page = (path: string, title: string, extra = {}) => ({
  type: "page",
  path,
  absolutePath: `../docs/content/docs/${path}`,
  data: { title, description: `${title} description`, ...extra },
});
writeFileSync(
  join(dir, "pages.json"),
  JSON.stringify({
    files: [
      page("index.mdx", "Introduction"),
      page("guides/start.mdx", "Start"),
      page("guides/start.es.mdx", "Empezar"),
      page("guides/domains.mdx", "Custom domains"),
      {
        type: "meta",
        path: "meta.json",
        absolutePath: "../docs/content/docs/meta.json",
        data: { pages: ["index", "guides"] },
      },
      {
        type: "meta",
        path: "guides/meta.json",
        absolutePath: "../docs/content/docs/guides/meta.json",
        data: { title: "Guides", root: true, pages: ["start", "domains"] },
      },
    ],
  }),
);
writeFileSync(
  join(dir, "markdown.json"),
  JSON.stringify({
    "index.mdx": "Welcome.\n",
    "guides/start.mdx": "Start here.\n",
    "guides/start.es.mdx": "Empieza aquí.\n",
    "guides/domains.mdx": "Domains.\n",
  }),
);
writeFileSync(join(dir, "search.json"), JSON.stringify({}));

// The main app offers everything but custom domains, whose docs page is
// hidden (as /zone/availability.json would say).
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (id: string) => id !== "customDomains",
  isPathAvailable: (href: string) => href !== "/docs/guides/domains",
  isIntegrationVisible: () => true,
  getFeatures: () => ({}),
}));

vi.spyOn(process, "cwd").mockReturnValue(root);
afterAll(() => rmSync(root, { recursive: true, force: true }));

const params = <T>(value: T) => ({ params: Promise.resolve(value) });

describe("Markdown copies", () => {
  it("serves an English page (app/llms.mdx)", async () => {
    const { GET } = await import("@/app/llms.mdx/[[...slug]]/route");
    const response = await GET(
      new Request("http://x/llms.mdx/guides/start"),
      params({ slug: ["guides", "start.md"] }),
    );
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    const text = await response.text();
    expect(text).toContain("# Start (Guides)");
    expect(text).toContain("URL: http://localhost:3000/docs/guides/start");
    expect(text).toContain(
      "Source: https://github.com/bucharitesh/qrdx/blob/main/apps/docs/content/docs/guides/start.mdx",
    );
    expect(text).toContain("Start here.");
  });

  it("serves a translation, and the English text where there's none (app/docs-md)", async () => {
    const { GET } = await import("@/app/docs-md/[lang]/[[...slug]]/route");
    const es = await GET(
      new Request("http://x"),
      params({ lang: "es", slug: ["guides", "start"] }),
    );
    expect(es.headers.get("content-language")).toBe("es");
    expect(await es.text()).toContain("Empieza aquí.");

    const fallback = await GET(
      new Request("http://x"),
      params({ lang: "es", slug: ["guides", "domains.md"] }),
    );
    expect(fallback.headers.get("content-language")).toBe("en");
    expect(await fallback.text()).toContain("Domains.");
  });

  it("answers 404 for pages that don't exist", async () => {
    const { GET } = await import("@/app/llms.mdx/[[...slug]]/route");
    await expect(
      GET(new Request("http://x"), params({ slug: ["nope"] })),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});

describe("llms-full.txt", () => {
  it("lists the pages the main app offers, in sidebar order", async () => {
    const { GET } = await import("@/app/llms-full.txt/route");
    const text = await (await GET()).text();
    expect(text).toContain("- Introduction: 1 page");
    expect(text).toContain("- Guides: 1 page");
    expect(text).toContain("Start here.");
    expect(text).not.toContain("Domains.");
    // No custom domains in the summary either.
    expect(text).not.toContain("custom domains, ");
  });
});

describe("the docs manifest", () => {
  it("holds the sitemap entries and sections the main app reads", async () => {
    const { GET } = await import("@/app/zone/docs-manifest.json/route");
    const response = GET();
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    const manifest = parseDocsManifest(await response.json());
    expect(manifest.sitemap.map((entry) => entry.url)).toEqual([
      "http://localhost:3000/docs",
      "http://localhost:3000/docs/guides/start",
    ]);
    expect(manifest.sitemap[0]).toMatchObject({
      changeFrequency: "weekly",
      priority: 0.8,
    });
    // Machine translations stay out of the sitemap and hreflang.
    expect(manifest.sitemap.some((entry) => entry.alternates)).toBe(false);
    expect(manifest.sections).toEqual([
      {
        title: "",
        pages: [
          {
            title: "Introduction",
            url: "/docs",
            description: "Introduction description",
          },
        ],
      },
      {
        title: "Guides",
        pages: [
          {
            title: "Start",
            url: "/docs/guides/start",
            description: "Start description",
          },
        ],
      },
    ]);
  });
});

describe("robots.txt", () => {
  it("keeps the docs site's own host out of search engines", async () => {
    const { default: robots } = await import("@/app/robots");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
