import "server-only";

import { database } from "@repo/database";
import { sql } from "drizzle-orm";
import type { HomeNumberCounts } from "@/lib/home-numbers/stats";

// The counts behind "QRdx in numbers". The database is shared and live, so
// this is one read-only statement of aggregates, run in a READ ONLY
// transaction with a statement timeout. It never writes.
//
// What's counted, so the labels stay exact (lib/home-numbers/stats.ts):
// - Accounts: email verified, not banned, and not on a reserved test domain
//   (.test, .example, .invalid, .localhost, example.com/.net/.org: no person
//   can have those addresses; local and e2e accounts use @qrdx.test).
// - Dynamic QR codes: every qr_code row of a counted account (trashed and
//   archived ones too: they were created), minus codes an admin switched
//   off (is_active = false: abuse). Static codes aren't stored anywhere.
// - Scans: qr_code.scan_count of those codes. lib/scans.ts bumps it in the
//   same batch that inserts the qr_scan row (bots and prefetches skipped),
//   so it is the rollup of qr_scan without counting that table.
// - Countries: distinct ISO country codes over every recorded scan of any
//   dynamic code (bots skipped at recording; "XX" = unknown). Unlike the
//   counts above it doesn't leave out test accounts or switched-off codes:
//   any join to do that costs 5x on a big qr_scan (1.27 s against 0.26 s
//   for 3M scans, measured locally), and those are still real scans from
//   real places. One seq scan with a hash aggregate (about 250 groups).
// - Since: the first month of the counted rows. qr_code, qr_scan and
//   scan_count all date from the same schema change, so every count covers
//   QRdx's whole history; "since" just names that start. The first scan
//   comes from qr_scan_scanned_at_idx (one index row).
// Deleted accounts and codes take their rows with them, so every count is
// a lower bound.

/** Per statement, on the database. */
export const HOME_NUMBERS_STATEMENT_TIMEOUT = "3s";
/** Overall wait for the HTTP round trip, in case the network hangs. */
export const HOME_NUMBERS_DEADLINE_MS = 10_000;

export const HOME_NUMBERS_SQL = `WITH counted_user AS (
  SELECT id, created_at
  FROM "user"
  WHERE email_verified
    AND banned IS NOT TRUE
    AND email !~* '(\\.(test|example|invalid|localhost)|@example\\.(com|net|org))$'
),
code_totals AS (
  SELECT count(*) AS codes,
         min(c.created_at) AS first_code,
         coalesce(sum(c.scan_count), 0) AS scans
  FROM qr_code c
  JOIN counted_user u ON u.id = c.user_id
  WHERE c.is_active
),
account_totals AS (
  SELECT count(*) AS accounts, min(created_at) AS first_account
  FROM counted_user
)
SELECT
  code_totals.codes::bigint AS codes,
  to_char(code_totals.first_code, 'YYYY-MM') AS codes_since,
  code_totals.scans::bigint AS scans,
  (SELECT to_char(min(scanned_at), 'YYYY-MM') FROM qr_scan) AS scans_since,
  (SELECT count(*) FROM (
     SELECT country
     FROM qr_scan
     WHERE country ~ '^[A-Z]{2}$' AND country <> 'XX'
     GROUP BY country
   ) AS seen)::bigint AS countries,
  account_totals.accounts::bigint AS accounts,
  to_char(account_totals.first_account, 'YYYY-MM') AS accounts_since
FROM code_totals, account_totals`;

/** The statements sent, in order, as one transaction. */
export const HOME_NUMBERS_STATEMENTS = [
  "SET TRANSACTION READ ONLY",
  `SET LOCAL statement_timeout = '${HOME_NUMBERS_STATEMENT_TIMEOUT}'`,
  HOME_NUMBERS_SQL,
] as const;

function toCount(value: unknown, name: string): number {
  const count = typeof value === "string" ? Number(value) : value;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new TypeError(`home numbers: ${name} is not a count`);
  }
  return count;
}

function toMonth(value: unknown, name: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) return value;
  throw new TypeError(`home numbers: ${name} is not a month`);
}

/** The row the statement returns; throws on anything unexpected. */
export function parseHomeNumberCounts(row: unknown): HomeNumberCounts {
  if (!row || typeof row !== "object") {
    throw new TypeError("home numbers: no row");
  }
  const r = row as Record<string, unknown>;
  return {
    codes: toCount(r.codes, "codes"),
    codesSince: toMonth(r.codes_since, "codes_since"),
    scans: toCount(r.scans, "scans"),
    scansSince: toMonth(r.scans_since, "scans_since"),
    countries: toCount(r.countries, "countries"),
    accounts: toCount(r.accounts, "accounts"),
    accountsSince: toMonth(r.accounts_since, "accounts_since"),
  };
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`home numbers: no answer after ${ms} ms`)),
      ms,
    );
  });
  // A late failure after the deadline must not be an unhandled rejection.
  work.catch(() => {});
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/** Reads the counts. Throws when the database fails or times out. */
export async function queryHomeNumberCounts(): Promise<HomeNumberCounts> {
  const [readOnly, timeout, statement] = HOME_NUMBERS_STATEMENTS;
  const [, , result] = await withDeadline(
    database.batch([
      database.execute(sql.raw(readOnly)),
      database.execute(sql.raw(timeout)),
      database.execute(sql.raw(statement)),
    ]),
    HOME_NUMBERS_DEADLINE_MS,
  );
  return parseHomeNumberCounts(result.rows[0]);
}
