import "server-only";
import { database as db } from "@repo/database";
import { count, gte, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { DailyPoint } from "./types";

// Day windows and daily counts, shared by the admin queries here and the
// back-office console's.

const DAY_MS = 24 * 60 * 60 * 1000;

/** `days` days before now. */
export const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

/** Midnight UTC today, or `offsetDays` days before. */
export function startOfUtcDay(offsetDays = 0) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - offsetDays);
  return date;
}

/** Rows of `table` per UTC day over the last `days` days, today included; days without any count 0. */
export async function dailySeries(
  table: PgTable,
  column: PgColumn,
  days: number,
): Promise<DailyPoint[]> {
  const since = startOfUtcDay(days - 1);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${column}), 'YYYY-MM-DD')`,
      count: count(),
    })
    .from(table)
    .where(gte(column, since))
    .groupBy(sql`1`);

  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(since.getTime() + i * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return { date, count: byDay.get(date) ?? 0 };
  });
}
