// The SQL half of keyset paging (lib/keyset-cursor.ts has the cursors): a
// list ordered by a timestamp, newest first, with the id breaking ties.
//
// Postgres keeps microseconds; a cursor carries a JS Date, which stops at
// milliseconds. Ordering and comparing on the timestamp truncated to the
// millisecond keeps two rows written within one millisecond (now() in a
// default, or one INSERT for many rows) from being skipped between pages.
import {
  type AnyColumn,
  and,
  desc,
  eq,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Keyset } from "@/lib/keyset-cursor";

/** `column` to the millisecond: what a cursor can hold. */
export const toMilliseconds = (column: AnyColumn): SQL<Date> =>
  sql<Date>`date_trunc('milliseconds', ${column})`;

/**
 * A cursor's time as a timestamp column holds it: UTC wall time, the way
 * Drizzle writes a Date to such a column. Compared with an expression rather
 * than the column itself, a bare Date would reach the driver as local time
 * with an offset that a timestamp without time zone drops.
 */
const cursorTime = (at: Date): SQL<Date> =>
  sql<Date>`${at.toISOString()}::timestamp`;

/** Rows after `after` in keysetOrder; undefined (no condition) for the first page. */
export function keysetAfter(
  time: AnyColumn,
  id: AnyColumn,
  after: Keyset | null,
): SQL | undefined {
  if (!after) return;
  const at = toMilliseconds(time);
  return or(
    lt(at, cursorTime(after.at)),
    and(eq(at, cursorTime(after.at)), lt(id, after.id)),
  );
}

/** Newest first to the millisecond, then by id. */
export const keysetOrder = (time: AnyColumn, id: AnyColumn): SQL[] => [
  desc(toMilliseconds(time)),
  desc(id),
];
