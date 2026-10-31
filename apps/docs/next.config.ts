import { config, withAnalyzer } from "@repo/next-config";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { env } from "@/env";

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

let nextConfig: NextConfig = {
  ...config,
  // Opt-in for Docker / self-hosting: NEXT_OUTPUT=standalone pnpm build
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  reactStrictMode: true,
  // Logos are sent as data URLs (≤1MB file ≈ 1.37MB base64) through server actions.
  experimental: {
    ...config.experimental,
    serverActions: { bodySizeLimit: "2mb" },
  },
  serverExternalPackages: [
    "ts-morph",
    "typescript",
    "oxc-transform",
    "twoslash",
    "shiki",
    "@takumi-rs/core",
  ],
  // The OAuth consent screen must never render inside another site's frame
  // (clickjacking an "Authorize" click).
  async headers() {
    const base = (await config.headers?.()) ?? [];
    return [
      ...base,
      {
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
  // Anything else on the MCP subdomain goes to the connect page, and anything
  // on the API subdomain outside /v1 goes to the REST API docs.
  async redirects() {
    const base = (await config.redirects?.()) ?? [];
    return [
      ...base,
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
