// The back-office console zone (@repo/next-config/console-zone): with
// CONSOLE_ORIGIN set, this app proxies five /admin sections and the console's
// build assets to it, on QRdx's own hosts; unset (self-hosting, and qrdx.dev
// until the cutover), nothing changes. The guard: the rules never take over
// one of this app's own paths, the sections line up with the pages on disk
// and the admin menu, and proxy.ts treats exactly the proxied requests as
// the console's.
import { existsSync } from "node:fs";
import path from "node:path";
import { isAuthCookieName, withoutAuthCookies } from "@repo/auth/auth-cookies";
import { docsZoneRewrites } from "@repo/i18n/docs";
import {
  CONSOLE_ASSET_PREFIX,
  CONSOLE_KEY_HEADER,
  CONSOLE_SECTIONS,
  consoleReturnPath,
  consoleSection,
  consoleZoneRewrites,
  hasDotSegment,
  isConsoleOrigin,
  isConsolePath,
  lowerCasedZonePrefix,
} from "@repo/next-config/console-zone";
import { CORE_PATHS, corePathSamples } from "@repo/next-config/core-paths";
import { prerenderedPagesSource } from "@repo/next-config/csp";
import {
  hostMatcher,
  platformHostsPattern,
} from "@repo/next-config/platform-hosts";
import type { NextConfig } from "next";
// Next's own route matching, as `next start` and `next dev` run it
// (server/lib/router-utils/filesystem.js, resolve-routes.js), not the test
// helper above, which matches paths case-sensitively.
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
import { ADMIN_NAV_ITEMS, adminNavLinks } from "@/app/(app)/admin/_lib/nav";
import { WORKSPACE_HEADER } from "@/lib/workspace-paths";

const ORIGIN = "https://qrdx-console.vercel.app";
const KEY = "test-zone-key-0123456789abcdef0123456789abcdef";
const HOSTS = "(?:qrdx\\.dev|localhost)";

/**
 * Sections this app still has its own pages for. They're served by the
 * console only while CONSOLE_ORIGIN is set; the removal PR deletes the pages
 * and this list, and from then on no section may exist in both apps.
 */
const MOVING_SECTIONS: readonly string[] = [
  "growth",
  "numbers",
  "subscriptions",
  "ai-usage",
  "affiliates",
];

interface ProxySession {
  /** Whether the signed-in session is held (lib/account/session-origin.ts) */
  held: boolean;
  lookups: number;
  holdChecks: number;
}

/**
 * What proxy.ts reads besides the request: the session (signed in as an
 * admin; held or not) and custom domains (none). Nothing is looked up.
 */
