import {
  API_HOST,
  CANONICAL_HOST,
  CANONICAL_ORIGIN,
  MCP_HOST,
} from "@repo/config";
import { OG_FONT_GLOB } from "@repo/design-system/og/font-files";
import { docsOriginRedirects, docsZoneRewrites } from "@repo/i18n/docs";
import { englishRedirects, englishRewrites } from "@repo/i18n/routing";
import { config, withAnalyzer } from "@repo/next-config";
import {
  CONSOLE_ASSET_PREFIX,
  consoleZoneRewrites,
} from "@repo/next-config/console-zone";
// Imported from the package, not from lib/security/csp.ts: the config is
// compiled with `@repo/*` paths rewritten for this folder, so a package
// import made from a file below it can't be resolved.
import {
  appCsp,
  cspHeaderName,
  cspOptionsFromEnv,
  hostedPageCsp,
  prerenderedPagesSource,
  reportingEndpoints,
} from "@repo/next-config/csp";
import { platformHostsPattern } from "@repo/next-config/platform-hosts";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { env } from "@/env";
import { DOCS_REDIRECTS } from "@/lib/docs-redirects";
import mediaManifest from "@/lib/media-manifest.json";
import { MOVED_PAGES } from "@/lib/moved-pages";

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

// Content-Security-Policy (@repo/next-config/csp): enforced in production
// builds, off in `next dev` (which keeps the frame rules only) unless
// CSP_DEV=1. CSP_REPORT_ONLY=1 sends it as Report-Only instead.
const cspEnabled =
  process.env.NODE_ENV === "production" || process.env.CSP_DEV === "1";
const cspOptions = cspOptionsFromEnv(process.env, {
  mediaOrigin: mediaManifest.origin,
});
const cspHeader = cspHeaderName();
const cspReporting = reportingEndpoints(cspOptions);

// QRdx's own hosts (as in proxy.ts), plus a self-hosted app URL: customers'
// custom domains never get the app policy.
const PLATFORM_HOSTS = platformHostsPattern(env.NEXT_PUBLIC_APP_URL);

/** An Accept header that lists text/markdown (rewrites to the Markdown versions). */
const MARKDOWN_ACCEPT = "(?:.*[,\\s])?text/markdown(?:[;,\\s].*)?";

/** What makes a request one for Markdown: the header, on QRdx's own hosts. */
const MARKDOWN_REQUEST = {
  has: [
    { type: "header" as const, key: "accept", value: MARKDOWN_ACCEPT },
    { type: "host" as const, value: `(?:${PLATFORM_HOSTS})` },
  ],
  missing: [{ type: "host" as const, value: "(?:api|mcp)\\.qrdx\\.dev" }],
};

// The docs site (apps/docs) at DOCS_ZONE_URL serves the docs: their
// URLs are proxied there, ahead of every rule below (@repo/i18n/docs).
// Unset (self-hosting, local development without the docs site), they
// redirect to the same paths on qrdx.dev.
const docsZone = docsZoneRewrites(env.DOCS_ZONE_URL, {
  markdown: MARKDOWN_REQUEST,
});
const docsElsewhere = env.DOCS_ZONE_URL
  ? []
  : docsOriginRedirects(CANONICAL_ORIGIN, {
      // QRdx's own hosts: on a custom domain those paths are short links.
      has: [{ type: "host", value: `(?:${PLATFORM_HOSTS})` }],
    });

// The back-office console at CONSOLE_ORIGIN serves five /admin sections and
// its build assets (@repo/next-config/console-zone), on QRdx's own hosts
// only. Unset, there are no rules and this app serves its own pages.
const consoleZone = consoleZoneRewrites(env.CONSOLE_ORIGIN, {
  hosts: `(?:${PLATFORM_HOSTS})`,
});
if (consoleZone.length > 0 && !env.CONSOLE_ZONE_KEY) {
  // Not fatal (the console can fall back to x-forwarded-host), but with its
  // key rule every page there would redirect back here in a loop.
  console.warn(
    "⚠ CONSOLE_ORIGIN is set but CONSOLE_ZONE_KEY isn't: the console can't tell requests that came through this app. Set the same CONSOLE_ZONE_KEY on both.",
  );
}

