// The connected link shortener's links, a page at a time, for the
// integration's settings panel. Client-safe.
import { apiFetch } from "@/lib/api-fetch";
import type { CursorPage } from "@/lib/keyset-cursor";

export interface ShortLink {
  id: string;
  domain: string;
  key: string;
  url: string;
  title?: string;
  description?: string;
  archived: boolean;
  clicks?: number;
  createdAt: string;
}

/** Links a page of the list loads (the route allows up to 100). */
export const LINKS_PAGE_SIZE = 25;
/** Most pages the route serves (its `page` is bounded at 10,000). */
const MAX_PAGE = 10_000;

/**
 * One page of the account's links. The provider pages by number, so the
 * cursor is the next page number, and the route's `meta.hasMore` says
 * whether that page exists.
 */
export async function fetchLinksPage(
  search: string,
  page: number,
  errorMessage: string,
): Promise<CursorPage<ShortLink>> {
  const number = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const params = new URLSearchParams({
    page: String(number),
    pageSize: String(LINKS_PAGE_SIZE),
  });
  if (search) params.set("search", search);
  const response = await apiFetch(`/api/integrations/dub/links?${params}`);
  if (!response.ok) throw new Error(errorMessage);
  const data = (await response.json()) as {
    links?: ShortLink[];
    meta?: { hasMore?: boolean };
  };
  return {
    items: data.links ?? [],
    nextCursor:
      data.meta?.hasMore && number < MAX_PAGE ? String(number + 1) : null,
  };
}
