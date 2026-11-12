// Weeks for /admin/growth: UTC weeks starting on Monday, the way Postgres'
// date_trunc('week') counts them, named by their Monday (YYYY-MM-DD).

export const GROWTH_WEEKS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Monday 00:00 UTC of the week holding `date`. */
export function utcWeekStart(date: Date): Date {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return start;
}

/**
 * The page's weeks as YYYY-MM-DD Mondays, oldest first. The last one is the
 * current week, still running.
 */
export function growthWeeks(now = new Date(), count = GROWTH_WEEKS): string[] {
  const current = utcWeekStart(now).getTime();
  return Array.from({ length: count }, (_, i) =>
    isoDay(new Date(current - (count - 1 - i) * 7 * DAY_MS)),
  );
}

/** The Monday (YYYY-MM-DD) of the week holding a YYYY-MM-DD day. */
export const weekOfDay = (day: string) =>
  isoDay(utcWeekStart(new Date(`${day}T00:00:00Z`)));

/**
 * Whether everyone who signed up in the cohort week has had `days` days
 * since: until then a "within N days" count can still grow.
 */
export function windowClosed(week: string, days: number, now = new Date()) {
  return Date.parse(`${week}T00:00:00Z`) + (7 + days) * DAY_MS <= now.getTime();
}

export interface WeekCount {
  week: string;
  key: string;
  count: number;
}

export interface WeekPivot {
  /** Column keys, biggest total first; `last` keys at the end */
  keys: string[];
  /** One row per week, oldest first, zero-filled */
  rows: { week: string; values: Record<string, number>; total: number }[];
  totals: Record<string, number>;
  total: number;
}

/** Week × key counts as a table: every week present, every gap a zero. */
export function pivotWeeks(
  weeks: readonly string[],
  counts: readonly WeekCount[],
  last: readonly string[] = [],
): WeekPivot {
  const totals: Record<string, number> = {};
  const byWeek = new Map<string, Record<string, number>>(
    weeks.map((week) => [week, {}]),
  );
  for (const { week, key, count } of counts) {
    const values = byWeek.get(week);
    if (!values) continue;
    values[key] = (values[key] ?? 0) + count;
    totals[key] = (totals[key] ?? 0) + count;
  }
  const keys = Object.keys(totals).sort((a, b) => {
    const lastA = last.indexOf(a);
    const lastB = last.indexOf(b);
    if (lastA !== lastB) return lastA - lastB;
    return totals[b] - totals[a] || a.localeCompare(b);
  });
  const rows = weeks.map((week) => {
    const values = byWeek.get(week) ?? {};
    for (const key of keys) values[key] ??= 0;
    const total = keys.reduce((sum, key) => sum + values[key], 0);
    return { week, values, total };
  });
  return {
    keys,
    rows,
    totals,
    total: rows.reduce((sum, row) => sum + row.total, 0),
  };
}
