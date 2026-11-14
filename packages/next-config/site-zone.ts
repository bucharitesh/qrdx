// The site zone: QRdx's marketing pages, a separate Next.js app that serves
// some of qrdx.dev's public pages at their URLs. The main app proxies them
// there once SITE_ORIGIN is set; unset (self-hosting, and qrdx.dev until the
// cutover), nothing changes and the main app serves its own pages. Both apps
// import this one list. Pure: next.config.ts, proxy.ts, client components
// and tests import it.
//
// The pages move in groups (the blog first; comparisons, SEO pages and the
// home page later), so the list is a map of group → path prefixes. A group
// is on while SITE_ORIGIN is set and SITE_ZONE_GROUPS is unset or names it,
// so traffic moves one group at a time with an environment change and a
// redeploy, and moves back the same way.
//
// Unlike the console, these pages are public: no session check, and the
// main app adds no cache rules of its own, so the zone's own Cache-Control
// decides what the CDN keeps (as with the docs zone). What the zone gets
// from the proxy is the zone key, so it can turn away requests that didn't
// come through qrdx.dev and keep its own address out of search results.

/**
 * The groups of pages the site serves, each a list of path prefixes: the
 * page at the prefix and everything under it (its Open Graph images, feeds,
 * Markdown copies and child pages). "/" would mean the home page alone.
 *
 * Adding a group here is what moves its pages; the shape stays the same.
 */
export const SITE_GROUPS = {
  /** /blog, its feed (/blog/rss.xml), categories, authors and posts. */
  blog: ["/blog"],
} as const satisfies Record<string, readonly string[]>;

export type SiteGroup = keyof typeof SITE_GROUPS;

/** Every group, in the order their rewrites are listed. */
export const SITE_GROUP_NAMES = Object.keys(
  SITE_GROUPS
) as readonly SiteGroup[];

/** The site's assetPrefix: its build assets live under it on qrdx.dev. */
export const SITE_ASSET_PREFIX = "/site-static";

/**
 * The request header the main app's proxy.ts sets on the site's pages and
 * assets, from SITE_ZONE_KEY, after dropping any copy the browser sent. The
 * same header name as the console zone's, with the site's own value. The
 * site answers requests without it however it sees fit (a redirect to
 * qrdx.dev keeps its own address out of search results).
 */
export const SITE_KEY_HEADER = "x-qrdx-zone-key";

/** A next.config rewrite that only applies on the hosts given. */
export interface SiteRewrite {
  source: string;
  destination: string;
  has: { type: "host"; value: string }[];
}

