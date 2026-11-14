// Offset paging for the admin lists and Settings → Affiliate program: a
// `?page=` in the URL, 25 rows a page, Previous / Next. Every query paged
// this way ends its ORDER BY on a unique column, so rows that tie on the
// sort key (codes made in one batch share a created_at) keep one order and
// show up exactly once across pages.
//
// Lists held in memory page the same way (pageSlice): the community
// galleries render `?page=N` on the server and load the pages after it as
// someone scrolls (components/infinite/infinite-list.tsx). Lists that load
// by cursor merge pages with appendUnique (lib/keyset-cursor.ts).

export const PAGE_SIZE = 25;

/**
 * The highest `?page=` read. Past it the OFFSET alone would make Postgres
 * walk a quarter of a million rows to show nothing.
 */
export const MAX_PAGE = 10_000;

/** One page of a list: its rows, how many there are in all, and which page. */
export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
}

/** `?page=` as a page number: 1 when missing or not a positive number. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_PAGE);
}

/** How many pages `total` rows fill; 1 when there are none. */
export function pageCountOf(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** `page` kept between the first and the last page. */
export function clampPage(
  page: number,
  total: number,
  pageSize = PAGE_SIZE,
): number {
  const whole = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.min(Math.max(1, whole), pageCountOf(total, pageSize));
}

export const offsetOf = (page: number, pageSize = PAGE_SIZE): number =>
  (page - 1) * pageSize;

/**
 * Loads `page`, and when it's past the last page (an old link, a typed
 * `?page=`, rows deleted since) loads the last page instead. Returns the
 * page it loaded, which is the one the pager should show.
 */
export async function loadPage<T extends { total: number }>(
  page: number,
  load: (page: number) => Promise<T>,
  pageSize = PAGE_SIZE,
): Promise<T & { page: number }> {
  const first = await load(page);
  const last = pageCountOf(first.total, pageSize);
  if (page <= last) return { ...first, page };
  // Nothing to show on any page: no second query.
  if (first.total === 0) return { ...first, page: 1 };
  return { ...(await load(last)), page: last };
}

export interface PageSlice<T> {
  /** The page shown: the one asked for, clamped to the pages that exist */
  page: number;
  /** How many pages there are (at least 1) */
  pages: number;
  items: T[];
  /** The page after this one, or null on the last page */
  nextPage: number | null;
}

/** One page of a list held in memory, `pageSize` at a time. */
export function pageSlice<T>(
  items: readonly T[],
  requested: number,
  pageSize = PAGE_SIZE,
): PageSlice<T> {
  const pages = pageCountOf(items.length, pageSize);
  const page = clampPage(requested, items.length, pageSize);
  const start = offsetOf(page, pageSize);
  return {
    page,
    pages,
    items: items.slice(start, start + pageSize),
    nextPage: page < pages ? page + 1 : null,
  };
}

/**
 * `href` pointing at `page`, with its other parameters (filters, sort,
 * search) kept. Page 1 drops the parameter, so it stays the list's own URL.
 */
export function withPageParam(
  href: string,
  page: number,
  param = "page",
): string {
  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const withoutHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = withoutHash.indexOf("?");
  const path = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const params = new URLSearchParams(
    queryAt === -1 ? "" : withoutHash.slice(queryAt + 1),
  );
  if (page > 1) params.set(param, String(Math.floor(page)));
  else params.delete(param);
  const search = params.toString();
  return `${path}${search ? `?${search}` : ""}${hash}`;
}
