// The console zone: QRdx's back office, a separate Next.js app (apps/console
// in the private qrdxinc/cloud repo) that serves five /admin sections at
// their URLs on qrdx.dev. The main app proxies them there once
// CONSOLE_ORIGIN is set; unset (self-hosting, and qrdx.dev until the
// cutover), nothing changes and the main app serves its own pages. Both apps
// import this one list. Pure: next.config.ts, proxy.ts, client components
// and tests import it.

/** The /admin sections the console serves: /admin/<section> and below. */
export const CONSOLE_SECTIONS = [
  "growth",
  "numbers",
  "subscriptions",
  "ai-usage",
  "affiliates",
] as const;

export type ConsoleSection = (typeof CONSOLE_SECTIONS)[number];

/** The console's assetPrefix: its build assets live under it on qrdx.dev. */
export const CONSOLE_ASSET_PREFIX = "/console-static";

/**
 * The request header the main app's proxy.ts sets on console pages, from
 * CONSOLE_ZONE_KEY, after dropping any copy the browser sent. The console
 * sends requests without it to qrdx.dev. That keeps its own address out of
 * search results; the session check is what keeps people out.
 */
export const CONSOLE_KEY_HEADER = "x-qrdx-zone-key";

/** A next.config rewrite that only applies on the hosts given. */
export interface ConsoleRewrite {
  source: string;
  destination: string;
  has: { type: "host"; value: string }[];
}

export interface ConsoleZoneOptions {
  /**
   * The host condition's value: a regex of QRdx's own hosts (next.config's
   * PLATFORM_HOSTS). Customers' domains never reach the console.
   */
  hosts: string;
}

/**
 * `url` without its trailing slashes. A loop rather than /\/+$/, which
 * backtracks on every position of a long run of slashes.
 */
function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * Whether `value` can be CONSOLE_ORIGIN: an origin and nothing else (no
 * path, query, hash or credentials; trailing slashes are fine), over https,
 * or over http on localhost for local development.
 */
export function isConsoleOrigin(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const secure =
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname));
  return secure && withoutTrailingSlashes(value).toLowerCase() === url.origin;
}

/**
 * The main app's beforeFiles rewrites that send the console's sections and
 * build assets to the console at `origin` (its origin is used, so a stray
 * path or query can't end up in the destinations). None while `origin` is
 * unset or empty: the main app keeps serving its own pages.
 *
 * A section name fills a whole segment, so /admin/growthx and the other
 * /admin sections never match.
 */
export function consoleZoneRewrites(
  origin: string | undefined,
  { hosts }: ConsoleZoneOptions
): ConsoleRewrite[] {
  if (!origin) return [];
  const zone = new URL(origin).origin;
  const has = [{ type: "host" as const, value: hosts }];
  return [
    {
      source: `/admin/:section(${CONSOLE_SECTIONS.join("|")})/:path*`,
      destination: `${zone}/admin/:section/:path*`,
      has,
    },
    {
      source: `${CONSOLE_ASSET_PREFIX}/:path*`,
      destination: `${zone}${CONSOLE_ASSET_PREFIX}/:path*`,
      has,
    },
  ];
}

// Next matches beforeFiles rewrites without regard to case (it never passes
// them experimental.caseSensitiveRoutes), so these do too.
const SECTION_PATH = new RegExp(
  `^/admin/(${CONSOLE_SECTIONS.join("|")})(?:/|$)`,
  "i"
);
const ASSET_PATH = new RegExp(`^${CONSOLE_ASSET_PREFIX}(?:/|$)`, "i");

/** The console section `pathname` is in (/admin/<section> or below), or null. */
export function consoleSection(pathname: string): ConsoleSection | null {
  const section = SECTION_PATH.exec(pathname)?.[1];
  return section ? (section.toLowerCase() as ConsoleSection) : null;
}

/**
 * Whether the console serves `pathname` once CONSOLE_ORIGIN is set: one of
 * its sections' pages, or its build assets.
 */
export function isConsolePath(pathname: string): boolean {
  return consoleSection(pathname) !== null || ASSET_PATH.test(pathname);
}

// The console's two prefixes as the first segment, in any case.
const ZONE_PREFIX = /^\/(admin|console-static)(?=\/|$)/i;

/**
 * `pathname` with its /admin or /console-static prefix lower-cased, or null
 * when the prefix already is (or there's none). The rewrites match /ADMIN/…
 * too, but proxy.ts matchers and the pages don't, so the proxy sends any
 * other casing to the lower-case path before anything reaches the console.
 */
export function lowerCasedZonePrefix(pathname: string): string | null {
  const prefix = ZONE_PREFIX.exec(pathname)?.[1];
  if (!prefix || prefix === prefix.toLowerCase()) return null;
  return `/${prefix.toLowerCase()}${pathname.slice(prefix.length + 1)}`;
}

/** A `..` or an encoded dot (%2e, %2E) anywhere in `pathname`. */
export function hasDotSegment(pathname: string): boolean {
  return pathname.includes("..") || /%2e/i.test(pathname);
}

const RETURN_BASE = "https://return.invalid";

/**
 * `next` as a path (with its query) when it's a console page on this site,
 * else null: where /admin/confirm may send an admin back to. Never another
 * host, a protocol-relative URL, a build asset or another /admin page.
 */
export function consoleReturnPath(
  next: string | null | undefined
): string | null {
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(next, RETURN_BASE);
  } catch {
    return null;
  }
  if (url.origin !== RETURN_BASE || consoleSection(url.pathname) === null) {
    return null;
  }
  return `${url.pathname}${url.search}`;
}
