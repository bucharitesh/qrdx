import { OG_FONT_GLOB } from "@repo/design-system/og/font-files";
import {
  docsEnglishRewrites,
  docsMarkdownAcceptRewrites,
  docsMarkdownRewrites,
} from "@repo/i18n/docs";
import { config, withAnalyzer } from "@repo/next-config";
import {
  appCsp,
  cspHeaderName,
  cspOptionsFromEnv,
  prerenderedPagesSource,
  reportingEndpoints,
} from "@repo/next-config/csp";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { env } from "@/env";
import mediaManifest from "@/lib/media-manifest.json";

// The docs site: one zone of qrdx.dev. The main app (apps/docs) proxies the
// docs' URLs here once its DOCS_ZONE_URL is set (@repo/next-config/
// docs-zone), so every URL below is the same as on qrdx.dev, and the pages
// carry the same headers the main app gives its own copy of the docs.

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

// Content-Security-Policy (@repo/next-config/csp, imported from the package:
// next.config can't resolve a package through a file under lib/), as in
// the main app:
// enforced in production builds, off in `next dev` unless CSP_DEV=1.
// CSP_REPORT_ONLY=1 sends it as Report-Only instead.
const cspEnabled =
  process.env.NODE_ENV === "production" || process.env.CSP_DEV === "1";
const cspOptions = cspOptionsFromEnv(process.env, {
  mediaOrigin: mediaManifest.origin,
});
const cspHeader = cspHeaderName();
const cspReporting = reportingEndpoints(cspOptions);

// QRdx's own hosts, as in the main app: qrdx.dev and its subdomains (this
// app's own host, docs.qrdx.dev, among them), Vercel's, and local ones.
const appHostname = new URL(env.NEXT_PUBLIC_APP_URL).hostname;
const PLATFORM_HOSTS = [
  "(?:.+\\.)?(?:qrdx\\.dev|vercel\\.app)",
  "localhost",
  "127\\.0\\.0\\.1",
  appHostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
].join("|");

/** An Accept header that lists text/markdown (rewrites to the Markdown versions). */
const MARKDOWN_ACCEPT = "(?:.*[,\\s])?text/markdown(?:[;,\\s].*)?";

let nextConfig: NextConfig = {
  ...config,
  // The zone's build assets live under /docs-static/_next/…, so the main
  // app can proxy them without clashing with its own /_next. Not basePath:
  // the translated docs live at /<lang>/docs.
  assetPrefix: "/docs-static",
  // Docs images are plain files from qrdx.dev; nothing here resizes them.
  images: { ...config.images, unoptimized: true },
  reactStrictMode: true,
  // As in the main app: `next build` type-checks without the tests, except
  // on Vercel, where CI has already type-checked the commit.
  typescript: {
    tsconfigPath: "tsconfig.build.json",
    ignoreBuildErrors: env.VERCEL === "1",
  },
  experimental: {
    ...config.experimental,
    optimizePackageImports: [
      ...(config.experimental?.optimizePackageImports ?? []),
      "iconsax-reactjs",
    ],
    // The only root layout is app/[lang]: URLs that match no route get
    // app/global-not-found.tsx.
    globalNotFound: true,
    // As in the main app (apps/docs/next.config.ts): on Vercel the build
    // cache and source maps cost memory and nothing reads them.
    ...(env.VERCEL === "1" && {
      turbopackFileSystemCacheForBuild: false,
      turbopackSourceMaps: false,
    }),
  },
  // As in the main app: the prerender workers keep less in memory without
  // source maps.
  enablePrerenderSourceMaps: false,
  // Geist for the Open Graph images (@repo/design-system/og/brand reads the
  // fonts at runtime), as in the main app.
  outputFileTracingIncludes: {
    "/**": [OG_FONT_GLOB],
  },
  serverExternalPackages: [
    "ts-morph",
    "typescript",
    "oxc-transform",
    "twoslash",
    "shiki",
    "@takumi-rs/core",
  ],
  // The main app's headers for its docs pages (apps/docs/next.config.ts).
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
      // Not framed by other sites (clickjacking), except PostHog's heatmap
      // viewer; with the CSP on, its frame-ancestors carries the same rule.
      {
        source: "/:path((?!api/).*)",
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
      ...(cspEnabled
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
          ]
        : []),
      // Docs pages link their Markdown version in their <head>; /docs says
      // so in a header too, as on the main app.
      {
        source: "/docs",
        headers: [
          {
            key: "Link",
            value: '</docs.md>; rel="alternate"; type="text/markdown"',
          },
        ],
      },
    ];
  },
  async redirects() {
    const base = (await config.redirects?.()) ?? [];
    return [
      ...base,
      // As on the main app, which answers these on qrdx.dev before it
      // proxies anything here: one URL per page.
      {
        source: "/:path((?!api/).+)/",
        destination: "/:path",
        permanent: true,
      },
      { source: "/en/docs", destination: "/docs", permanent: true },
      {
        source: "/en/docs/:path*",
        destination: "/docs/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    const base = toRewritePhases(await config.rewrites?.());
    return {
      ...base,
      beforeFiles: [
        ...base.beforeFiles,
        // Markdown for agents that ask for it (Accept: text/markdown) at a
        // docs page's URL. Browsers never send it, so they get HTML.
        ...[
          { source: "/docs", destination: "/llms.mdx" },
          { source: "/docs/:path+", destination: "/llms.mdx/:path+" },
          // Translated docs pages (/es/docs/...): app/docs-md.
          ...docsMarkdownAcceptRewrites(),
        ].map((rule) => ({
          ...rule,
          has: [
            { type: "header" as const, key: "accept", value: MARKDOWN_ACCEPT },
          ],
        })),
        // English docs are [lang]=en behind their unprefixed URLs, apart
        // from their .md and .mdx versions (afterFiles below).
        ...docsEnglishRewrites(),
      ],
      afterFiles: [
        ...base.afterFiles,
        { source: "/docs.mdx", destination: "/llms.mdx" },
        { source: "/docs/:path*.mdx", destination: "/llms.mdx/:path*" },
        // llmstxt.org's convention: the page URL plus .md.
        { source: "/docs.md", destination: "/llms.mdx" },
        { source: "/docs/:path*.md", destination: "/llms.mdx/:path*" },
        // A translated docs page as Markdown: /es/docs/x.md (app/docs-md).
        ...docsMarkdownRewrites(),
      ],
    };
  },
};

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

const withMDX = createMDX();

// next-intl's catalogs and formatters (i18n/request.ts), without its
// middleware or navigation. The main app writes the catalogs' type
// declaration next to apps/docs/messages/en.json; types/next-intl.d.ts
// reads it from there.
const withNextIntl = createNextIntlPlugin({
  requestConfig: "./i18n/request.ts",
});

// fumadocs-mdx writes .source (the compiled docs and the docs index the
// route handlers read, lib/docs-index-plugin.ts) while the config loads.
export default withMDX(withNextIntl(nextConfig));
