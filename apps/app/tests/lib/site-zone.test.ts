// The site zone (@repo/next-config/site-zone): with SITE_ORIGIN set, this
// app proxies groups of its public pages (the blog first) and the site's
// build assets to the marketing site, on QRdx's own hosts; unset
// (self-hosting, and qrdx.dev until the cutover), nothing changes. The
// guard: the rules never take over one of this app's own paths, the pages
// are still here for deployments without a site, and proxy.ts sends the
// zone key on exactly the proxied requests.
import { existsSync } from "node:fs";
import path from "node:path";
import { docsZoneRewrites } from "@repo/i18n/docs";
import {
  CONSOLE_ASSET_PREFIX,
  CONSOLE_KEY_HEADER,
} from "@repo/next-config/console-zone";
import { CORE_PATHS, corePathSamples } from "@repo/next-config/core-paths";
import { prerenderedPagesSource } from "@repo/next-config/csp";
import {
  isSiteOrigin,
  isSitePagePath,
  isSitePath,
  isSiteZoneGroups,
  lowerCasedSitePrefix,
  parseSiteZoneGroups,
  SITE_ASSET_PREFIX,
  SITE_GROUP_NAMES,
  SITE_GROUPS,
  SITE_KEY_HEADER,
  siteGroup,
  siteZoneGroups,
  siteZoneRewrites,
} from "@repo/next-config/site-zone";
import type { NextConfig } from "next";
// Next's own route matching, as `next start` and `next dev` run it
// (server/lib/router-utils/filesystem.js, resolve-routes.js): it matches
// paths without regard to case, unlike the test helper below.
// @ts-expect-error: exported at run time, not in its declaration file
import { getMiddlewareMatchers } from "next/dist/build/analysis/get-page-static-info";
import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { matchHas } from "next/dist/shared/lib/router/utils/prepare-destination";
import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WORKSPACE_HEADER } from "@/lib/workspace-paths";

const ORIGIN = "https://qrdx-site.vercel.app";
const KEY = "test-site-key-0123456789abcdef0123456789abcdef";
const CONSOLE_ORIGIN = "https://qrdx-console.vercel.app";
const CONSOLE_KEY = "test-console-key-0123456789abcdef0123456789abcdef";
const DOCS = "https://docs.qrdx.dev";
const HOSTS = "(?:qrdx\\.dev|localhost)";

/** The site's pages, as this app still serves them for deployments without a site. */
const BLOG_DIR = path.resolve(
  import.meta.dirname,
  "../../app/(app)/(home)/blog",
);

interface ProxySession {
  lookups: number;
}

/**
 * What proxy.ts reads besides the request: the session and custom domains.
 * The site's paths are public, so neither should ever be looked up.
 */
function mockProxyDependencies(session: ProxySession) {
  vi.doMock("@/lib/account/session-origin-server", () => ({
    getSessionAllowingHold: async () => {
      session.lookups++;
      return null;
    },
    isSessionHeld: async () => false,
  }));
  vi.doMock("next/headers", () => ({ headers: async () => new Headers() }));
  vi.doMock("@/app/(app)/dashboard/domains/_lib/host-routing", () => ({
    routeCustomDomain: async () => null,
  }));
}

function unmockProxyDependencies() {
  vi.doUnmock("@/lib/account/session-origin-server");
  vi.doUnmock("next/headers");
  vi.doUnmock("@/app/(app)/dashboard/domains/_lib/host-routing");
}

