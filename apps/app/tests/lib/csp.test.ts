// The Content-Security-Policy (@repo/next-config/csp, through
// @repo/next-config/csp): what each policy allows, which paths get which policy
// (next.config.ts headers, proxy.ts nonces) and the violation report parser.

import {
  appCsp,
  appCspDirectives,
  type CspOptions,
  createNonce,
  hostedPageCsp,
  NONCE_ROUTE,
  cspOptionsFromEnv as packageCspOptions,
  prerenderedPagesSource,
} from "@repo/next-config/csp";
// Next compiles header sources with its bundled path-to-regexp (no types).
// @ts-expect-error: no declaration file for Next's compiled copy
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mediaManifest from "@/lib/media-manifest.json";
import { cspOptionsFromEnv } from "@/lib/security/csp";
import { parseCspReports } from "@/lib/security/csp-report";

const PROD: CspOptions = {
  https: true,
  storageOrigins: ["https://assets.qrdx.dev"],
  reportUri: "/api/csp-report",
};

const directive = (policy: string, name: string) =>
  policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))
    ?.split(/\s+/)
    .slice(1);

describe("app policy (prerendered pages)", () => {
  const policy = appCsp(PROD);

  it("locks down the dangerous defaults", () => {
    expect(directive(policy, "default-src")).toEqual(["'self'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
    expect(directive(policy, "frame-ancestors")).toEqual([
      "'self'",
      "https://us.posthog.com",
    ]);
    expect(directive(policy, "upgrade-insecure-requests")).toEqual([]);
    expect(directive(policy, "report-uri")).toEqual(["/api/csp-report"]);
  });

  it("allows inline scripts only from the listed hosts, never eval", () => {
    const script = directive(policy, "script-src");
    expect(script).toEqual(
      expect.arrayContaining([
        "'self'",
        "'unsafe-inline'",
        "https://cloud.umami.is",
        "https://do.featurebase.app",
        "https://challenges.cloudflare.com",
      ]),
    );
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).not.toContain("https:");
    expect(script?.some((source) => source.startsWith("'nonce-"))).toBe(false);
  });

  it("lets the API reference's Try it reach the REST API", () => {
    // Same-origin /api/v1 by default; api.qrdx.dev when the reader picks it.
    for (const options of [PROD, { ...PROD, preview: true }]) {
      const connect = directive(appCsp(options), "connect-src") ?? [];
      expect(connect).toContain("'self'");
      expect(connect).toContain("https://api.qrdx.dev");
      expect(connect).not.toContain("https://*.qrdx.dev");
    }
  });

  it("allowlists connections and frames", () => {
    const connect = directive(policy, "connect-src") ?? [];
    for (const source of [
      "'self'",
      "https://gateway.umami.is",
      "https://*.featurebase.app",
      "https://*.r2.cloudflarestorage.com",
      "https://assets.qrdx.dev",
      "https://fastly.jsdelivr.net",
    ]) {
      expect(connect).toContain(source);
    }
    expect(connect).not.toContain("https:");
    expect(connect).not.toContain("ws:");
    expect(directive(policy, "frame-src")).toEqual(
      expect.arrayContaining([
        "https://www.youtube-nocookie.com",
        "https://player.vimeo.com",
        "https://assets.qrdx.dev",
        "https://challenges.cloudflare.com",
      ]),
    );
    expect(directive(policy, "frame-src")).not.toContain("https:");
    expect(directive(policy, "font-src")).toEqual([
      "'self'",
      "data:",
      "https://fonts.gstatic.com",
    ]);
  });

  it("uses a custom Umami script host when configured", () => {
    const custom = appCsp({
      ...PROD,
      umamiScriptUrl: "https://stats.example.com/script.js",
    });
    expect(directive(custom, "script-src")).toContain(
      "https://stats.example.com",
    );
  });

  it("adds eval and the HMR socket only in development, the toolbar only on previews", () => {
    const dev = appCsp({ dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(directive(dev, "upgrade-insecure-requests")).toBeUndefined();
    expect(directive(policy, "script-src")).not.toContain(
      "https://vercel.live",
    );
    expect(
      directive(appCsp({ ...PROD, preview: true }), "script-src"),
    ).toContain("https://vercel.live");
  });
});

describe("app policy (nonce routes)", () => {
  it("trusts only the nonce and what nonced scripts load", () => {
    const policy = appCsp(PROD, { nonce: "abc123==" });
    const script = directive(policy, "script-src");
    expect(script).toContain("'nonce-abc123=='");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("keeps every other directive identical to the prerendered policy", () => {
    // Client-side navigation keeps the first page's policy.
    const { "script-src": _a, ...withNonce } = appCspDirectives(PROD, {
      nonce: "abc",
    });
    const { "script-src": _b, ...prerendered } = appCspDirectives(PROD);
    expect(withNonce).toEqual(prerendered);
  });

  it("never lets the OAuth consent screen be framed, and lets it redirect to the app", () => {
    const policy = appCsp(PROD, { nonce: "abc", oauth: true });
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "form-action")).toEqual(
      expect.arrayContaining(["'self'", "https:", "http://localhost:*"]),
    );
  });

  it("creates unpredictable base64 nonces", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("which paths get which policy", () => {
  it("nonce routes are the signed-in and consent pages", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/pages/abc",
      "/settings",
      "/settings/account",
      "/admin/users",
      "/oauth/authorize",
      "/invite/abc",
      "/join/abc",
    ]) {
      expect(NONCE_ROUTE.test(path), path).toBe(true);
    }
    for (const path of ["/", "/pricing", "/dashboards", "/docs", "/p/abc"]) {
      expect(NONCE_ROUTE.test(path), path).toBe(false);
    }
  });

  it("the prerendered-page header covers every other QRdx page", () => {
    const regex = pathToRegexp(prerenderedPagesSource(), [], {
      delimiter: "/",
      strict: true,
      sensitive: false,
    });
    for (const path of [
      "/",
      "/pricing",
      "/playground",
      "/docs/developers/rest-api",
      "/templates/links/creator",
      "/mcp",
      "/dashboards",
      "/pages",
    ]) {
      expect(regex.test(path), path).toBe(true);
    }
    for (const path of [
      "/dashboard",
      "/dashboard/codes",
      "/settings/account",
      "/admin",
      "/oauth/authorize",
      "/invite/x",
      "/join/x",
      "/p/abc",
      "/q/abc",
      "/api/events",
      "/_next/static/chunks/a.js",
      "/ingest/e",
    ]) {
      expect(regex.test(path), path).toBe(false);
    }
  });
});

describe("options from the environment", () => {
  const env = { R2_PUBLIC_BASE_URL: "https://files.example.com/uploads" };

  it("list the site's media host, then R2's public URL", () => {
    expect(cspOptionsFromEnv(env).storageOrigins).toEqual([
      mediaManifest.origin,
      "https://files.example.com",
    ]);
  });

  it("leave the media host to the app: the package knows none", () => {
    expect(packageCspOptions(env).storageOrigins).toEqual([
      "https://files.example.com",
    ]);
    expect(
      packageCspOptions({}, { mediaOrigin: "https://media.example.com/a" })
        .storageOrigins,
    ).toEqual(["https://media.example.com"]);
  });
});

describe("hosted pages", () => {
  it("only blocks plugins and <base> hijacking (pixels and embeds stay)", () => {
    const policy = hostedPageCsp(PROD);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(directive(policy, "script-src")).toBeUndefined();
    expect(directive(policy, "frame-ancestors")).toBeUndefined();
  });
});

describe("next.config.ts headers", () => {
  const saved = { ...process.env };
  let rules: {
    source: string;
    has?: { type: string; value?: string }[];
    headers: { key: string; value: string }[];
  }[];

  beforeAll(async () => {
    process.env.CSP_DEV = "1";
    process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
    vi.resetModules();
    // createMDX() rewrites .source/*.ts in the background when it runs. In a
    // test worker that write raced the suites importing .source and could
    // leave the files empty. The headers don't depend on MDX, so skip it.
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    const config = (await import("@/next.config")).default;
    rules = (await config.headers?.()) ?? [];
  }, 60_000);

  afterAll(() => {
    process.env = saved;
  });

  const valueFor = (source: string, key: string) =>
    rules
      .filter((rule) => rule.source === source)
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === key)?.value;

  it("sends the app policy on QRdx's own hosts only", () => {
    const rule = rules.find(
      (candidate) => candidate.source === prerenderedPagesSource(),
    );
    expect(rule).toBeDefined();
    const policy = rule?.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )?.value;
    expect(directive(policy ?? "", "script-src")).toContain("'self'");
    expect(directive(policy ?? "", "object-src")).toEqual(["'none'"]);
    const host = new RegExp(`^${rule?.has?.[0]?.value}$`);
    expect(host.test("qrdx.dev")).toBe(true);
    expect(host.test("www.qrdx.dev")).toBe(true);
    expect(host.test("qrdx-git-x.vercel.app")).toBe(true);
    expect(host.test("localhost")).toBe(true);
    expect(host.test("links.customer.com")).toBe(false);
  });

  it("sends the policy proxy.ts builds, with the site's media host", () => {
    const policy = valueFor(
      prerenderedPagesSource(),
      "Content-Security-Policy",
    );
    expect(policy).toBe(appCsp(cspOptionsFromEnv()));
    expect(directive(policy ?? "", "connect-src")).toContain(
      mediaManifest.origin,
    );
  });

  it("gives hosted pages their own policy", () => {
    expect(valueFor("/p/:path*", "Content-Security-Policy")).toContain(
      "object-src 'none'",
    );
  });

  it("keeps the existing security headers", () => {
    expect(valueFor("/:path*", "X-Content-Type-Options")).toBe("nosniff");
    expect(valueFor("/:path*", "Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(valueFor("/:path*", "Strict-Transport-Security")).toBe(
      "max-age=63072000",
    );
    expect(valueFor("/:path((?!p/|q/|api/).*)", "X-Frame-Options")).toBe(
      "SAMEORIGIN",
    );
    expect(valueFor("/oauth/:path*", "X-Frame-Options")).toBe("DENY");
  });
});

describe("proxy.ts nonces", () => {
  const saved = { ...process.env };
  let proxy: (request: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    process.env.CSP_DEV = "1";
    vi.resetModules();
    vi.doMock("@repo/auth/server", () => ({
      auth: {
        api: { getSession: async () => ({ user: { id: "u1" }, session: {} }) },
      },
    }));
    vi.doMock("next/headers", () => ({ headers: async () => new Headers() }));
    vi.doMock("@/app/(app)/dashboard/domains/_lib/host-routing", () => ({
      routeCustomDomain: async () => null,
    }));
    proxy = (await import("@/proxy")).default;
  });

  afterAll(() => {
    process.env = saved;
    vi.doUnmock("@repo/auth/server");
    vi.doUnmock("next/headers");
    vi.doUnmock("@/app/(app)/dashboard/domains/_lib/host-routing");
  });

  const nonceOf = (policy: string | null) =>
    /'nonce-([^']+)'/.exec(policy ?? "")?.[1];

  it("gives each nonce-route response a fresh nonce, also on the request Next renders", async () => {
    const first = await proxy(
      new NextRequest("http://localhost:3000/dashboard/codes"),
    );
    const second = await proxy(
      new NextRequest("http://localhost:3000/dashboard/codes"),
    );
    const policy = first.headers.get("content-security-policy");
    expect(nonceOf(policy)).toBeTruthy();
    expect(nonceOf(policy)).not.toBe(
      nonceOf(second.headers.get("content-security-policy")),
    );
    // NextResponse.next({ request: { headers } }) forwards the policy to the render.
    expect(
      first.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(policy);
  });

  it("uses frame-ancestors 'none' on the consent page", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/oauth/authorize?client_id=x"),
    );
    expect(
      directive(
        response.headers.get("content-security-policy") ?? "",
        "frame-ancestors",
      ),
    ).toEqual(["'none'"]);
  });

  it("leaves prerendered pages to next.config.ts", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/success"),
    );
    expect(response.headers.get("content-security-policy")).toBeNull();
  });
});

describe("violation reports", () => {
  it("keeps only the directive, blocked origin and page path", () => {
    const legacy = parseCspReports({
      "csp-report": {
        "document-uri": "https://qrdx.dev/dashboard/pages/abc?token=secret",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js?q=1",
        disposition: "enforce",
      },
    });
    expect(legacy).toEqual([
      {
        directive: "script-src-elem",
        blocked: "https://evil.example",
        page: "/dashboard/pages/abc",
        disposition: "enforce",
        sample: undefined,
      },
    ]);
    const modern = parseCspReports([
      {
        type: "csp-violation",
        body: {
          documentURL: "https://qrdx.dev/",
          effectiveDirective: "img-src",
          blockedURL: "inline",
          disposition: "report",
        },
      },
      { type: "deprecation", body: {} },
    ]);
    expect(modern).toHaveLength(1);
    expect(modern[0]).toMatchObject({
      directive: "img-src",
      blocked: "inline",
    });
    expect(parseCspReports("nope")).toEqual([]);
  });
});
