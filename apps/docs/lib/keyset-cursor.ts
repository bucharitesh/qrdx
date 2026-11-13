// Keyset ("cursor") paging for lists that load more as you scroll: each page
// asks for rows after the last one it showed, by (timestamp, id), newest
// first. Unlike an OFFSET, a row added or removed while someone scrolls
// never shifts the next page, so nothing shows twice or goes missing, and
// rows that share a timestamp are ordered by id. Pure and client-safe.

/** Where the next page starts: just after this row. */
export interface Keyset {
  at: Date;
  id: string;
}

/** A page of a cursor-paged list; `nextCursor` is null after the last page. */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** "<epoch ms>.<id>": opaque to clients, readable in logs. */
export function encodeKeyset({ at, id }: Keyset): string {
  return `${at.getTime()}.${id}`;
}

/** The cursor a client sent back, or null when it isn't one of ours. */
export function decodeKeyset(value: string | null | undefined): Keyset | null {
  if (typeof value !== "string" || value.length > 160) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const ms = Number(value.slice(0, dot));
  const id = value.slice(dot + 1);
  if (!(Number.isSafeInteger(ms) && ms >= 0 && ID_PATTERN.test(id))) {
    return null;
  }
  return { at: new Date(ms), id };
}

/**
 * Rows read with one extra (`limit + 1`) as a page: the rows to show and the
 * cursor for the next page, or null when that was the last.
 */
export function toCursorPage<T, R>(
  rows: readonly R[],
  limit: number,
  keyOf: (row: R) => Keyset,
  map: (row: R) => T,
): CursorPage<T> {
  const shown = rows.slice(0, limit);
  const last = shown.at(-1);
  return {
    items: shown.map(map),
    nextCursor: rows.length > limit && last ? encodeKeyset(keyOf(last)) : null,
  };
}

/**
 * `incoming` added after `existing`, leaving out any item already there (by
 * key) or repeated within `incoming`: a page that overlaps the last one
 * never shows a row twice.
 */
export function appendUnique<T>(
  existing: readonly T[],
  incoming: readonly T[],
  keyOf: (item: T) => string,
): T[] {
  const seen = new Set(existing.map(keyOf));
  const next = [...existing];
  for (const item of incoming) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}
