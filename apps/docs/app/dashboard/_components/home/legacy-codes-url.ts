// /dashboard used to be the codes list, so bookmarks and the import flow's
// return links can carry its filters (?q=, ?folder=, ?import=bitly…). Those
// still open the codes list, now at /dashboard/codes: proxy.ts answers them
// with a 307 (legacyCodesRedirect), and the page itself redirects too
// (legacyCodesUrl) in case a request gets past the proxy. Pure, for the tests.

/** Query parameters only the codes list reads (lib codes filters, import dialog). */
export const CODES_LIST_PARAMS = [
  "status",
  "q",
  "folder",
  "tags",
  "fav",
  "sort",
  "page",
  "import",
  "connect_error",
  "mock",
  "plan",
] as const;

type SearchParams = Record<string, string | string[] | undefined>;

/** The codes-list URL for an old /dashboard link, or null for Home itself. */
export function legacyCodesUrl(params: SearchParams): string | null {
  const keys = Object.keys(params);
  if (
    !keys.some((key) => (CODES_LIST_PARAMS as readonly string[]).includes(key))
  )
    return null;
  const search = new URLSearchParams();
  for (const key of keys) {
    const value = params[key];
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string") search.append(key, item);
    }
  }
  const query = search.toString();
  return query ? `/dashboard/codes?${query}` : "/dashboard/codes";
}

/**
 * For proxy.ts: where an old /dashboard link with codes-list parameters goes
 * (/dashboard/codes, with the query string kept as it was), or null.
 */
export function legacyCodesRedirect(
  pathname: string,
  search: string,
): string | null {
  if (pathname !== "/dashboard") return null;
  const params = new URLSearchParams(search);
  return CODES_LIST_PARAMS.some((key) => params.has(key))
    ? `/dashboard/codes${search}`
    : null;
}
