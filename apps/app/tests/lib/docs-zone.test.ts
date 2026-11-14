// The docs zone (@repo/i18n/docs, @repo/next-config/docs-zone): with
// DOCS_ZONE_URL set, the main app proxies the docs' URLs to the docs site
// (apps/docs); unset, it redirects them to the same paths on qrdx.dev. Also
// the manifest the sitemap and llms.txt read from it.
import { createRequire } from "node:module";
import {
  docsOriginRedirects,
  docsZoneRewrites,
  isDocsPagePath,
  translatedDocsSegments,
} from "@repo/i18n/docs";
import {
  DOCS_MANIFEST_PATH,
  parseDocsManifest,
} from "@repo/next-config/docs-zone";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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

// Next's own copy of the matcher it applies to next.config.ts (no types).
const pathToRegexp = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp",
) as {
  match: (
    source: string,
  ) => (path: string) => false | { params: Record<string, unknown> };
  compile: (path: string) => (params: Record<string, unknown>) => string;
};

interface Rule {
  source: string;
  destination: string;
  permanent?: boolean;
  has?: { type: string; key?: string; value?: string }[];
}

/** Where the first rule matching `path` on `host` sends it, with its rule. */
function follow(rules: readonly Rule[], host: string, path: string) {
  for (const rule of rules) {
    const found = pathToRegexp.match(rule.source)(path);
    const onHost = (rule.has ?? []).every(
      (condition) =>
        condition.type === "host" &&
        new RegExp(`^${condition.value}$`).test(host),
    );
    if (!(found && onHost)) continue;
    const url = new URL(rule.destination, "http://same-origin");
    const target = `${url.origin}${pathToRegexp.compile(url.pathname)(found.params)}`;
    return { rule, target: target.replace("http://same-origin", "") };
  }
  return undefined;
}

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

describe("long runs of slashes", () => {
  // Both helpers read URLs and hrefs they don't control, so they must stay
  // linear: a regex like /\/+$/ backtracks over every slash of a long run.
  const run = "/".repeat(200_000);
  const within = (ms: number, work: () => void) => {
    const start = performance.now();
    work();
    expect(performance.now() - start).toBeLessThan(ms);
  };

  it("docsZoneRewrites trims any number of trailing slashes, fast", () => {
    within(200, () => {
      const [first] = docsZoneRewrites(`https://docs.qrdx.dev${run}`, options);
      expect(first?.destination).toBe("https://docs.qrdx.dev/llms.mdx");
    });
    within(200, () => {
      expect(docsZoneRewrites(`${run}x${run}`, options)[0]?.destination).toBe(
        `${run}x/llms.mdx`,
      );
    });
  });

  it("isDocsPagePath answers fast for any run of slashes", () => {
    within(200, () => {
      expect(isDocsPagePath(run, SEGMENTS)).toBe(false);
      expect(isDocsPagePath(`/docs${run}x`, SEGMENTS)).toBe(true);
      expect(isDocsPagePath(`/es${run}`, SEGMENTS)).toBe(false);
      expect(isDocsPagePath(`/x${run}docs`, SEGMENTS)).toBe(false);
      expect(isDocsPagePath(`/docs/x${run}.md`, SEGMENTS)).toBe(false);
    });
  });
});

