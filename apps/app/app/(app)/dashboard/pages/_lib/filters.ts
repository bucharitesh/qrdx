// The Pages list's filters, kept in the URL (?q=&type=&size=&page=). Pure
// and client-safe: the server page and the toolbar both build links with it.
import {
  parsePageSize,
  TABLE_PAGE_SIZES,
} from "@/app/(app)/dashboard/_lib/list-paging";
import { parsePage } from "@/lib/paging";

export interface PagesFilters {
  q: string;
  /** A page type (lib/landing/templates); null for every type */
  type: string | null;
  page: number;
  /** Rows per page, one of TABLE_PAGE_SIZES */
  size: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const TYPE_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;

export function parsePagesFilters(params: SearchParams): PagesFilters {
  const type = one(params.type).trim();
  return {
    q: one(params.q).trim().slice(0, 200),
    type: TYPE_PATTERN.test(type) ? type : null,
    page: parsePage(params.page),
    size: parsePageSize(params.size, TABLE_PAGE_SIZES),
  };
}

/**
 * URL for the pages list with `patch` applied. A filter or page size change
 * starts again on page 1; the page size is kept.
 */
export function pagesHref(
  basePath: string,
  filters: PagesFilters,
  patch: Partial<PagesFilters>,
): string {
  const next = { ...filters, page: 1, ...patch };
  const search = new URLSearchParams();
  if (next.type) search.set("type", next.type);
  if (next.q) search.set("q", next.q);
  if (next.size !== TABLE_PAGE_SIZES[0]) search.set("size", String(next.size));
  if (next.page > 1) search.set("page", String(next.page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** The text a search looks for in a page's links: "qrdx.dev/p/menu" → "menu". */
export function linkSearchTerm(term: string): string {
  const slash = term.lastIndexOf("/p/");
  return slash === -1 ? term : term.slice(slash + 3);
}