/** Headers that put the app policy on prerendered pages (nonce routes: proxy.ts). */
const cspHeaders = cspEnabled
  ? [
      {
        // The console's build assets aren't pages: no page policy on them
        // while it's on (its pages are under /admin, which proxy.ts handles).
        source: prerenderedPagesSource(
          consoleZone.length > 0 ? [CONSOLE_ASSET_PREFIX.slice(1)] : [],
        ),
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
  // Opt-in for Docker / self-hosting: NEXT_OUTPUT=standalone bun run build
  output: env.NEXT_OUTPUT,
  reactStrictMode: true,
  // `next build` type-checks the app without its tests. Some tests import
  // files from outside the app (plugins/*, .github/scripts) that a Docker
  // build doesn't copy in. `tsc --noEmit` and CI still check every test.
  //
  // On Vercel the check is skipped: the Hobby build machine has 8 GB, and
  // after the switch to Bun the in-build type check ran out of memory right
  // after compiling (2026-11-11). The required "Typecheck, test, lint" CI job
  // type-checks every pull request and release before anything reaches main,
  // so Vercel would only repeat it. Docker and local builds still check.
  typescript: {
    tsconfigPath: "tsconfig.build.json",
    ignoreBuildErrors: env.VERCEL === "1",
  },
  // `next dev` prints every server action call with its arguments. Those
  // include secrets typed into settings (an SSO client secret, 2FA and email
  // codes), so dev logs that get pasted into issues would leak them.
  logging: {
    ...(typeof config.logging === "object" ? config.logging : {}),
    serverFunctions: false,
  },
  // Logos are sent as data URLs (≤1MB file ≈ 1.37MB base64) through server actions.
  experimental: {
    ...config.experimental,
    serverActions: { bodySizeLimit: "2mb" },
    // Per-icon imports from the iconsax barrel (thousands of modules) in dev.
    optimizePackageImports: [
      ...(config.experimental?.optimizePackageImports ?? []),
      "iconsax-reactjs",
    ],
    // Two root layouts (app/[lang] and app/(app)): URLs that match no route
    // get app/global-not-found.tsx.
    globalNotFound: true,
    // Vercel builds on 2 cores and 8 GB, and Turbopack's compile ran out of
    // memory once the docs had 5 languages (2026-11-11). Measured locally,
    // these two cut the compiler's peak by about a third:
    // - the build cache: writing it makes Turbopack track every task's
    //   dependencies, and Vercel never restores it ("build cache was too
    //   large"), so it costs memory and buys nothing there;
    // - source maps: nothing reads them in production (they aren't uploaded
    //   anywhere, and the server only applies them when Node runs with
    //   source maps on, which this app doesn't). `next dev` and local builds
    //   keep both.
    ...(env.VERCEL === "1" && {
      turbopackFileSystemCacheForBuild: false,
      turbopackSourceMaps: false,
    }),
  },
  // The workers that prerender pages ("Generating static pages") run with
  // Node's --enable-source-maps and 50-frame stack traces by default, so
  // each one keeps the source map of every server chunk it loads. Measured
  // on a local build of all 8,547 pages (2026-11-14): off, the worker peaked
  // at 2.7 GB instead of 3.1 GB and finished in 2.5 min instead of 3.0. Off
  // everywhere, not only on Vercel: Vercel's build writes no maps (above),
  // so there it only drops the longer stacks, while Docker and local builds
  // have maps and run on whatever memory the machine has. Set it to true for
  // a build that fails while prerendering, to read the error's source lines.
  enablePrerenderSourceMaps: false,
  // Server code reads QRDX_HOME_NUMBERS as its build-time value
  // (lib/home-numbers/flag.ts). While it's off, the bundler drops the home
  // page's "QRdx in numbers" branch, client code included. CONSOLE_ORIGIN
  // too: the rewrites above are fixed when the app is built, so proxy.ts and
  // the admin nav must follow the same value, never a different one set
  // later where the server runs. Server only: neither reaches client bundles.
  compiler: {
    ...config.compiler,
    defineServer: {
      ...config.compiler?.defineServer,
      "process.env.QRDX_HOME_NUMBERS": process.env.QRDX_HOME_NUMBERS ?? "",
      "process.env.CONSOLE_ORIGIN": process.env.CONSOLE_ORIGIN ?? "",
    },
  },
  // Geist (@repo/design-system/og/font-files) for server images: OG cards,
  // and frame labels drawn from its glyph outlines (lib/qr-text-outline.ts),
  // read at runtime wherever a PNG is rasterized.
  outputFileTracingIncludes: {
    "/**": [OG_FONT_GLOB],
  },
  serverExternalPackages: ["shiki", "@takumi-rs/core"],
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
      // frame-ancestors carries the same rule (@repo/next-config/csp).
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
      ...[API_HOST, MCP_HOST].map((host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
      // The OpenAPI document (bun run openapi:generate): readable by API tools
      // on any origin (Swagger Editor, Postman on the web, AI agents).
      {
        source: "/openapi.json",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=86400",
          },
        ],
      },
      // Agent discovery (lib/agents): the home page points to the RFC 9727
      // API catalog, and pages with a Markdown version link to it (the docs
      // site sends its own).
      ...[
        {
          path: "/",
          links: [
            '</.well-known/api-catalog>; rel="api-catalog"',
            '</index.md>; rel="alternate"; type="text/markdown"',
          ],
        },
        ...["/pricing", "/mcp"].map((path) => ({
          path,
          links: [`<${path}.md>; rel="alternate"; type="text/markdown"`],
        })),
      ].map(({ path, links }) => ({
        source: path,
        has: [{ type: "host" as const, value: `(?:${PLATFORM_HOSTS})` }],
        missing: [{ type: "host" as const, value: "(?:api|mcp)\\.qrdx\\.dev" }],
        headers: [{ key: "Link", value: links.join(", ") }],
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
        has: [{ type: "host", value: `www.${CANONICAL_HOST}` }],
        destination: `${CANONICAL_ORIGIN}/:path*`,
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
        // Except the endpoint, its Server Card and the discovery documents.
        source:
          "/:path((?!mcp$|mcp/server-card$|api/mcp$|api/mcp/server-card$|\\.well-known/|_next/).*)",
        has: [{ type: "host", value: MCP_HOST }],
        destination: `${CANONICAL_ORIGIN}/mcp`,
        permanent: false,
      },
      // api.qrdx.dev/openapi.json is the API's OpenAPI document (public/).
      {
        source: "/:path((?!v1(?:/|$)|openapi\\.json$|\\.well-known/|_next/).*)",
        has: [{ type: "host", value: API_HOST }],
        destination: `${CANONICAL_ORIGIN}/docs/developers/rest-api`,
        permanent: false,
      },
      // /help, /support and moved docs pages (lib/docs-redirects.ts), on
      // QRdx's own hosts: on a custom domain those paths are short links.
      ...DOCS_REDIRECTS.map((redirect) => ({
        ...redirect,
        has: [{ type: "host" as const, value: `(?:${PLATFORM_HOSTS})` }],
      })),
      // No docs site here: the docs are read on qrdx.dev (docsElsewhere).
      ...docsElsewhere,
      // Site pages that moved (lib/moved-pages.ts), also on QRdx's own hosts.
      ...MOVED_PAGES.map((redirect) => ({
        ...redirect,
        has: [{ type: "host" as const, value: `(?:${PLATFORM_HOSTS})` }],
      })),
      // English has one address: /en/pricing → /pricing (packages/i18n/routing.ts).
      ...englishRedirects(`(?:${PLATFORM_HOSTS})`),
    ];
  },
  // Keep the shared rewrites (PostHog /ingest proxy) alongside these.
  async rewrites() {
    const base = toRewritePhases(await config.rewrites?.());
    return {
      ...base,
      // mcp.qrdx.dev/mcp is the public MCP endpoint (lib/mcp-clients.ts). It
      // must win over the /mcp marketing page, hence beforeFiles.
      beforeFiles: [
        ...base.beforeFiles,
        // The docs site, when DOCS_ZONE_URL is set (above): first, so the
        // docs' own rules below never see those URLs.
        ...docsZone,
        // The console's sections, when CONSOLE_ORIGIN is set (above): ahead
        // of this app's own copies of those pages.
        ...consoleZone,
        // Community profiles live at /community/@handle; a folder named
        // @handle would be a parallel route slot, so they render from
        // app/(app)/(home)/community/u/[handle].
        {
          source: "/community/@:handle",
          destination: "/community/u/:handle",
        },
        {
          source: "/mcp",
          has: [{ type: "host", value: MCP_HOST }],
          destination: "/api/mcp",
        },
        // The MCP Server Card at <endpoint>/server-card (SEP-2127).
        {
          source: "/mcp/server-card",
          has: [{ type: "host", value: MCP_HOST }],
          destination: "/api/mcp/server-card",
        },
        // api.qrdx.dev/v1/... is the public REST API (same routes as
        // qrdx.dev/api/v1/..., which keeps working).
        {
          source: "/v1/:path*",
          has: [{ type: "host", value: API_HOST }],
          destination: "/api/v1/:path*",
        },
        // Markdown for agents that ask for it (Accept: text/markdown): the
        // home page, pricing and the MCP page (the docs site answers for the
        // docs). Browsers never send text/markdown, so they keep getting HTML.
        ...[
          { source: "/", destination: "/index.md" },
          { source: "/pricing", destination: "/pricing.md" },
          { source: "/mcp", destination: "/mcp.md" },
        ].map((rule) => ({ ...rule, ...MARKDOWN_REQUEST })),
        // Translated pages live in app/[lang]; English is [lang]=en behind
        // its unprefixed URL (packages/i18n/routing.ts). After the Markdown
        // rewrites, which answer agents for / and /pricing first.
        ...englishRewrites(),
      ],
    };
  },
};

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

const withMDX = createMDX();

// next-intl's catalogs and formatters (i18n/request.ts), without its
// middleware or navigation. The declaration types ICU arguments from en.json.
const withNextIntl = createNextIntlPlugin({
  requestConfig: "./i18n/request.ts",
  experimental: { createMessagesDeclaration: "./messages/en.json" },
});

// fumadocs-mdx writes .source (the compiled-content modules,
// lib/content-source.ts) while the config loads. withMDX's result is a
// promise of the config: outermost, so Next waits for those files before it
// compiles anything.
export default withMDX(withNextIntl(nextConfig));
