// Paging rules for the dashboard's tables, shared by the codes, barcodes,
// pages, form responses and webhook deliveries lists. Pure and client-safe;
// the page number itself is read with lib/paging.ts.
//
// - The page and the page size live in the URL (`?page=`, `?size=`), so a
//   link or Back shows the same rows. A filter, search or sort change starts
//   again on page 1 and keeps the size.
// - Every paged query ends its ORDER BY on a unique column, so rows that tie
//   on the sort key keep one order and show up exactly once across pages.
// - Selection is per page: the rows a bulk action reaches are the ones on
//   screen (dashboard/_lib/list-selection.ts prunes the rest on a new page).

/** The page sizes a list offers; the first is its default. */
export type PageSizeOptions = readonly [number, ...number[]];

export const TABLE_PAGE_SIZES = [25, 50, 100] as const;
/** Card grids fill rows of 2, 3 and 4 columns evenly. */
export const GRID_PAGE_SIZES = [24, 48, 96] as const;

/** `?size=` as one of `options`; the first (the default) otherwise. */
export function parsePageSize(
  value: string | string[] | undefined,
  options: PageSizeOptions,
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const size = Number.parseInt(String(raw ?? ""), 10);
  return options.includes(size) ? size : options[0];
}

/** `size` for the URL: nothing when it's the list's default. */
export function pageSizeParam(
  size: number,
  options: PageSizeOptions,
): string | null {
  return size === options[0] ? null : String(size);
}

/**
 * The rows-per-page menu for a list of `total` rows, or undefined when every
 * row fits on a page of the smallest size (there's nothing to choose).
 */
export function pageSizeMenu({
  options,
  value,
  total,
  label,
  href,
}: {
  options: PageSizeOptions;
  value: number;
  total: number;
  /** "50 per page" */
  label: (size: number) => string;
  /** The list at that size, on page 1 */
  href: (size: number) => string;
}):
  | { value: number; options: { value: number; label: string; href: string }[] }
  | undefined {
  if (total <= options[0]) return;
  return {
    value,
    options: options.map((size) => ({
      value: size,
      label: label(size),
      href: href(size),
    })),
  };
}

/**
 * A page read with one extra row (`limit + 1`): the rows to show and whether
 * a next page exists, for lists where counting every row costs too much.
 */
export function takePage<T>(
  rows: readonly T[],
  limit: number,
): { rows: T[]; hasMore: boolean } {
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}
