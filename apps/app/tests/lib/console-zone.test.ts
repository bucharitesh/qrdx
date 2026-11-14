// The back-office console zone (@repo/next-config/console-zone): with
// CONSOLE_ORIGIN set, this app proxies five /admin sections and the console's
// build assets to it, on QRdx's own hosts; unset (self-hosting, and qrdx.dev
// until the cutover), nothing changes. The guard: the rules never take over
// one of this app's own paths, the sections line up with the pages on disk
// and the admin menu, and proxy.ts treats exactly the proxied requests as
// the console's.
import { existsSync } from "node:fs";
import path from "node:path";
import {
  CONSOLE_ASSET_PREFIX,
  CONSOLE_KEY_HEADER,
  CONSOLE_SECTIONS,
  consoleReturnPath,
  consoleSection,
  consoleZoneRewrites,
  isConsolePath,
} from "@repo/next-config/console-zone";
import { CORE_PATHS, corePathSamples } from "@repo/next-config/core-paths";
import { prerenderedPagesSource } from "@repo/next-config/csp";
import {
  hostMatcher,
  platformHostsPattern,
} from "@repo/next-config/platform-hosts";
import type { NextConfig } from "next";
import {
  getRedirectUrl,
  getRewrittenUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ADMIN_NAV_ITEMS, adminNavLinks } from "@/app/(app)/admin/_lib/nav";

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

  it("trims any number of trailing slashes, fast", () => {
    const run = "/".repeat(200_000);
    const start = performance.now();
    const [rule] = consoleZoneRewrites(`${ORIGIN}${run}`, { hosts: HOSTS });
    expect(rule?.destination).toBe(`${ORIGIN}/admin/:section/:path*`);
    expect(performance.now() - start).toBeLessThan(200);
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

  /** The app's config with CONSOLE_ORIGIN set to `origin` (or unset). */
  async function loadConfig(origin: string | undefined): Promise<NextConfig> {
    if (origin === undefined) delete process.env.CONSOLE_ORIGIN;
    else process.env.CONSOLE_ORIGIN = origin;
    process.env.CSP_DEV = "1";
    vi.resetModules();
    // createMDX() rewrites .source/*.ts in the background; the routes don't
    // depend on MDX (tests/lib/csp.test.ts explains the race).
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    return (await import("@/next.config")).default as unknown as NextConfig;
  }

  let on: NextConfig;
  let off: NextConfig;

  beforeAll(async () => {
    off = await loadConfig(undefined);
    on = await loadConfig(`${ORIGIN}/`);
  }, 60_000);

  afterAll(() => {
    process.env = saved;
    vi.doUnmock("fumadocs-mdx/next");
  });

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
    return target?.startsWith(ORIGIN) ? target : null;
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

  it("adds exactly those two rules", async () => {
    const phases = (await on.rewrites?.()) as {
      beforeFiles: { destination: string }[];
    };
    const offPhases = (await off.rewrites?.()) as {
      beforeFiles: { destination: string }[];
    };
    const toConsole = phases.beforeFiles.filter((rule) =>
      rule.destination.startsWith(ORIGIN),
    );
    expect(toConsole).toHaveLength(2);
    expect(phases.beforeFiles.length - offPhases.beforeFiles.length).toBe(2);
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
  /** Whether the signed-in session is held (lib/account/session-origin.ts). */
  const session = { held: false };

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
    vi.doMock("@/lib/account/session-origin-server", () => ({
      getSessionAllowingHold: async () => ({
        user: { id: "admin_1" },
        session: { id: "s1" },
      }),
      isSessionHeld: async () => session.held,
    }));
    vi.doMock("next/headers", () => ({ headers: async () => new Headers() }));
    vi.doMock("@/app/(app)/dashboard/domains/_lib/host-routing", () => ({
      routeCustomDomain: async () => null,
    }));
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
    vi.doUnmock("@/lib/account/session-origin-server");
    vi.doUnmock("next/headers");
    vi.doUnmock("@/app/(app)/dashboard/domains/_lib/host-routing");
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