describe("docsOriginRedirects", () => {
  const HOST = { type: "host" as const, value: "(?:qrdx\\.dev|localhost)" };
  const rules = docsOriginRedirects("https://qrdx.dev//", {
    translatedSegments: SEGMENTS,
    has: [HOST],
  });

  it.each([
    ["/docs", "https://qrdx.dev/docs"],
    ["/docs.md", "https://qrdx.dev/docs.md"],
    ["/docs/dynamic-qr-codes", "https://qrdx.dev/docs/dynamic-qr-codes"],
    ["/docs/developers/mcp.md", "https://qrdx.dev/docs/developers/mcp.md"],
    ["/docs/developers/mcp.mdx", "https://qrdx.dev/docs/developers/mcp.mdx"],
    ["/es/docs", "https://qrdx.dev/es/docs"],
    ["/es/docs.md", "https://qrdx.dev/es/docs.md"],
    ["/pt-br/docs/help/contact", "https://qrdx.dev/pt-br/docs/help/contact"],
    ["/zh-hans/docs/teams.md", "https://qrdx.dev/zh-hans/docs/teams.md"],
    ["/llms.mdx/teams", "https://qrdx.dev/llms.mdx/teams"],
    ["/docs-md/es/teams", "https://qrdx.dev/docs-md/es/teams"],
    ["/og/docs/teams/image.png", "https://qrdx.dev/og/docs/teams/image.png"],
    ["/llms-full.txt", "https://qrdx.dev/llms-full.txt"],
  ])("sends %s to the same path on qrdx.dev, for now (307)", (path, to) => {
    const found = follow(rules, "localhost", path);
    expect(found?.target).toBe(to);
    expect(found?.rule.permanent).toBe(false);
  });

  it("leaves search, the docs site's assets and other pages alone", () => {
    for (const path of [
      "/api/search",
      "/docs-static/chunks/a.js",
      "/pricing",
      "/es/pricing",
      "/documentation",
      "/fr/x/docs",
    ]) {
      expect(follow(rules, "localhost", path), path).toBeUndefined();
    }
  });

  it("only on the hosts it's given (a custom domain's paths are short links)", () => {
    expect(rules.every((rule) => rule.has?.[0] === HOST)).toBe(true);
    expect(follow(rules, "go.example.com", "/docs/x")).toBeUndefined();
  });

  it("covers every URL docsZoneRewrites would proxy, but search and assets", () => {
    const proxied = docsZoneRewrites("https://docs.qrdx.dev", options)
      // The Markdown rules answer the page URLs, covered below.
      .filter((rule) => !rule.has)
      .map((rule) => rule.source)
      .filter(
        (source) => !["/api/search", "/docs-static/:path*"].includes(source),
      );
    expect(new Set(rules.map((rule) => rule.source))).toEqual(new Set(proxied));
  });
});

describe("next.config.ts with and without a docs site", () => {
  const saved = { ...process.env };

  async function load(zone: string | undefined) {
    process.env = { ...saved };
    if (zone) process.env.DOCS_ZONE_URL = zone;
    else delete process.env.DOCS_ZONE_URL;
    vi.resetModules();
    // As in tests/lib/csp.test.ts: no MDX for the routing rules.
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    const config = (await import("@/next.config")).default;
    const rewrites = (await config.rewrites?.()) as {
      beforeFiles: Rule[];
      afterFiles: Rule[];
    };
    return {
      redirects: ((await config.redirects?.()) ?? []) as Rule[],
      rewrites: [...rewrites.beforeFiles, ...rewrites.afterFiles],
    };
  }

  let without: Awaited<ReturnType<typeof load>>;
  let withZone: Awaited<ReturnType<typeof load>>;
  beforeAll(async () => {
    without = await load(undefined);
    withZone = await load("http://localhost:3290");
  }, 60_000);
  afterAll(() => {
    process.env = saved;
    // The suites below read @/env as the test run sets it.
    vi.resetModules();
  });

  it("without one, redirects the docs to qrdx.dev and proxies nothing", () => {
    for (const path of [
      "/docs",
      "/docs/dynamic-qr-codes",
      "/docs/developers/mcp.md",
      "/es/docs/dynamic-qr-codes",
      "/llms-full.txt",
      "/og/docs/teams/image.png",
    ]) {
      const found = follow(without.redirects, "localhost", path);
      expect(found?.target, path).toBe(`https://qrdx.dev${path}`);
      expect(found?.rule.permanent, path).toBe(false);
      expect(follow(without.rewrites, "localhost", path), path).toBeUndefined();
    }
    // A custom domain's short links keep their paths.
    expect(
      follow(without.redirects, "go.example.com", "/docs/x"),
    ).toBeUndefined();
    expect(
      follow(without.rewrites, "localhost", "/api/search"),
    ).toBeUndefined();
    // /help still goes to the help center first (lib/docs-redirects.ts).
    expect(follow(without.redirects, "qrdx.dev", "/help")?.target).toBe(
      "/docs/help",
    );
  });

  it("with one, proxies the docs there and redirects none of them", () => {
    for (const path of [
      "/docs/dynamic-qr-codes",
      "/es/docs/x",
      "/llms-full.txt",
    ]) {
      expect(
        follow(withZone.redirects, "localhost", path),
        path,
      ).toBeUndefined();
      expect(follow(withZone.rewrites, "localhost", path)?.target, path).toBe(
        `http://localhost:3290${path}`,
      );
    }
    expect(follow(withZone.rewrites, "localhost", "/api/search")?.target).toBe(
      "http://localhost:3290/api/search",
    );
  });

  it("keeps no docs rules of its own either way", () => {
    for (const { rewrites } of [without, withZone]) {
      for (const rule of rewrites) {
        expect(rule.destination, rule.source).not.toMatch(
          /^\/(?:llms\.mdx|docs-md|en\/docs)/,
        );
      }
    }
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
