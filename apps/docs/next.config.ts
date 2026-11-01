import { config, withAnalyzer } from "@repo/next-config";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { env } from "@/env";
import {
  appCsp,
  cspHeaderName,
  cspOptionsFromEnv,
  hostedPageCsp,
  prerenderedPagesSource,
  reportingEndpoints,
} from "@/lib/security/csp";

type Rewrites = Awaited<ReturnType<NonNullable<NextConfig["rewrites"]>>>;
type RewritePhases = Required<Exclude<Rewrites, unknown[]>>;

// A plain array is shorthand for `afterFiles`.
const toRewritePhases = (rewrites: Rewrites = []): RewritePhases =>
  Array.isArray(rewrites)
    ? { beforeFiles: [], afterFiles: rewrites, fallback: [] }
    : {
        beforeFiles: rewrites.beforeFiles ?? [],
        afterFiles: rewrites.afterFiles ?? [],
        fallback: rewrites.fallback ?? [],
      };

// Content-Security-Policy (lib/security/csp.ts): enforced in production
// builds, off in `next dev` (which keeps the frame rules only) unless
// CSP_DEV=1. CSP_REPORT_ONLY=1 sends it as Report-Only instead.
const cspEnabled =
  process.env.NODE_ENV === "production" || process.env.CSP_DEV === "1";
const cspOptions = cspOptionsFromEnv();
const cspHeader = cspHeaderName();
const cspReporting = reportingEndpoints(cspOptions);

// QRdx's own hosts (as in proxy.ts), plus a self-hosted app URL: customers'
// custom domains never get the app policy.
const appHostname = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname;
  } catch {
    return null;
  }
})();
const PLATFORM_HOSTS = [
  "(?:.+\\.)?(?:qrdx\\.dev|vercel\\.app)",
  "localhost",
  "127\\.0\\.0\\.1",
  ...(appHostname ? [appHostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")] : []),
].join("|");

/** Headers that put the app policy on prerendered pages (nonce routes: proxy.ts). */
const cspHeaders = cspEnabled
  ? [
      {
        source: prerenderedPagesSource(),
        has: [{ type: "host" as const, value: `(?:${PLATFORM_HOSTS})` }],
        headers: [
          { key: cspHeader, value: appCsp(cspOptions) },
          ...(cspReporting
            ? [{ key: "Reporting-Endpoints", value: cspReporting }]
            : []),
        ],
      },
      // Hosted pages, on any host: a loose policy (why: hostedPageCsp).
      {
        source: "/p/:path*",
        headers: [{ key: cspHeader, value: hostedPageCsp(cspOptions) }],
      },
    ]
  : [];

let nextConfig: NextConfig = {
  ...config,
  // Opt-in for Docker / self-hosting: NEXT_OUTPUT=standalone pnpm build
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  reactStrictMode: true,
  // Logos are sent as data URLs (≤1MB file ≈ 1.37MB base64) through server actions.
  experimental: {
    ...config.experimental,
    serverActions: { bodySizeLimit: "2mb" },
    // Per-icon imports from the iconsax barrel (thousands of modules) in dev.
    optimizePackageImports: [
      ...(config.experimental?.optimizePackageImports ?? []),
      "iconsax-reactjs",
    ],
  },
  serverExternalPackages: [
    "ts-morph",
    "typescript",
    "oxc-transform",
    "twoslash",
    "shiki",
    "@takumi-rs/core",
  ],
  // When rules set the same header, the later one wins.
  async headers() {
    const base = (await config.headers?.()) ?? [];
    return [
      ...base,
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
      // App pages can't be framed by other sites (clickjacking), except by
      // PostHog's heatmap viewer. Hosted pages (/p), short links (/q) and the
      // API stay frameable: owners may embed them. With the CSP on, its
      // frame-ancestors carries the same rule (lib/security/csp.ts).
      {
        source: "/:path((?!p/|q/|api/).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          ...(cspEnabled
            ? []
            : [
                {
                  key: "Content-Security-Policy",
                  value: "frame-ancestors 'self' https://us.posthog.com",
                },
              ]),
        ],
      },
      // The OAuth consent screen must never render inside another site's frame
      // (clickjacking an "Authorize" click); the CSP says frame-ancestors 'none'.
      {
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          ...(cspEnabled
            ? []
            : [
                {
                  key: "Content-Security-Policy",
                  value: "frame-ancestors 'none'",
                },
              ]),
        ],
      },
      ...cspHeaders,
      // The API and MCP hosts serve machine endpoints, never pages to index.
      ...["api.qrdx.dev", "mcp.qrdx.dev"].map((host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
      // Unhashed public media: browsers reuse it for a day, then revalidate.
      ...["images", "samples", "sounds"].map((dir) => ({
        source: `/${dir}/:path*`,
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      })),
    ];
  },
  // Anything else on the MCP subdomain goes to the connect page, and anything
  // on the API subdomain outside /v1 goes to the REST API docs.
  async redirects() {
    const base = (await config.redirects?.()) ?? [];
    return [
      ...base,
      // One host for search engines: www goes to the apex.
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.qrdx.dev" }],
        destination: "https://qrdx.dev/:path*",
        permanent: true,
      },
      // skipTrailingSlashRedirect (for the PostHog proxy) leaves "/pricing/"
      // serving a copy of "/pricing"; send pages to the slash-less URL. The
      // proxy, API routes and the REST host keep their exact paths.
      {
        source: "/:path((?!ingest/|api/|v1/).+)/",
        destination: "/:path",
        permanent: true,
      },
      {
        source: "/:path((?!mcp$|api/mcp$|_next/).*)",
        has: [{ type: "host", value: "mcp.qrdx.dev" }],
        destination: "https://qrdx.dev/mcp",
        permanent: false,
      },
      {
        source: "/:path((?!v1(?:/|$)|_next/).*)",
        has: [{ type: "host", value: "api.qrdx.dev" }],
        destination: "https://qrdx.dev/docs/developers/rest-api",
        permanent: false,
      },
    ];
  },
  // Keep the shared rewrites (PostHog /ingest proxy) alongside the docs ones.
  async rewrites() {
    const base = toRewritePhases(await config.rewrites?.());
    return {
      ...base,
      // mcp.qrdx.dev/mcp is the public MCP endpoint (lib/mcp-clients.ts). It
      // must win over the /mcp marketing page, hence beforeFiles.
      beforeFiles: [
        ...base.beforeFiles,
        {
          source: "/mcp",
          has: [{ type: "host", value: "mcp.qrdx.dev" }],
          destination: "/api/mcp",
        },
        // api.qrdx.dev/v1/... is the public REST API (same routes as
        // qrdx.dev/api/v1/..., which keeps working).
        {
          source: "/v1/:path*",
          has: [{ type: "host", value: "api.qrdx.dev" }],
          destination: "/api/v1/:path*",
        },
      ],
      afterFiles: [
        ...base.afterFiles,
        {
          source: "/docs.mdx",
          destination: "/llms.mdx",
        },
        {
          source: "/docs/:path*.mdx",
          destination: "/llms.mdx/:path*",
        },
      ],
    };
  },
};

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

const withMDX = createMDX();

export default withMDX(nextConfig);
