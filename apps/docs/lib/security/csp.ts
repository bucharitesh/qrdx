import mediaManifest from "../media-manifest.json";

/**
 * Content-Security-Policy for QRdx's own pages (the app, marketing site and
 * docs). Built here, used by next.config.ts (prerendered pages) and proxy.ts
 * (signed-in pages, with a per-request nonce). Pure: no Next or env imports,
 * so next.config can load it and the tests can call it.
 *
 * Two script policies, one set of everything else:
 *
 * - Nonce routes (NONCE_ROUTE: dashboard, settings, admin, OAuth consent,
 *   team invites) are always rendered per request, so proxy.ts gives each
 *   response a fresh nonce and `script-src 'nonce-…' 'strict-dynamic'`. Next
 *   puts the nonce on its own scripts; ours read it with useCspNonce(). These
 *   are the pages that show account data and other people's content.
 * - Every other page is prerendered at build time (static, ISR, SSG), where no
 *   request (and so no nonce) exists, and its inline scripts (React's flight
 *   data) differ per page, so hashes can't list them either. Those pages use
 *   `'self' 'unsafe-inline'` plus the exact script hosts below. They render no
 *   user content; making them all dynamic to carry a nonce would give up static
 *   rendering, CDN caching and PPR (Next's CSP guide).
 *
 * The other directives are identical in both policies, because a client-side
 * navigation keeps the policy of the page that was loaded first: a visitor who
 * lands on / and opens the dashboard keeps /'s policy.
 *
 * Images and media are `https:`: the page editor previews customers' own image
 * and audio links, the OAuth consent screen shows logos developers registered,
 * and integrations show thumbnails, all from any host. Scripts, connections,
 * frames and fonts are allowlisted.
 *
 * Hosted pages (/p) and customers' custom domains don't use this policy: see
 * HOSTED_PAGE_CSP.
 */

export type Directives = Record<string, string[]>;

/** Paths rendered per request that carry a nonce (must stay dynamic: no PPR or static rendering). */
export const NONCE_ROUTE =
  /^\/(?:dashboard|settings|admin|oauth|invite)(?:\/.*)?$/;

/** Path prefixes the prerendered-page policy (next.config) never applies to. */
export const NO_APP_CSP_PREFIXES = [
  // Nonce routes: proxy.ts sets their policy.
  "dashboard",
  "settings",
  "admin",
  "oauth",
  "invite",
  // Customer-facing: hosted pages and short links (own policies).
  "p",
  "q",
  // Machine endpoints, build assets and the analytics proxy.
  "api",
  "_next",
  "ingest",
] as const;

/** The third-party origins QRdx's own pages use, and why. */
export const SOURCES = {
  /** Umami's script (cloud default; NEXT_PUBLIC_UMAMI_SCRIPT_URL may change it) */
  umamiScript: "https://cloud.umami.is",
  /** Umami's collector */
  umamiCollect: "https://gateway.umami.is",
  /** Featurebase widget: SDK, its chunks and CSS */
  featurebaseAssets: [
    "https://do.featurebase.app",
    "https://sdk.featurebase.app",
  ],
  /** Featurebase API, socket and messenger frames (per-workspace subdomains) */
  featurebaseApi: [
    "https://featurebase.app",
    "https://*.featurebase.app",
    "wss://*.featurebase.app",
  ],
  /** Featurebase's widget CSS loads Inter and Geist from Google Fonts */
  googleFonts: "https://fonts.gstatic.com",
  /** Cloudflare Turnstile on /report-abuse and page forms (editor preview) */
  turnstile: "https://challenges.cloudflare.com",
  /** Direct browser uploads (presigned PUT) and presigned reads */
  r2Api: "https://*.r2.cloudflarestorage.com",
  /** The scanner's ZXing WebAssembly decoder (barcode-detector) */
  zxingWasm: "https://fastly.jsdelivr.net",
  /** Video and map embeds in the page editor preview and template demos */
  embeds: [
    "https://www.youtube-nocookie.com",
    "https://player.vimeo.com",
    "https://www.loom.com",
    "https://maps.google.com",
    "https://www.google.com",
  ],
  /** PostHog's heatmap viewer may frame QRdx pages */
  posthogApp: "https://us.posthog.com",
  /** Vercel's toolbar, on preview deployments only */
  vercelLive: "https://vercel.live",
} as const;

export interface CspOptions {
  /** `next dev`: React needs eval for its debugging, HMR a websocket */
  dev?: boolean;
  /** Served over https (adds upgrade-insecure-requests) */
  https?: boolean;
  /** A Vercel preview deployment (allows the Vercel toolbar) */
  preview?: boolean;
  /** Public storage origins: site media and R2_PUBLIC_BASE_URL */
  storageOrigins?: string[];
  /** Umami script URL, when not the cloud default */
  umamiScriptUrl?: string;
  /** Where browsers send violation reports */
  reportUri?: string;
}

export interface AppCspOptions {
  /** Per-request nonce (nonce routes); without one, the prerendered-page policy */
  nonce?: string;
  /** The OAuth consent page: never framed; its form redirects to the app */
  oauth?: boolean;
}