function mockProxyDependencies(session: ProxySession) {
  vi.doMock("@/lib/account/session-origin-server", () => ({
    getSessionAllowingHold: async () => {
      session.lookups++;
      return { user: { id: "admin_1" }, session: { id: "s1" } };
    },
    isSessionHeld: async () => {
      session.holdChecks++;
      return session.held;
    },
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

const ADMIN_DIR = path.resolve(import.meta.dirname, "../../app/(app)/admin");

describe("consoleZoneRewrites", () => {
  it("adds nothing while CONSOLE_ORIGIN is unset or empty", () => {
    expect(consoleZoneRewrites(undefined, { hosts: HOSTS })).toEqual([]);
    expect(consoleZoneRewrites("", { hosts: HOSTS })).toEqual([]);
  });

  it("proxies the sections and the assets, on the given hosts only", () => {
    const has = [{ type: "host", value: HOSTS }];
    expect(consoleZoneRewrites(`${ORIGIN}//`, { hosts: HOSTS })).toEqual([
      {
        source:
          "/admin/:section(growth|numbers|subscriptions|ai-usage|affiliates)/:path*",
        destination: `${ORIGIN}/admin/:section/:path*`,
        has,
      },
      {
        source: "/console-static/:path*",
        destination: `${ORIGIN}/console-static/:path*`,
        has,
      },
    ]);
  });

  it("uses the origin alone, whatever else the value has", () => {
    for (const value of [`${ORIGIN}/base`, `${ORIGIN}/?x=1`, `${ORIGIN}#x`]) {
      expect(
        consoleZoneRewrites(value, { hosts: HOSTS }).map(
          (rule) => rule.destination,
        ),
        value,
      ).toEqual([
        `${ORIGIN}/admin/:section/:path*`,
        `${ORIGIN}/console-static/:path*`,
      ]);
    }
  });

  it("trims any number of trailing slashes, fast", () => {
    const run = "/".repeat(200_000);
    const start = performance.now();
    const [rule] = consoleZoneRewrites(`${ORIGIN}${run}`, { hosts: HOSTS });
    expect(rule?.destination).toBe(`${ORIGIN}/admin/:section/:path*`);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("isConsoleOrigin (what env.ts accepts as CONSOLE_ORIGIN)", () => {
  it.each([
    ORIGIN,
    `${ORIGIN}/`,
    "https://Qrdx-Console.vercel.app",
    "http://localhost:3002",
    "http://127.0.0.1:3002/",
  ])("accepts %s", (value) => {
    expect(isConsoleOrigin(value)).toBe(true);
  });

  it.each([
    "",
    "qrdx-console.vercel.app",
    `${ORIGIN}?x=1`,
    `${ORIGIN}/base`,
    `${ORIGIN}#x`,
    "https://user:pass@qrdx-console.vercel.app",
    "http://qrdx-console.vercel.app",
    "ftp://qrdx-console.vercel.app",
  ])("refuses %s", (value) => {
    expect(isConsoleOrigin(value)).toBe(false);
  });

  it("stops the app from starting with anything else, naming the variable", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.resetModules();
      vi.stubEnv("CONSOLE_ORIGIN", `${ORIGIN}?x=1`);
      await expect(import("@/env")).rejects.toThrow("CONSOLE_ORIGIN");
      vi.resetModules();
      vi.stubEnv("CONSOLE_ORIGIN", `${ORIGIN}/`);
      expect((await import("@/env")).env.CONSOLE_ORIGIN).toBe(`${ORIGIN}/`);
    } finally {
      vi.unstubAllEnvs();
      errors.mockRestore();
    }
  });
});

describe("console paths", () => {
  it.each([
    ["/admin/growth", "growth"],
    ["/admin/numbers", "numbers"],
    ["/admin/subscriptions", "subscriptions"],
    ["/admin/ai-usage", "ai-usage"],
    ["/admin/affiliates", "affiliates"],
    ["/admin/affiliates/abc", "affiliates"],
    ["/admin/growth/", "growth"],
    // Next matches rewrite sources without regard to case.
    ["/admin/Growth", "growth"],
  ])("%s is the console's %s section", (pathname, section) => {
    expect(consoleSection(pathname)).toBe(section);
    expect(isConsolePath(pathname)).toBe(true);
  });

  it.each([
    "/admin",
    "/admin/",
    "/admin/users",
    "/admin/users/growth",
    "/admin/growthx",
    "/admin/confirm",
    "/admin/search",
    "/growth",
    "/dashboard/admin/growth",
    "/console-staticx",
  ])("%s isn't", (pathname) => {
    expect(consoleSection(pathname)).toBeNull();
    expect(isConsolePath(pathname)).toBe(false);
  });

  it("includes the console's build assets, which aren't a section", () => {
    expect(isConsolePath("/console-static/_next/static/x.js")).toBe(true);
    expect(consoleSection("/console-static/_next/static/x.js")).toBeNull();
  });
});

describe("lowerCasedZonePrefix and hasDotSegment (proxy.ts)", () => {
  it.each([
    ["/ADMIN/growth", "/admin/growth"],
    ["/Admin", "/admin"],
    ["/aDmIn/affiliates/X", "/admin/affiliates/X"],
    ["/CONSOLE-STATIC/_next/x.js", "/console-static/_next/x.js"],
  ])("sends %s to %s", (pathname, expected) => {
    expect(lowerCasedZonePrefix(pathname)).toBe(expected);
  });

  it.each([
    "/admin",
    "/admin/growth",
    "/console-static/x.js",
    "/Adminx",
    "/x/ADMIN",
    "/",
  ])("leaves %s alone", (pathname) => {
    expect(lowerCasedZonePrefix(pathname)).toBeNull();
  });

  it("finds dot segments, encoded or not", () => {
    for (const pathname of [
      "/console-static/../admin/growth",
      "/console-static/%2e%2e/admin/growth",
      "/console-static/%2E%2E/x",
      "/admin/growth/x%2ey",
    ]) {
      expect(hasDotSegment(pathname), pathname).toBe(true);
    }
    expect(hasDotSegment("/console-static/_next/static/x.js")).toBe(false);
  });
});

describe("Better Auth's cookies (@repo/auth/auth-cookies)", () => {
  it.each([
    "better-auth.session_token",
    "__Secure-better-auth.session_token",
    "__Secure-better-auth.session_data",
    "better-auth.dont_remember",
    "better-auth-session_token",
  ])("knows %s", (name) => {
    expect(isAuthCookieName(name)).toBe(true);
  });

  it.each([
    "theme",
    "NEXT_LOCALE",
    "x-better-auth.session_token",
    "betterauth",
  ])("leaves %s", (name) => {
    expect(isAuthCookieName(name)).toBe(false);
  });

  it("keeps every other cookie", () => {
    expect(
      withoutAuthCookies(
        "theme=dark; __Secure-better-auth.session_token=abc.def; NEXT_LOCALE=es;better-auth.session_data=x",
      ),
    ).toBe("theme=dark; NEXT_LOCALE=es");
    expect(
      withoutAuthCookies("__Secure-better-auth.session_token=a"),
    ).toBeNull();
    expect(withoutAuthCookies("")).toBeNull();
  });
});

describe("consoleReturnPath (/admin/confirm's ?next=)", () => {
  it.each([
    ["/admin/affiliates", "/admin/affiliates"],
    ["/admin/affiliates/abc?page=2", "/admin/affiliates/abc?page=2"],
    ["/admin/growth#weeks", "/admin/growth"],
  ])("accepts %s", (next, expected) => {
    expect(consoleReturnPath(next)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "admin/growth",
    "/admin",
    "/admin/users/u1",
    "/admin/confirm?next=/admin/growth",
    "/admin/growth/../users",
    "/console-static/_next/static/x.js",
    "//evil.example/admin/growth",
    "/\\evil.example/admin/growth",
    "https://evil.example/admin/growth",
    "javascript:alert(1)",
  ])("refuses %s", (next) => {
    expect(consoleReturnPath(next)).toBeNull();
  });
});

describe("the sections and the admin menu", () => {
  it("names each section once", () => {
    expect(new Set(CONSOLE_SECTIONS).size).toBe(CONSOLE_SECTIONS.length);
  });

  it("leaves no section in both apps, apart from the ones still moving", () => {
    for (const section of CONSOLE_SECTIONS) {
      expect(
        !existsSync(path.join(ADMIN_DIR, section)) ||
          MOVING_SECTIONS.includes(section),
        section,
      ).toBe(true);
    }
  });

  it("lists only console sections as console pages, and every section", () => {
    const consoleItems = ADMIN_NAV_ITEMS.filter(
      (item) => item.zone === "console",
    ).map((item) => item.href);
    for (const href of consoleItems) {
      expect(consoleSection(href), href).not.toBeNull();
    }
    for (const section of CONSOLE_SECTIONS) {
      const href = `/admin/${section}`;
      expect(
        consoleItems.includes(href) ||
          (MOVING_SECTIONS.includes(section) &&
            ADMIN_NAV_ITEMS.some((item) => item.href === href)),
        section,
      ).toBe(true);
    }
  });

  it("shows the same menu as before while the console is off", () => {
    const links = adminNavLinks(false);
    expect(links.map((link) => link.href)).toEqual([
      "/admin",
      "/admin/growth",
      "/admin/users",
      "/admin/themes",
      "/admin/community",
      "/admin/codes",
      "/admin/abuse",
      "/admin/ai-usage",
      "/admin/subscriptions",
      "/admin/numbers",
      "/admin/affiliates",
      "/admin/integrations",
      "/admin/audit-log",
      "/admin/health",
    ]);
    expect(links.some((link) => link.crossZone)).toBe(false);
  });

  it("loads the console's sections as new pages while it's on", () => {
    const crossZone = adminNavLinks(true)
      .filter((link) => link.crossZone)
      .map((link) => link.href.replace("/admin/", ""));
    expect(crossZone.sort()).toEqual([...CONSOLE_SECTIONS].sort());
  });
});

describe("platform hosts (next.config's host conditions and proxy.ts)", () => {
  const matches = hostMatcher(platformHostsPattern("https://qr.example.org"));

  it.each([
    "qrdx.dev",
    "www.qrdx.dev",
    "qrdx-git-x.vercel.app",
    "localhost:3000",
    "127.0.0.1:3000",
    "QRDX.DEV",
    "qr.example.org",
  ])("%s is QRdx's (or this deployment's)", (host) => {
    expect(matches(host)).toBe(true);
  });

  it.each([
    null,
    "",
    "links.customer.com",
    "qrdx.dev.evil.example",
    "evilqrdx.dev",
    "example.org",
  ])("%s isn't", (host) => {
    expect(matches(host)).toBe(false);
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

  const DOCS = "https://docs.qrdx.dev";
  let on: NextConfig;
  let off: NextConfig;
  let both: NextConfig;
  let warned: string[];

  beforeAll(async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    off = await loadConfig({});
    expect(warn).not.toHaveBeenCalled();
    both = await loadConfig({
      CONSOLE_ORIGIN: ORIGIN,
      CONSOLE_ZONE_KEY: KEY,
      DOCS_ZONE_URL: DOCS,
    });
    expect(warn).not.toHaveBeenCalled();
    on = await loadConfig({ CONSOLE_ORIGIN: `${ORIGIN}/` });
    warned = warn.mock.calls.map((call) => String(call[0]));
    warn.mockRestore();
  }, 60_000);

  afterAll(() => {
    process.env = saved;
    vi.doUnmock("fumadocs-mdx/next");
    unmockProxyDependencies();
  });

  /** Whether `url` (absolute, or a path on qrdx.dev) is on the console's origin. */
  const onConsole = (url: string) =>
    new URL(url, "https://qrdx.dev").origin === ORIGIN;

  const resolve = (
    nextConfig: NextConfig,
    url: string,
    headers: Record<string, string> = {},
  ) => unstable_getResponseFromNextConfig({ url, nextConfig, headers });

  /** Where the console would get the request, or null. */
  async function consoleTarget(
    nextConfig: NextConfig,
    url: string,
    headers?: Record<string, string>,
  ) {
    const response = await resolve(nextConfig, url, headers);
    const target = getRewrittenUrl(response) ?? getRedirectUrl(response);
    return target && onConsole(target) ? target : null;
  }

  const CORE = [
    "/admin",
    "/admin/users",
    "/admin/users/x",
    "/admin/search?q=a",
    "/admin/confirm",
    "/admin/confirm?next=/admin/growth",
    "/admin/growthx",
    "/admin/audit-log",
    "/admin/health",
    "/api/auth/get-session",
    "/q/x",
    "/p/x",
    "/m/x",
    "/docs",
    "/_next/static/x.js",
    "/dashboard",
    "/sign-in",
    "/",
    "/pricing",
    "/zone/home-numbers.json",
    "/zone/availability.json",
    ...corePathSamples(),
  ];

  it("covers every entry of the core-path list", () => {
    expect(corePathSamples().length).toBeGreaterThanOrEqual(CORE_PATHS.length);
  });

  it.each(CORE)("never sends %s to the console", async (pathname) => {
    expect(await consoleTarget(on, `https://qrdx.dev${pathname}`)).toBeNull();
  });

  it.each([
    ["/admin/growth", "/admin/growth"],
    ["/admin/numbers", "/admin/numbers"],
    [
      "/admin/subscriptions?status=active",
      "/admin/subscriptions?status=active",
    ],
    ["/admin/ai-usage", "/admin/ai-usage"],
    ["/admin/affiliates", "/admin/affiliates"],
    ["/admin/affiliates/abc?page=2", "/admin/affiliates/abc?page=2"],
    ["/console-static/_next/static/x.js", "/console-static/_next/static/x.js"],
  ])("sends %s to the console", async (pathname, target) => {
    expect(await consoleTarget(on, `https://qrdx.dev${pathname}`)).toBe(
      `${ORIGIN}${target}`,
    );
  });

  it("only on QRdx's own hosts", async () => {
    expect(await consoleTarget(on, "http://localhost:3000/admin/growth")).toBe(
      `${ORIGIN}/admin/growth`,
    );
    expect(
      await consoleTarget(on, "https://links.customer.com/admin/growth"),
    ).toBeNull();
  });

  it.each([
    "/admin/growth",
    "/admin/affiliates/abc?page=2",
    "/console-static/_next/static/x.js",
  ])("sends nothing to the console while it's unset: %s", async (pathname) => {
    expect(await consoleTarget(off, `https://qrdx.dev${pathname}`)).toBeNull();
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
    expect(rules.filter((rule) => onConsole(rule.destination))).toHaveLength(2);
    expect(rules.length - (await beforeFiles(off)).length).toBe(2);
  });

  it("puts them right after the docs zone's when both zones are on", async () => {
    const rules = await beforeFiles(both);
    const docsCount = docsZoneRewrites(DOCS, { markdown: { has: [] } }).length;
    const zoneOf = (rule: Rule) => {
      const { origin } = new URL(rule.destination, "https://qrdx.dev");
      if (origin === DOCS) return "docs";
      return origin === ORIGIN ? "console" : "app";
    };
    const zones = rules.map(zoneOf);
    const firstDocs = zones.indexOf("docs");
    expect(zones.slice(firstDocs, firstDocs + docsCount + 2)).toEqual([
      ...Array(docsCount).fill("docs"),
      "console",
      "console",
    ]);
    expect(zones.filter((zone) => zone !== "app")).toHaveLength(docsCount + 2);
    expect(rules.length - (await beforeFiles(off)).length).toBe(docsCount + 2);
    expect(await consoleTarget(both, "https://qrdx.dev/admin/growth")).toBe(
      `${ORIGIN}/admin/growth`,
    );
    expect(await consoleTarget(both, "https://qrdx.dev/docs")).toBeNull();
  });

  it("inlines CONSOLE_ORIGIN into server code, empty while unset", () => {
    const inlined = (nextConfig: NextConfig) =>
      nextConfig.compiler?.defineServer?.["process.env.CONSOLE_ORIGIN"];
    expect(inlined(off)).toBe("");
    expect(inlined(on)).toBe(`${ORIGIN}/`);
    expect(inlined(both)).toBe(ORIGIN);
  });

  it("warns at build time when the zone key is missing", () => {
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatch(/CONSOLE_ZONE_KEY/);
  });

  // Next builds beforeFiles rewrites without experimental.caseSensitiveRoutes,
  // so /ADMIN/growth reaches the console too; the proxy's matcher has to see
  // every such path, or it would get there without the proxy's checks.
  describe("in any case, with Next's own matching", () => {
    const req = { headers: { host: "qrdx.dev" } } as never;
    const rewriteMatches = async (pathname: string) =>
      (await beforeFiles(on))
        .filter((rule) => onConsole(rule.destination))
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
      mockProxyDependencies({ held: false, lookups: 0, holdChecks: 0 });
      const { config } = await import("@/proxy");
      const matcher = getMiddlewareRouteMatcher(
        getMiddlewareMatchers(config.matcher, { basePath: "" } as never),
      );
      proxyMatches = (pathname) => matcher(pathname, req, {});
    });

    const CASINGS = [
      "/admin/growth",
      "/ADMIN/growth",
      "/Admin/affiliates/abc",
      "/aDmIn/GROWTH",
      "/admin/Numbers",
      "/console-static/_next/static/x.js",
      "/CONSOLE-STATIC/_next/static/x.js",
      "/Console-Static/x.js",
    ];

    it.each(CASINGS)(
      "%s reaches the console and passes the proxy",
      async (pathname) => {
        expect(await rewriteMatches(pathname)).toBe(true);
        expect(proxyMatches(pathname)).toBe(true);
      },
    );

    it("never rewrites the other sections, in any case", async () => {
      for (const pathname of ["/ADMIN", "/Admin/users", "/ADMIN/growthx"]) {
        expect(await rewriteMatches(pathname), pathname).toBe(false);
      }
    });
  });

  it("puts no page policy on the console's assets while it's on", async () => {
    const pageRule = async (nextConfig: NextConfig) =>
      ((await nextConfig.headers?.()) ?? []).find(
        (rule) =>
          rule.headers.some(
            (header) => header.key === "Content-Security-Policy",
          ) && rule.source.startsWith("/:path((?!"),
      )?.source;
    expect(await pageRule(off)).toBe(prerenderedPagesSource());
    expect(await pageRule(on)).toBe(
      prerenderedPagesSource([CONSOLE_ASSET_PREFIX.slice(1)]),
    );
    const policy = async (nextConfig: NextConfig, pathname: string) =>
      (await resolve(nextConfig, `https://qrdx.dev${pathname}`)).headers.get(
        "content-security-policy",
      );
    expect(await policy(off, "/console-static/x.js")).toContain("script-src");
    expect(await policy(on, "/console-static/x.js")).toBeNull();
    expect(await policy(on, "/pricing")).toContain("script-src");
  });
});

describe("proxy.ts", () => {
  const saved = { ...process.env };
  const session: ProxySession = { held: false, lookups: 0, holdChecks: 0 };

  /** The proxy with CONSOLE_ORIGIN (and the key) set or unset. */
  async function loadProxy(
    values: Record<string, string | undefined>,
  ): Promise<(request: NextRequest) => Promise<Response>> {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    process.env.CSP_DEV = "1";
    vi.resetModules();
    mockProxyDependencies(session);
    return (await import("@/proxy")).default;
  }

  let on: (request: NextRequest) => Promise<Response>;
  let onWithoutKey: (request: NextRequest) => Promise<Response>;
  let off: (request: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    off = await loadProxy({
      CONSOLE_ORIGIN: undefined,
      CONSOLE_ZONE_KEY: undefined,
    });
    onWithoutKey = await loadProxy({
      CONSOLE_ORIGIN: ORIGIN,
      CONSOLE_ZONE_KEY: undefined,
    });
    on = await loadProxy({ CONSOLE_ORIGIN: ORIGIN, CONSOLE_ZONE_KEY: KEY });
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

  it("gives console pages no policy of its own, and the zone key", async () => {
    const response = await on(
      request("https://qrdx.dev/admin/affiliates/abc?page=2", {
        [CONSOLE_KEY_HEADER]: "forged",
      }),
    );
    expect(response.headers.get("content-security-policy")).toBeNull();
    const sent = forwarded(response);
    expect(sent(CONSOLE_KEY_HEADER)).toBe(KEY);
    expect(sent("content-security-policy")).toBeUndefined();
  });

  it("drops the workspace header the browser sent", async () => {
    const response = await on(
      request("https://qrdx.dev/admin/growth", { [WORKSPACE_HEADER]: "acme" }),
    );
    const sent = forwarded(response);
    expect(sent(WORKSPACE_HEADER)).toBeUndefined();
    expect(sent(CONSOLE_KEY_HEADER)).toBe(KEY);
  });

  it("drops a key the browser sent when there's none to send", async () => {
    const response = await onWithoutKey(
      request("https://qrdx.dev/admin/growth", {
        [CONSOLE_KEY_HEADER]: "forged",
      }),
    );
    expect(forwarded(response)(CONSOLE_KEY_HEADER)).toBeUndefined();
    expect(
      response.headers.get("x-middleware-override-headers")?.split(","),
    ).not.toContain(CONSOLE_KEY_HEADER);
  });

  it("keeps the nonce policy on this app's own admin pages", async () => {
    for (const url of [
      "https://qrdx.dev/admin",
      "https://qrdx.dev/admin/users/u1",
      "https://qrdx.dev/admin/confirm?next=/admin/growth",
      "https://qrdx.dev/admin/growthx",
    ]) {
      const response = await on(request(url));
      expect(response.headers.get("content-security-policy"), url).toMatch(
        /'nonce-/,
      );
      expect(forwarded(response)(CONSOLE_KEY_HEADER), url).toBeUndefined();
    }
  });

  it("keeps it where next.config.ts doesn't proxy: other hosts", async () => {
    const response = await on(
      request("https://other.example.com/admin/growth"),
    );
    expect(response.headers.get("content-security-policy")).toMatch(/'nonce-/);
    expect(forwarded(response)(CONSOLE_KEY_HEADER)).toBeUndefined();
  });

  it("changes nothing while CONSOLE_ORIGIN is unset", async () => {
    const response = await off(
      request("https://qrdx.dev/admin/growth", {
        [CONSOLE_KEY_HEADER]: "forged",
      }),
    );
    expect(response.headers.get("content-security-policy")).toMatch(/'nonce-/);
    // Passed on untouched, as any other header: nothing reads it here.
    expect(forwarded(response)(CONSOLE_KEY_HEADER)).toBe("forged");
  });

  it.each([
    ["/ADMIN/growth?page=2", "/admin/growth?page=2"],
    ["/Admin", "/admin"],
    ["/aDmIn/affiliates/abc", "/admin/affiliates/abc"],
    ["/CONSOLE-STATIC/_next/x.js", "/console-static/_next/x.js"],
  ])("sends %s to the lower-case path, in both modes", async (path, target) => {
    for (const proxy of [on, off]) {
      const response = await proxy(request(`https://qrdx.dev${path}`));
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        `https://qrdx.dev${target}`,
      );
    }
  });

  it("answers 404 for dot segments in console paths, in both modes", async () => {
    for (const proxy of [on, off]) {
      for (const path of [
        "/console-static/a..b.js",
        "/console-static/x%2Ey.js",
        "/admin/affiliates/a..b",
      ]) {
        const response = await proxy(request(`https://qrdx.dev${path}`));
        expect(response.status, path).toBe(404);
      }
    }
  });

  it("passes the console's assets on without a session lookup", async () => {
    session.lookups = 0;
    const response = await on(
      request("https://qrdx.dev/console-static/_next/static/x.js"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(forwarded(response)(CONSOLE_KEY_HEADER)).toBe(KEY);
    const unset = await off(
      request("https://qrdx.dev/console-static/_next/static/x.js"),
    );
    expect(unset.status).toBe(200);
    expect(session.lookups).toBe(0);
  });

  describe("server actions (POSTs with next-action)", () => {
    const COOKIES =
      "theme=dark; __Secure-better-auth.session_token=abc.sig; __Secure-better-auth.session_data=xyz";
    const actionTo = (url: string) =>
      request(url, {
        "next-action": "abc123",
        cookie: COOKIES,
        authorization: "Bearer token",
      });

    it("sends a held session's action to the console without its session", async () => {
      session.held = true;
      try {
        const response = await on(
          actionTo("https://qrdx.dev/admin/affiliates/a1"),
        );
        expect(response.status).toBe(200);
        const sent = forwarded(response);
        expect(sent("cookie")).toBe("theme=dark");
        expect(sent("authorization")).toBeUndefined();
        expect(sent(CONSOLE_KEY_HEADER)).toBe(KEY);
        // Without any other cookie, no Cookie header at all.
        const bare = await on(
          request("https://qrdx.dev/admin/growth", {
            "next-action": "abc123",
            cookie: "__Secure-better-auth.session_token=abc.sig",
          }),
        );
        const names =
          bare.headers.get("x-middleware-override-headers")?.split(",") ?? [];
        expect(names).not.toContain("cookie");
      } finally {
        session.held = false;
      }
    });

    it("sends an admin's action with its session when it isn't held", async () => {
      const response = await on(
        actionTo("https://qrdx.dev/admin/affiliates/a1"),
      );
      const sent = forwarded(response);
      expect(sent("cookie")).toBe(COOKIES);
      expect(sent(CONSOLE_KEY_HEADER)).toBe(KEY);
    });

    it("leaves this app's own admin actions to their own session reads", async () => {
      session.held = true;
      try {
        const response = await on(actionTo("https://qrdx.dev/admin/users/u1"));
        expect(response.status).toBe(200);
        expect(forwarded(response)("cookie")).toBe(COOKIES);
      } finally {
        session.held = false;
      }
    });

    it("changes nothing while CONSOLE_ORIGIN is unset", async () => {
      session.held = true;
      session.holdChecks = 0;
      try {
        const response = await off(actionTo("https://qrdx.dev/admin/growth"));
        expect(response.status).toBe(200);
        expect(forwarded(response)("cookie")).toBe(COOKIES);
        // As before: a server action's hold isn't checked here at all.
        expect(session.holdChecks).toBe(0);
      } finally {
        session.held = false;
      }
    });
  });

  it("still sends a held session to the check page first", async () => {
    session.held = true;
    try {
      const response = await on(request("https://qrdx.dev/admin/growth"));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toMatch(/\/session-check\?/);
      // Its server actions go on, as on this app's own pages.
      const action = await on(
        request("https://qrdx.dev/admin/growth", { "next-action": "abc" }),
      );
      expect(forwarded(action)(CONSOLE_KEY_HEADER)).toBe(KEY);
    } finally {
      session.held = false;
    }
  });
});