describe("siteZoneRewrites", () => {
  const has = [{ type: "host", value: HOSTS }];

  it("adds nothing while SITE_ORIGIN is unset or empty", () => {
    expect(siteZoneRewrites(undefined, { hosts: HOSTS })).toEqual([]);
    expect(siteZoneRewrites("", { hosts: HOSTS })).toEqual([]);
  });

  it("adds nothing while no group is on", () => {
    expect(siteZoneRewrites(ORIGIN, { hosts: HOSTS, groups: [] })).toEqual([]);
  });

  it("proxies the blog and the assets, on the given hosts only", () => {
    expect(siteZoneRewrites(`${ORIGIN}//`, { hosts: HOSTS })).toEqual([
      {
        source: "/blog/:path*",
        destination: `${ORIGIN}/blog/:path*`,
        has,
      },
      {
        source: "/site-static/:path*",
        destination: `${ORIGIN}/site-static/:path*`,
        has,
      },
    ]);
  });

  it("lists each group once, in list order, whatever the groups option says", () => {
    expect(
      siteZoneRewrites(ORIGIN, { hosts: HOSTS, groups: ["blog", "blog"] }),
    ).toEqual(siteZoneRewrites(ORIGIN, { hosts: HOSTS }));
  });

  it("uses the origin alone, whatever else the value has", () => {
    for (const value of [`${ORIGIN}/base`, `${ORIGIN}/?x=1`, `${ORIGIN}#x`]) {
      expect(
        siteZoneRewrites(value, { hosts: HOSTS }).map(
          (rule) => rule.destination,
        ),
        value,
      ).toEqual([`${ORIGIN}/blog/:path*`, `${ORIGIN}/site-static/:path*`]);
    }
  });

  it("trims any number of trailing slashes, fast", () => {
    const run = "/".repeat(200_000);
    const start = performance.now();
    const [rule] = siteZoneRewrites(`${ORIGIN}${run}`, { hosts: HOSTS });
    expect(rule?.destination).toBe(`${ORIGIN}/blog/:path*`);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("isSiteOrigin (what env.ts accepts as SITE_ORIGIN)", () => {
  it.each([
    ORIGIN,
    `${ORIGIN}/`,
    "https://Qrdx-Site.vercel.app",
    "http://localhost:3010",
    "http://127.0.0.1:3010/",
  ])("accepts %s", (value) => {
    expect(isSiteOrigin(value)).toBe(true);
  });

  it.each([
    "",
    "qrdx-site.vercel.app",
    `${ORIGIN}?x=1`,
    `${ORIGIN}/blog`,
    `${ORIGIN}#x`,
    "https://user:pass@qrdx-site.vercel.app",
    "http://qrdx-site.vercel.app",
    "ftp://qrdx-site.vercel.app",
  ])("refuses %s", (value) => {
    expect(isSiteOrigin(value)).toBe(false);
  });

  it("stops the app from starting with anything else, naming the variable", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.resetModules();
      vi.stubEnv("SITE_ORIGIN", `${ORIGIN}/blog`);
      await expect(import("@/env")).rejects.toThrow("SITE_ORIGIN");
      vi.resetModules();
      vi.stubEnv("SITE_ORIGIN", `${ORIGIN}/`);
      expect((await import("@/env")).env.SITE_ORIGIN).toBe(`${ORIGIN}/`);
    } finally {
      vi.unstubAllEnvs();
      errors.mockRestore();
    }
  });
});

describe("SITE_ZONE_GROUPS", () => {
  it("means every group while unset or blank", () => {
    for (const value of [undefined, "", "  "]) {
      expect(parseSiteZoneGroups(value), String(value)).toEqual([
        ...SITE_GROUP_NAMES,
      ]);
      expect(siteZoneGroups(value), String(value)).toEqual([
        ...SITE_GROUP_NAMES,
      ]);
    }
  });

  it("names groups, each once, in list order", () => {
    expect(parseSiteZoneGroups("blog")).toEqual(["blog"]);
    expect(parseSiteZoneGroups(" blog , blog ")).toEqual(["blog"]);
    expect(isSiteZoneGroups("blog")).toBe(true);
  });

  it.each(["compare", "blog,", "Blog", "blog;compare", ","])(
    "refuses %s",
    (value) => {
      expect(parseSiteZoneGroups(value)).toBeNull();
      expect(isSiteZoneGroups(value)).toBe(false);
      expect(() => siteZoneGroups(value)).toThrow("SITE_ZONE_GROUPS");
    },
  );

  it("stops the app from starting with an unknown group, naming the variable", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.resetModules();
      vi.stubEnv("SITE_ZONE_GROUPS", "blog,compare");
      await expect(import("@/env")).rejects.toThrow("SITE_ZONE_GROUPS");
      vi.resetModules();
      vi.stubEnv("SITE_ZONE_GROUPS", "blog");
      expect((await import("@/env")).env.SITE_ZONE_GROUPS).toBe("blog");
    } finally {
      vi.unstubAllEnvs();
      errors.mockRestore();
    }
  });
});