export interface SiteZoneOptions {
  /**
   * The host condition's value: a regex of QRdx's own hosts (next.config's
   * PLATFORM_HOSTS). Customers' domains never reach the site.
   */
  hosts: string;
  /** The groups that are on (siteZoneGroups); every group by default. */
  groups?: readonly SiteGroup[];
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
 * Whether `value` can be SITE_ORIGIN: an origin and nothing else (no path,
 * query, hash or credentials; trailing slashes are fine), over https, or
 * over http on localhost for local development.
 */
export function isSiteOrigin(value: string): boolean {
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

export function isSiteGroup(name: string): name is SiteGroup {
  return Object.hasOwn(SITE_GROUPS, name);
}

/**
 * The groups SITE_ZONE_GROUPS names ("blog,compare"), in list order and
 * each once; every group when it's unset or blank. Null when a name isn't
 * a group: env.ts refuses the value then, naming the variable.
 */
export function parseSiteZoneGroups(
  value: string | undefined
): SiteGroup[] | null {
  if (value === undefined || value.trim() === "") return [...SITE_GROUP_NAMES];
  const names = value.split(",").map((name) => name.trim());
  if (!names.every(isSiteGroup)) return null;
  return SITE_GROUP_NAMES.filter((group) => names.includes(group));
}

/** Whether `value` can be SITE_ZONE_GROUPS. */
export function isSiteZoneGroups(value: string): boolean {
  return parseSiteZoneGroups(value) !== null;
}

/**
 * The groups that are on, for a SITE_ZONE_GROUPS that env.ts has accepted.
 * Throws on anything else, so next.config.ts and proxy.ts never disagree
 * about a value one of them couldn't read.
 */
export function siteZoneGroups(value: string | undefined): SiteGroup[] {
  const groups = parseSiteZoneGroups(value);
  if (!groups) {
    throw new Error(
      `SITE_ZONE_GROUPS must name groups from: ${SITE_GROUP_NAMES.join(", ")}`
    );
  }
  return groups;
}

/** The rewrite source for a prefix: the page and everything under it. */
function sourceFor(prefix: string): string {
  return prefix === "/" ? "/" : `${prefix}/:path*`;
}

/**
 * The main app's beforeFiles rewrites that send the groups' pages and the
 * site's build assets to the site at `origin` (its origin is used, so a
 * stray path or query can't end up in the destinations). None while
 * `origin` is unset or empty, or no group is on: the main app keeps serving
 * its own pages.
 *
 * A prefix fills whole segments, so /blogx never matches, and the rules
 * carry no cache or policy of their own: the zone's responses do.
 */
export function siteZoneRewrites(
  origin: string | undefined,
  { hosts, groups = SITE_GROUP_NAMES }: SiteZoneOptions
): SiteRewrite[] {
  if (!origin || groups.length === 0) return [];
  const zone = new URL(origin).origin;
  const has = [{ type: "host" as const, value: hosts }];
  const sources = [
    ...SITE_GROUP_NAMES.filter((group) => groups.includes(group)).flatMap(
      (group) => SITE_GROUPS[group].map(sourceFor)
    ),
    sourceFor(SITE_ASSET_PREFIX),
  ];
  return sources.map((source) => ({
    source,
    destination: `${zone}${source}`,
    has,
  }));
}

/**
 * Whether `pathname` is `prefix` or below it, without regard to case (Next
 * matches beforeFiles rewrites that way: it never passes them
 * experimental.caseSensitiveRoutes). "/" matches the home page alone.
 */
function underPrefix(pathname: string, prefix: string): boolean {
  if (prefix === "/") return pathname === "/";
  if (pathname.length < prefix.length) return false;
  const head = pathname.slice(0, prefix.length);
  if (head.toLowerCase() !== prefix) return false;
  const next = pathname[prefix.length];
  return next === undefined || next === "/";
}

/**
 * The group `pathname` belongs to (a page at one of its prefixes or below),
 * or null. `groups` narrows it to the groups that are on.
 */
export function siteGroup(
  pathname: string,
  groups: readonly SiteGroup[] = SITE_GROUP_NAMES
): SiteGroup | null {
  for (const group of SITE_GROUP_NAMES) {
    if (!groups.includes(group)) continue;
    if (SITE_GROUPS[group].some((prefix) => underPrefix(pathname, prefix))) {
      return group;
    }
  }
  return null;
}

/**
 * Whether the site serves `pathname` once SITE_ORIGIN is set: a page of one
 * of the groups that are on, or the site's build assets.
 *
 * Links from the main app into the site must be plain <a> elements (a full
 * page load): next/link would try to load the site's page in this app.
 */
export function isSitePath(
  pathname: string,
  groups: readonly SiteGroup[] = SITE_GROUP_NAMES
): boolean {
  // With no group on there are no rewrites, the assets' included.
  if (groups.length === 0) return false;
  return (
    siteGroup(pathname, groups) !== null ||
    underPrefix(pathname, SITE_ASSET_PREFIX)
  );
}

/**
 * `pathname` with its site prefix (/blog, /site-static, …) lower-cased, or
 * null when the prefix already is (or there's none). The rewrites match
 * /BLOG/… too, but proxy.ts matchers and the pages don't, so the proxy
 * sends any other casing to the lower-case path before anything reaches
 * the site. Every group's prefixes, on or off: the paths were 404s before.
 */
export function lowerCasedSitePrefix(pathname: string): string | null {
  const prefixes = [
    ...SITE_GROUP_NAMES.flatMap((group) => SITE_GROUPS[group]),
    SITE_ASSET_PREFIX,
  ].filter((prefix) => prefix !== "/");
  for (const prefix of prefixes) {
    if (!underPrefix(pathname, prefix)) continue;
    const head = pathname.slice(0, prefix.length);
    return head === prefix ? null : `${prefix}${pathname.slice(prefix.length)}`;
  }
  return null;
}