function originOf(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const { origin } = new URL(value);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

const unique = (values: (string | null | undefined | false)[]) => [
  ...new Set(values.filter((value): value is string => Boolean(value))),
];

/** Options from the environment (build time in next.config, runtime in proxy). */
export function cspOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): CspOptions {
  return {
    dev: env.NODE_ENV === "development",
    https: env.VERCEL === "1" || env.CSP_HTTPS === "1",
    preview: env.VERCEL_ENV === "preview",
    storageOrigins: unique([
      originOf(mediaManifest.origin),
      originOf(env.R2_PUBLIC_BASE_URL),
    ]),
    umamiScriptUrl: env.NEXT_PUBLIC_UMAMI_SCRIPT_URL,
    reportUri: "/api/csp-report",
  };
}

/** The policy's directives (see the file comment for the reasoning). */
export function appCspDirectives(
  options: CspOptions,
  { nonce, oauth = false }: AppCspOptions = {},
): Directives {
  const { dev = false, preview = false, storageOrigins = [] } = options;
  const umamiScript = originOf(options.umamiScriptUrl) ?? SOURCES.umamiScript;
  const vercel = preview ? [SOURCES.vercelLive] : [];

  const scriptHosts = [
    umamiScript,
    ...SOURCES.featurebaseAssets,
    SOURCES.turnstile,
    ...vercel,
  ];
  const script = nonce
    ? // CSP3 browsers use the nonce and trust what nonced scripts load
      // ('strict-dynamic' ignores the host list); older ones fall back to it.
      ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...scriptHosts]
    : ["'self'", "'unsafe-inline'", ...scriptHosts];
  // The scanner compiles its WebAssembly decoder; React's dev build uses eval.
  script.push("'wasm-unsafe-eval'");
  if (dev) script.push("'unsafe-eval'");

  const directives: Directives = {
    "default-src": ["'self'"],
    "script-src": script,
    "style-src": unique([
      "'self'",
      "'unsafe-inline'",
      ...SOURCES.featurebaseAssets,
      ...vercel,
    ]),
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": unique([
      "'self'",
      "data:",
      SOURCES.googleFonts,
      ...(preview ? ["https://vercel.live", "https://assets.vercel.com"] : []),
    ]),
    "media-src": ["'self'", "data:", "blob:", "https:"],
    "connect-src": unique([
      "'self'",
      SOURCES.umamiCollect,
      umamiScript,
      ...SOURCES.featurebaseAssets,
      ...SOURCES.featurebaseApi,
      SOURCES.r2Api,
      ...storageOrigins,
      SOURCES.zxingWasm,
      ...(preview ? [SOURCES.vercelLive, "wss://ws-us3.pusher.com"] : []),
      ...(dev ? ["ws:", "wss:"] : []),
    ]),
    "frame-src": unique([
      "'self'",
      ...storageOrigins,
      SOURCES.r2Api,
      ...SOURCES.embeds,
      SOURCES.turnstile,
      "https://*.featurebase.app",
      ...vercel,
    ]),
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // The consent form's response redirects to the app's redirect_uri
    // (https, or http on loopback for local development).
    "form-action": oauth
      ? [
          "'self'",
          "https:",
          "http://localhost:*",
          // CSP has no syntax for IPv6 literals ([::1]).
          "http://127.0.0.1:*",
        ]
      : ["'self'"],
    "frame-ancestors": oauth ? ["'none'"] : ["'self'", SOURCES.posthogApp],
  };
  if (options.https) directives["upgrade-insecure-requests"] = [];
  if (options.reportUri) {
    directives["report-uri"] = [options.reportUri];
    directives["report-to"] = ["csp"];
  }
  return directives;
}

export function serializeCsp(directives: Directives): string {
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

export function appCsp(options: CspOptions, app: AppCspOptions = {}): string {
  return serializeCsp(appCspDirectives(options, app));
}

/** `Reporting-Endpoints` value for the `report-to csp` group. */
export function reportingEndpoints(options: CspOptions): string | null {
  return options.reportUri ? `csp="${options.reportUri}"` : null;
}

/**
 * Hosted pages (/p, also on customers' custom domains): a deliberately loose
 * policy. These pages run the owner's tracking pixels and tag managers (which
 * load and eval scripts from anywhere), embed media from any host, and are
 * meant to be framed by their owners, so a script or source allowlist would
 * break them. Their content is structured blocks rendered by React (escaped)
 * and Business custom CSS is sanitized (no url(), @import or @font-face). The
 * policy still blocks plugins and <base> hijacking. Short-link gate pages
 * (/q) and the custom-domain placeholder pages set their own strict policies.
 */
export function hostedPageCsp(options: CspOptions): string {
  const directives: Directives = {
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
  };
  if (options.https) directives["upgrade-insecure-requests"] = [];
  return serializeCsp(directives);
}

/** A fresh nonce: 128 random bits, base64. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Header name: enforced, or report-only while a rollout is being checked. */
export function cspHeaderName(
  env: Record<string, string | undefined> = process.env,
): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return env.CSP_REPORT_ONLY === "1"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}

/** Path-to-regexp source for next.config headers: every path outside NO_APP_CSP_PREFIXES. */
export function prerenderedPagesSource(): string {
  const skip = NO_APP_CSP_PREFIXES.flatMap((prefix) => [
    `${prefix}/`,
    `${prefix}$`,
  ]).join("|");
  return `/:path((?!${skip}).*)`;
}