describe("site paths", () => {
  it.each([
    ["/blog", "blog"],
    ["/blog/", "blog"],
    ["/blog/qr-codes-for-restaurant-menus", "blog"],
    ["/blog/rss.xml", "blog"],
    ["/blog/opengraph-image", "blog"],
    ["/blog/category/education", "blog"],
    ["/blog/category/education/opengraph-image-abc.png", "blog"],
    ["/blog/authors/ritesh-bucha", "blog"],
    ["/blog/some-post.md", "blog"],
    // Next matches rewrite sources without regard to case.
    ["/Blog/x", "blog"],
    ["/BLOG", "blog"],
  ])("%s is the site's %s group", (pathname, group) => {
    expect(siteGroup(pathname)).toBe(group);
    expect(isSitePath(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/blogx",
    "/blog.md",
    "/blo",
    "/customers",
    "/customers/flam",
    "/compare/x",
    "/docs",
    "/admin",
    "/dashboard/blog",
    "/es/blog",
    "/site-staticx",
  ])("%s isn't", (pathname) => {
    expect(siteGroup(pathname)).toBeNull();
    expect(isSitePath(pathname)).toBe(false);
  });

  it("knows the hrefs that must load the site's page in full", () => {
    for (const href of [
      "/blog",
      "/blog/dynamic-vs-static-qr-codes",
      "/blog/category/education?page=2#top",
      "/blog/rss.xml",
    ]) {
      expect(isSitePagePath(href), href).toBe(true);
    }
    for (const href of [
      "/",
      "/blogx",
      "/blog.md",
      "/customers",
      "/docs",
      "/site-static/_next/static/x.js",
      "https://qrdx.dev/blog",
      "//qrdx.dev/blog",
      "blog/relative",
    ]) {
      expect(isSitePagePath(href), href).toBe(false);
    }
  });

  it("includes the site's build assets, which belong to no group", () => {
    expect(isSitePath("/site-static/_next/static/x.js")).toBe(true);
    expect(siteGroup("/site-static/_next/static/x.js")).toBeNull();
  });

  it("follows the groups that are on", () => {
    expect(isSitePath("/blog", ["blog"])).toBe(true);
    expect(siteGroup("/blog", [])).toBeNull();
    expect(isSitePath("/blog", [])).toBe(false);
    // No group on, no rewrites: the assets aren't proxied either.
    expect(isSitePath("/site-static/x.js", [])).toBe(false);
  });
});

describe("lowerCasedSitePrefix (proxy.ts)", () => {
  it.each([
    ["/BLOG/x", "/blog/x"],
    ["/Blog", "/blog"],
    ["/bLoG/rss.xml", "/blog/rss.xml"],
    ["/SITE-STATIC/_next/x.js", "/site-static/_next/x.js"],
  ])("sends %s to %s", (pathname, expected) => {
    expect(lowerCasedSitePrefix(pathname)).toBe(expected);
  });

  it.each([
    "/blog",
    "/blog/X",
    "/site-static/x.js",
    "/Blogx",
    "/x/BLOG",
    "/",
    "/ADMIN/growth",
  ])("leaves %s alone", (pathname) => {
    expect(lowerCasedSitePrefix(pathname)).toBeNull();
  });
});

describe("the groups and this app's own paths", () => {
  it("names each group once, with well-formed prefixes", () => {
    expect(new Set(SITE_GROUP_NAMES).size).toBe(SITE_GROUP_NAMES.length);
    for (const group of SITE_GROUP_NAMES) {
      expect(SITE_GROUPS[group].length, group).toBeGreaterThan(0);
      for (const prefix of SITE_GROUPS[group]) {
        expect(prefix, prefix).toMatch(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/);
      }
    }
    expect(SITE_ASSET_PREFIX).toMatch(/^\/[a-z-]+$/);
    // Its own header, never the console's: each zone gets only its own key.
    expect(SITE_KEY_HEADER).toBe("x-qrdx-site-key");
    expect(SITE_KEY_HEADER).not.toBe(CONSOLE_KEY_HEADER);
  });

  it("takes over none of this app's own paths", () => {
    expect(corePathSamples().length).toBeGreaterThanOrEqual(CORE_PATHS.length);
    for (const sample of corePathSamples()) {
      expect(isSitePath(sample), sample).toBe(false);
      expect(lowerCasedSitePrefix(sample.toUpperCase()), sample).toBeNull();
    }
    for (const prefix of [
      ...SITE_GROUP_NAMES.flatMap((group) => SITE_GROUPS[group]),
      SITE_ASSET_PREFIX,
    ]) {
      for (const core of CORE_PATHS) {
        const root = core.endsWith("/*") ? core.slice(0, -2) : core;
        expect(
          prefix === root || prefix.startsWith(`${root}/`),
          `${prefix} is under ${core}`,
        ).toBe(false);
      }
    }
  });

  it("never lists an /admin path: the console's and this app's alone", () => {
    for (const prefix of [
      ...SITE_GROUP_NAMES.flatMap((group) => SITE_GROUPS[group]),
      SITE_ASSET_PREFIX,
    ]) {
      expect(prefix === "/admin" || prefix.startsWith("/admin/"), prefix).toBe(
        false,
      );
    }
    for (const pathname of ["/admin", "/admin/growth", "/ADMIN/blog"]) {
      expect(isSitePath(pathname), pathname).toBe(false);
      expect(isSitePagePath(pathname), pathname).toBe(false);
      expect(lowerCasedSitePrefix(pathname), pathname).toBeNull();
    }
    for (const rule of siteZoneRewrites(ORIGIN, { hosts: HOSTS })) {
      const match = getPathMatch(rule.source, {
        strict: true,
        removeUnnamedParams: true,
        regexModifier: (regex: string) => modifyRouteRegex(regex),
      });
      for (const pathname of ["/admin", "/admin/growth", "/admin/blog"]) {
        expect(match(pathname), `${rule.source} vs ${pathname}`).toBe(false);
      }
    }
  });

  it("keeps this app's blog pages, for deployments without a site", () => {
    // The change that removes the blog from this app deletes this check.
    for (const file of ["page.tsx", "[slug]/page.tsx", "rss.xml/route.ts"]) {
      expect(existsSync(path.join(BLOG_DIR, file)), file).toBe(true);
    }
  });
});

// The real next.config.ts, as Next resolves a request against it.
describe("next.config.ts", () => {
  const saved = { ...process.env };

  /** The app's config with these variables set (or, undefined, unset). */
  async function loadConfig(
    values: Record<string, string | undefined>,
  ): Promise<NextConfig> {
    for (const name of [
      "SITE_ORIGIN",
      "SITE_ZONE_KEY",
      "SITE_ZONE_GROUPS",
      "CONSOLE_ORIGIN",
      "CONSOLE_ZONE_KEY",
      "DOCS_ZONE_URL",
    ]) {
      delete process.env[name];
    }
    for (const [name, value] of Object.entries(values)) {
      if (value !== undefined) process.env[name] = value;
    }
    process.env.CSP_DEV = "1";
    vi.resetModules();
    // createMDX() rewrites .source/*.ts in the background; the routes don't
    // depend on MDX (tests/lib/csp.test.ts explains the race).
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    return (await import("@/next.config")).default as unknown as NextConfig;
  }

  let off: NextConfig;
  let on: NextConfig;
  let all: NextConfig;
  let warned: string[];

  beforeAll(async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    off = await loadConfig({});
    on = await loadConfig({ SITE_ORIGIN: `${ORIGIN}/`, SITE_ZONE_KEY: KEY });
    expect(warn).not.toHaveBeenCalled();
    all = await loadConfig({
      SITE_ORIGIN: ORIGIN,
      SITE_ZONE_KEY: KEY,
      SITE_ZONE_GROUPS: "blog",
      CONSOLE_ORIGIN: CONSOLE_ORIGIN,
      CONSOLE_ZONE_KEY: CONSOLE_KEY,
      DOCS_ZONE_URL: DOCS,
    });
    expect(warn).not.toHaveBeenCalled();
    await loadConfig({ SITE_ORIGIN: ORIGIN });
    warned = warn.mock.calls.map((call) => String(call[0]));
    warn.mockRestore();
  }, 120_000);

  afterAll(() => {
    process.env = saved;
    vi.doUnmock("fumadocs-mdx/next");
    unmockProxyDependencies();
  });

  /** Whether `url` (absolute, or a path on qrdx.dev) is on the site's origin. */
  const onSite = (url: string) =>
    new URL(url, "https://qrdx.dev").origin === ORIGIN;

  const resolve = (
    nextConfig: NextConfig,
    url: string,
    headers: Record<string, string> = {},
  ) => unstable_getResponseFromNextConfig({ url, nextConfig, headers });

  /** Where the site would get the request, or null. */
  async function siteTarget(
    nextConfig: NextConfig,
    url: string,
    headers?: Record<string, string>,
  ) {
    const response = await resolve(nextConfig, url, headers);
    const target = getRewrittenUrl(response) ?? getRedirectUrl(response);
    return target && onSite(target) ? target : null;
  }

  const CORE = [
    "/",
    "/pricing",
    "/blogx",
    "/blog.md",
    "/customers",
    "/customers/flam",
    "/compare",
    "/compare/x",
    "/changelogs",
    "/es/blog",
    "/admin/growth",
    "/console-static/x.js",
    "/api/auth/get-session",
    "/q/x",
    "/p/x",
    "/m/x",
    "/docs",
    "/_next/static/x.js",
    "/dashboard",
    "/sign-in",
    "/zone/home-numbers.json",
    "/zone/availability.json",
    "/site-staticx/x.js",
    ...corePathSamples(),
  ];

  it.each(CORE)("never sends %s to the site", async (pathname) => {
    expect(await siteTarget(on, `https://qrdx.dev${pathname}`)).toBeNull();
  });

  it.each([
    ["/blog", "/blog"],
    [
      "/blog/qr-codes-for-restaurant-menus",
      "/blog/qr-codes-for-restaurant-menus",
    ],
    [
      "/blog/dynamic-vs-static-qr-codes?utm=x",
      "/blog/dynamic-vs-static-qr-codes?utm=x",
    ],
    ["/blog/rss.xml", "/blog/rss.xml"],
    ["/blog/opengraph-image", "/blog/opengraph-image"],
    [
      "/blog/some-post/opengraph-image-abc123.png",
      "/blog/some-post/opengraph-image-abc123.png",
    ],
    ["/blog/category/education", "/blog/category/education"],
    ["/blog/authors/ritesh-bucha", "/blog/authors/ritesh-bucha"],
    ["/blog/some-post.md", "/blog/some-post.md"],
    ["/site-static/_next/static/x.js", "/site-static/_next/static/x.js"],
  ])("sends %s to the site", async (pathname, target) => {
    expect(await siteTarget(on, `https://qrdx.dev${pathname}`)).toBe(
      `${ORIGIN}${target}`,
    );
  });

  it("only on QRdx's own hosts", async () => {
    expect(await siteTarget(on, "http://localhost:3000/blog")).toBe(
      `${ORIGIN}/blog`,
    );
    expect(await siteTarget(on, "https://links.customer.com/blog")).toBeNull();
  });

  it.each(["/blog", "/blog/rss.xml", "/site-static/_next/static/x.js"])(
    "sends nothing to the site while it's unset: %s",
    async (pathname) => {
      expect(await siteTarget(off, `https://qrdx.dev${pathname}`)).toBeNull();
      expect(
        getRedirectUrl(await resolve(off, `https://qrdx.dev${pathname}`)),
      ).toBeNull();
    },
  );

  it("keeps this app's redirects ahead of the site: moved pages, trailing slashes", async () => {
    const moved = await resolve(
      on,
      "https://qrdx.dev/blog/flam-branded-qr-codes",
    );
    expect(moved.status).toBe(308);
    expect(getRedirectUrl(moved)).toBe("https://qrdx.dev/customers/flam");
    const slash = await resolve(on, "https://qrdx.dev/blog/");
    expect(slash.status).toBe(308);
    expect(getRedirectUrl(slash)).toBe("https://qrdx.dev/blog");
  });

  interface Rule {
    source: string;
    destination: string;
    has?: Parameters<typeof matchHas>[2];
    missing?: Parameters<typeof matchHas>[3];
  }
  const beforeFiles = async (nextConfig: NextConfig) => {
    const phases = (await nextConfig.rewrites?.()) as
      | { beforeFiles: Rule[] }
      | undefined;
    return phases?.beforeFiles ?? [];
  };

  it("adds exactly those two rules", async () => {
    const rules = await beforeFiles(on);
    expect(rules.filter((rule) => onSite(rule.destination))).toHaveLength(2);
    expect(rules.length - (await beforeFiles(off)).length).toBe(2);
  });

  it("puts them right after the console's when every zone is on", async () => {
    const rules = await beforeFiles(all);
    const docsCount = docsZoneRewrites(DOCS, { markdown: { has: [] } }).length;
    const zoneOf = (rule: Rule) => {
      const { origin } = new URL(rule.destination, "https://qrdx.dev");
      if (origin === DOCS) return "docs";
      if (origin === CONSOLE_ORIGIN) return "console";
      return origin === ORIGIN ? "site" : "app";
    };
    const zones = rules.map(zoneOf).filter((zone) => zone !== "app");
    expect(zones).toEqual([
      ...Array(docsCount).fill("docs"),
      "console",
      "console",
      "site",
      "site",
    ]);
    expect(rules.length - (await beforeFiles(off)).length).toBe(docsCount + 4);
    expect(await siteTarget(all, "https://qrdx.dev/blog/x")).toBe(
      `${ORIGIN}/blog/x`,
    );
    expect(
      getRewrittenUrl(await resolve(all, "https://qrdx.dev/admin/growth")),
    ).toBe(`${CONSOLE_ORIGIN}/admin/growth`);
    expect(
      getRewrittenUrl(await resolve(all, "https://qrdx.dev/docs/developers")),
    ).toBe(`${DOCS}/docs/developers`);
  });

  it("inlines SITE_ORIGIN and SITE_ZONE_GROUPS into server code, empty while unset", () => {
    const inlined = (nextConfig: NextConfig, name: string) =>
      nextConfig.compiler?.defineServer?.[`process.env.${name}`];
    expect(inlined(off, "SITE_ORIGIN")).toBe("");
    expect(inlined(off, "SITE_ZONE_GROUPS")).toBe("");
    expect(inlined(on, "SITE_ORIGIN")).toBe(`${ORIGIN}/`);
    expect(inlined(on, "SITE_ZONE_GROUPS")).toBe("");
    expect(inlined(all, "SITE_ORIGIN")).toBe(ORIGIN);
    expect(inlined(all, "SITE_ZONE_GROUPS")).toBe("blog");
  });

  it("warns at build time when the zone key is missing", () => {
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatch(/SITE_ZONE_KEY/);
  });

  // Next builds beforeFiles rewrites without experimental.caseSensitiveRoutes,
  // so /BLOG reaches the site too; the proxy's matcher has to see every such
  // path, or it would get there without the zone key.
  describe("in any case, with Next's own matching", () => {
    const req = { headers: { host: "qrdx.dev" } } as never;
    const rewriteMatches = async (pathname: string) =>
      (await beforeFiles(on))
        .filter((rule) => onSite(rule.destination))
        .some((rule) => {
          const match = getPathMatch(rule.source, {
            strict: true,
            removeUnnamedParams: true,
            regexModifier: (regex: string) => modifyRouteRegex(regex),
          });
          return (
            match(pathname) !== false &&
            matchHas(req, {}, rule.has, rule.missing) !== false
          );
        });

    let proxyMatches: (pathname: string) => boolean;
    beforeAll(async () => {
      // Only its matcher is read: no session or domain lookups run.
      vi.resetModules();
      mockProxyDependencies({ lookups: 0 });
      const { config } = await import("@/proxy");
      const matcher = getMiddlewareRouteMatcher(
        getMiddlewareMatchers(config.matcher, { basePath: "" } as never),
      );
      proxyMatches = (pathname) => matcher(pathname, req, {});
    });

    const CASINGS = [
      "/blog",
      "/BLOG",
      "/Blog/rss.xml",
      "/blog/Category/Education",
      "/bLoG/some-post/opengraph-image-abc.png",
      "/site-static/_next/static/x.js",
      "/SITE-STATIC/_next/static/x.js",
      "/Site-Static/x.js",
    ];

    it.each(CASINGS)(
      "%s reaches the site and passes the proxy",
      async (pathname) => {
        expect(await rewriteMatches(pathname)).toBe(true);
        expect(proxyMatches(pathname)).toBe(true);
      },
    );

    it("covers every prefix of every group, on or off", () => {
      for (const prefix of [
        ...SITE_GROUP_NAMES.flatMap((group) => SITE_GROUPS[group]),
        SITE_ASSET_PREFIX,
      ]) {
        for (const casing of [prefix, prefix.toUpperCase()]) {
          expect(proxyMatches(casing), casing).toBe(true);
          expect(proxyMatches(`${casing}/x`), casing).toBe(true);
        }
      }
    });

    it("never rewrites other paths, in any case", async () => {
      for (const pathname of ["/", "/BLOGX", "/Blog.md", "/x/blog"]) {
        expect(await rewriteMatches(pathname), pathname).toBe(false);
      }
    });
  });

  it("puts no page policy on the site's assets while it's on, and keeps it on its pages", async () => {
    const pageRule = async (nextConfig: NextConfig) =>
      ((await nextConfig.headers?.()) ?? []).find(
        (rule) =>
          rule.headers.some(
            (header) => header.key === "Content-Security-Policy",
          ) && rule.source.startsWith("/:path((?!"),
      )?.source;
    expect(await pageRule(off)).toBe(prerenderedPagesSource());
    expect(await pageRule(on)).toBe(
      prerenderedPagesSource([SITE_ASSET_PREFIX.slice(1)]),
    );
    expect(await pageRule(all)).toBe(
      prerenderedPagesSource([
        CONSOLE_ASSET_PREFIX.slice(1),
        SITE_ASSET_PREFIX.slice(1),
      ]),
    );
    const policy = async (nextConfig: NextConfig, pathname: string) =>
      (await resolve(nextConfig, `https://qrdx.dev${pathname}`)).headers.get(
        "content-security-policy",
      );
    expect(await policy(off, "/site-static/x.js")).toContain("script-src");
    expect(await policy(on, "/site-static/x.js")).toBeNull();
    // Public pages keep this app's prerendered-page policy, as the docs' do.
    expect(await policy(on, "/blog")).toContain("script-src");
    expect(await policy(on, "/blog/some-post")).toContain("script-src");
    expect(await policy(on, "/pricing")).toContain("script-src");
  });

  it("adds no cache rule of its own: the site's responses decide", async () => {
    for (const pathname of ["/blog", "/blog/rss.xml", "/site-static/x.js"]) {
      const response = await resolve(on, `https://qrdx.dev${pathname}`);
      expect(response.headers.get("cache-control"), pathname).toBeNull();
    }
  });
});

describe("proxy.ts", () => {
  const saved = { ...process.env };
  const session: ProxySession = { lookups: 0 };

  /** The proxy with SITE_ORIGIN (and the key) set or unset. */
  async function loadProxy(
    values: Record<string, string | undefined>,
  ): Promise<(request: NextRequest) => Promise<Response>> {
    for (const name of [
      "SITE_ORIGIN",
      "SITE_ZONE_KEY",
      "SITE_ZONE_GROUPS",
      "CONSOLE_ORIGIN",
      "CONSOLE_ZONE_KEY",
    ]) {
      delete process.env[name];
    }
    for (const [name, value] of Object.entries(values)) {
      if (value !== undefined) process.env[name] = value;
    }
    process.env.CSP_DEV = "1";
    vi.resetModules();
    mockProxyDependencies(session);
    return (await import("@/proxy")).default;
  }

  let on: (request: NextRequest) => Promise<Response>;
  let onWithoutKey: (request: NextRequest) => Promise<Response>;
  let off: (request: NextRequest) => Promise<Response>;
  let both: (request: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    off = await loadProxy({});
    onWithoutKey = await loadProxy({ SITE_ORIGIN: ORIGIN });
    both = await loadProxy({
      SITE_ORIGIN: ORIGIN,
      SITE_ZONE_KEY: KEY,
      SITE_ZONE_GROUPS: "blog",
      CONSOLE_ORIGIN: CONSOLE_ORIGIN,
      CONSOLE_ZONE_KEY: CONSOLE_KEY,
    });
    on = await loadProxy({ SITE_ORIGIN: ORIGIN, SITE_ZONE_KEY: KEY });
  });

  afterAll(() => {
    process.env = saved;
    unmockProxyDependencies();
  });

  const request = (url: string, headers: Record<string, string> = {}) =>
    new NextRequest(url, {
      headers: { host: new URL(url).host, ...headers },
    });

  /** The request headers Next renders (or proxies) with, as the proxy set them. */
  const forwarded = (response: Response) => {
    const names =
      response.headers.get("x-middleware-override-headers")?.split(",") ?? [];
    return (name: string) =>
      names.includes(name)
        ? response.headers.get(`x-middleware-request-${name}`)
        : undefined;
  };

  it.each([
    "/blog",
    "/blog/some-post?utm=x",
    "/blog/rss.xml",
    "/blog/category/education/opengraph-image-abc.png",
    "/site-static/_next/static/x.js",
  ])(
    "gives %s the zone key, dropping a forged one, and no policy of its own",
    async (pathname) => {
      const response = await on(
        request(`https://qrdx.dev${pathname}`, { [SITE_KEY_HEADER]: "forged" }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toBeNull();
      const sent = forwarded(response);
      expect(sent(SITE_KEY_HEADER)).toBe(KEY);
      expect(sent("content-security-policy")).toBeUndefined();
    },
  );

  it("drops the workspace header the browser sent", async () => {
    const response = await on(
      request("https://qrdx.dev/blog", { [WORKSPACE_HEADER]: "acme" }),
    );
    const sent = forwarded(response);
    expect(sent(WORKSPACE_HEADER)).toBeUndefined();
    expect(sent(SITE_KEY_HEADER)).toBe(KEY);
  });

  it("drops a key the browser sent when there's none to send", async () => {
    const response = await onWithoutKey(
      request("https://qrdx.dev/blog", { [SITE_KEY_HEADER]: "forged" }),
    );
    expect(forwarded(response)(SITE_KEY_HEADER)).toBeUndefined();
    expect(
      response.headers.get("x-middleware-override-headers")?.split(","),
    ).not.toContain(SITE_KEY_HEADER);
  });

  it("sends the key where next.config.ts proxies only: not on other hosts", async () => {
    const response = await on(request("https://other.example.com/blog"));
    expect(response.status).toBe(200);
    expect(forwarded(response)(SITE_KEY_HEADER)).toBeUndefined();
  });

  it("changes nothing while SITE_ORIGIN is unset, but drops a forged site key", async () => {
    const response = await off(request("https://qrdx.dev/blog"));
    expect(response.status).toBe(200);
    // Passed on untouched: no header is rewritten at all.
    expect(response.headers.get("x-middleware-override-headers")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
    const forged = await off(
      request("https://qrdx.dev/blog", { [SITE_KEY_HEADER]: "forged" }),
    );
    expect(forged.status).toBe(200);
    expect(
      forged.headers.get("x-middleware-override-headers")?.split(","),
    ).not.toContain(SITE_KEY_HEADER);
    expect(forwarded(forged)(SITE_KEY_HEADER)).toBeUndefined();
  });

  // The four rules for the site's key header, each on its own.
  it("strips a client-sent site key on every request it handles", async () => {
    for (const [proxy, mode] of [
      [on, "on"],
      [off, "off"],
      [both, "both"],
    ] as const) {
      for (const pathname of [
        "/blog",
        "/blog/some-post",
        "/site-static/x.js",
        "/admin/users/u1",
        "/oauth/consent",
        "/invite/abc",
      ]) {
        const response = await proxy(
          request(`https://qrdx.dev${pathname}`, {
            [SITE_KEY_HEADER]: "forged",
          }),
        );
        const label = `${mode} ${pathname}`;
        expect(response.status, label).toBe(200);
        const names =
          response.headers.get("x-middleware-override-headers")?.split(",") ??
          [];
        // Either the request's headers are replaced without it, or it's the
        // real key on a proxied site request: never the browser's value.
        expect(names.length, label).toBeGreaterThan(0);
        expect(forwarded(response)(SITE_KEY_HEADER), label).not.toBe("forged");
      }
    }
  });

  it("adds the site key only on requests it proxies to the site", async () => {
    const proxied = await on(request("https://qrdx.dev/blog/some-post"));
    expect(forwarded(proxied)(SITE_KEY_HEADER)).toBe(KEY);
    for (const [proxy, url] of [
      [on, "https://other.example.com/blog"],
      [on, "https://qrdx.dev/admin/users/u1"],
      [on, "https://qrdx.dev/oauth/consent"],
      [off, "https://qrdx.dev/blog"],
      [both, "https://qrdx.dev/admin/growth"],
      [both, "https://qrdx.dev/console-static/x.js"],
    ] as const) {
      const response = await proxy(request(url));
      expect(forwarded(response)(SITE_KEY_HEADER), url).toBeUndefined();
    }
  });

  it("never sends the console's key header to the site", async () => {
    for (const pathname of ["/blog", "/blog/some-post", "/site-static/x.js"]) {
      const response = await both(
        request(`https://qrdx.dev${pathname}`, {
          [CONSOLE_KEY_HEADER]: "forged",
        }),
      );
      const sent = forwarded(response);
      expect(sent(SITE_KEY_HEADER), pathname).toBe(KEY);
      expect(sent(CONSOLE_KEY_HEADER), pathname).toBeUndefined();
    }
  });

  it("never sends the site's key header to the console", async () => {
    for (const pathname of ["/admin/growth", "/console-static/x.js"]) {
      const response = await both(
        request(`https://qrdx.dev${pathname}`, {
          [SITE_KEY_HEADER]: "forged",
        }),
      );
      const sent = forwarded(response);
      expect(sent(CONSOLE_KEY_HEADER), pathname).toBe(CONSOLE_KEY);
      expect(sent(SITE_KEY_HEADER), pathname).toBeUndefined();
    }
  });

  it("tells the zones apart when both are on: each gets its own key", async () => {
    const site = await both(request("https://qrdx.dev/blog/some-post"));
    expect(forwarded(site)(SITE_KEY_HEADER)).toBe(KEY);
    const console = await both(request("https://qrdx.dev/console-static/x.js"));
    expect(forwarded(console)(CONSOLE_KEY_HEADER)).toBe(CONSOLE_KEY);
  });

  it.each([
    ["/BLOG/some-post?page=2", "/blog/some-post?page=2"],
    ["/Blog", "/blog"],
    ["/SITE-STATIC/_next/x.js", "/site-static/_next/x.js"],
  ])("sends %s to the lower-case path, in both modes", async (path, target) => {
    for (const proxy of [on, off]) {
      const response = await proxy(request(`https://qrdx.dev${path}`));
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        `https://qrdx.dev${target}`,
      );
    }
  });

  it("answers 404 for dot segments in site paths, in both modes", async () => {
    for (const proxy of [on, off]) {
      // A bare %2e%2e segment never gets here: URL parsing resolves it first.
      for (const path of [
        "/site-static/a..b.js",
        "/site-static/a%2E%2Eb.js",
        "/blog/x%2Ey",
      ]) {
        const response = await proxy(request(`https://qrdx.dev${path}`));
        expect(response.status, path).toBe(404);
      }
    }
  });

  it("never looks up a session for the site's pages or assets", async () => {
    session.lookups = 0;
    for (const proxy of [on, off, both]) {
      for (const path of ["/blog", "/blog/some-post", "/site-static/x.js"]) {
        expect((await proxy(request(`https://qrdx.dev${path}`))).status).toBe(
          200,
        );
      }
    }
    expect(session.lookups).toBe(0);
  });
});
