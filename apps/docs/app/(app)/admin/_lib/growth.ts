import "server-only";
import { getAdminUserIds } from "@repo/auth/admin";
import { keys as authKeys } from "@repo/auth/keys";
import { database as db } from "@repo/database";
import { type SQL, sql } from "drizzle-orm";
import { withTimeout } from "./cache";
import { pivotWeeks, type WeekCount, type WeekPivot } from "./weeks";

// /admin/growth: weekly numbers from the shared, live database. Every
// statement is a read-only aggregate, sent in one batch after SET TRANSACTION
// READ ONLY and a statement timeout (like lib/home-numbers/query.ts). Weeks
// are UTC weeks starting on Monday, as Postgres' date_trunc('week') counts
// them. Admin accounts and reserved test addresses are left out of every
// count, with everything they own.
//
// user_acquisition, usage_daily and qr_code.created_via come from
// GROWTH_SQL_FILE. Until it's applied, the parts that read them report
// "not set up" (Postgres 42P01 / 42703) instead of failing the page.

export const GROWTH_SQL_FILE =
  "packages/database/manual-sql/2026-11-13-growth-analytics.sql";
/** Per statement, on the database. */
export const GROWTH_STATEMENT_TIMEOUT = "5s";
/** Overall wait for one batch's HTTP round trip. */
const DEADLINE_MS = 15_000;

/** The creator's own test scans come right after making a code. */
export const REAL_SCAN_AFTER = "1 hour";
/** Labels for rows with no recorded value. */
export const UNKNOWN_CHANNEL = "unknown";
export const NOT_RECORDED = "not recorded";

// ─── Who counts ──────────────────────────────────────────────────────────────

export interface AdminExclusions {
  ids: readonly string[];
  /** Lower-cased */
  emails: readonly string[];
}

const parseList = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/** The bootstrap admins from ADMIN_USER_IDS and ADMIN_EMAILS. */
export function adminExclusions(): AdminExclusions {
  return {
    ids: getAdminUserIds(),
    emails: parseList(authKeys().ADMIN_EMAILS).map((email) =>
      email.toLowerCase(),
    ),
  };
}

// Reserved test domains, as in lib/home-numbers/query.ts: no person can have
// these addresses, so they're local and e2e accounts.
const TEST_EMAIL = String.raw`(\.(test|example|invalid|localhost)|@example\.(com|net|org))$`;

/**
 * True for a `"user" u` row that counts: not an admin (role "admin", or
 * listed in ADMIN_USER_IDS / ADMIN_EMAILS) and not a test address.
 */
export function countedUser({ ids, emails }: AdminExclusions): SQL {
  const parts: SQL[] = [
    sql.raw(`coalesce(u.role, '') !~ '(^|,) *admin *(,|$)'`),
    sql.raw(`u.email !~* '${TEST_EMAIL}'`),
  ];
  if (ids.length > 0) parts.push(sql`u.id NOT IN ${[...ids]}`);
  if (emails.length > 0) {
    parts.push(sql`lower(u.email) NOT IN ${[...emails]}`);
  }
  return sql`(${sql.join(parts, sql.raw(" AND "))})`;
}

// ─── Statements ──────────────────────────────────────────────────────────────

const week = (column: string) =>
  sql.raw(`to_char(date_trunc('week', ${column}), 'YYYY-MM-DD')`);
// Timestamps are stored as UTC without a zone.
const NOW = sql.raw(`timezone('utc', now())`);
// A scan of code `c` that isn't the creator's own test (see REAL_SCAN_AFTER).
const realScan = sql.raw(
  `s.scanned_at > c.created_at + interval '${REAL_SCAN_AFTER}'`,
);

/** Sign-ups per week by channel; no row in user_acquisition = "unknown". */
export function signupsByChannelSql(start: string, counted: SQL): SQL {
  return sql`SELECT ${week("u.created_at")} AS week,
  coalesce(a.channel, ${UNKNOWN_CHANNEL}) AS key,
  count(*)::int AS count
FROM "user" u
LEFT JOIN user_acquisition a ON a.user_id = u.id
WHERE u.created_at >= ${start}::timestamp AND ${counted}
GROUP BY 1, 2`;
}

/** Sign-ups per week, before user_acquisition exists. */
export function signupsSql(start: string, counted: SQL): SQL {
  return sql`SELECT ${week("u.created_at")} AS week,
  ${UNKNOWN_CHANNEL} AS key,
  count(*)::int AS count
FROM "user" u
WHERE u.created_at >= ${start}::timestamp AND ${counted}
GROUP BY 1`;
}

export const ACQUISITION_FIELDS = [
  "referrer_host",
  "utm_source",
  "landing_path",
] as const;
export type AcquisitionField = (typeof ACQUISITION_FIELDS)[number];

/** The 10 most common values of one acquisition field, last 28 days. */
export function topAcquisitionSql(field: AcquisitionField, counted: SQL): SQL {
  const column = sql.raw(`a.${field}`);
  return sql`SELECT ${column} AS value, count(*)::int AS count
FROM user_acquisition a
JOIN "user" u ON u.id = a.user_id
WHERE u.created_at >= ${NOW} - interval '28 days'
  AND ${column} IS NOT NULL AND ${column} <> ''
  AND ${counted}
GROUP BY 1
ORDER BY 2 DESC, 1
LIMIT 10`;
}

/**
 * One row per weekly cohort. Each step is counted on its own (not only
 * people who did the step before):
 * - made_code: a dynamic code within 7 days of signing up;
 * - real_scan: a scan of one of their codes more than an hour after the code
 *   was made (heuristic: the creator's own test scans come right away);
 * - returned: signed in, refreshed a session, or made or edited a code 7 to
 *   14 days after signing up (approximate: a session row keeps only its last
 *   refresh). Admin impersonation doesn't count;
 * - paid: a subscription that's active or trialing now.
 */
export function activationSql(start: string, counted: SQL): SQL {
  const inWeek2 = (column: string) =>
    sql.raw(
      `(${column} >= u.created_at + interval '7 days' AND ${column} < u.created_at + interval '14 days')`,
    );
  return sql`SELECT ${week("u.created_at")} AS week,
  count(*)::int AS signed_up,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM qr_code c
    WHERE c.user_id = u.id AND c.created_at < u.created_at + interval '7 days'
  ))::int AS made_code,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM qr_code c
    JOIN qr_scan s ON s.qr_code_id = c.id
    WHERE c.user_id = u.id AND ${realScan}
  ))::int AS real_scan,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM session se
    WHERE se.user_id = u.id AND se.impersonated_by IS NULL
      AND (${inWeek2("se.created_at")} OR ${inWeek2("se.updated_at")})
  ) OR EXISTS (
    SELECT 1 FROM qr_code c
    WHERE c.user_id = u.id
      AND (${inWeek2("c.created_at")} OR ${inWeek2("c.updated_at")})
  ))::int AS returned,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM subscription p
    WHERE p.user_id = u.id AND p.status IN ('active', 'trialing')
  ))::int AS paid
FROM "user" u
WHERE u.created_at >= ${start}::timestamp AND ${counted}
GROUP BY 1`;
}

/** New dynamic codes per week by where they were made. */
export function codesByViaSql(start: string, counted: SQL): SQL {
  return sql`SELECT ${week("c.created_at")} AS week,
  coalesce(c.created_via, ${NOT_RECORDED}) AS key,
  count(*)::int AS count
FROM qr_code c
JOIN "user" u ON u.id = c.user_id
WHERE c.created_at >= ${start}::timestamp AND ${counted}
GROUP BY 1, 2`;
}

/** New dynamic codes per week, before qr_code.created_via exists. */
export function codesSql(start: string, counted: SQL): SQL {
  return sql`SELECT ${week("c.created_at")} AS week,
  ${NOT_RECORDED} AS key,
  count(*)::int AS count
FROM qr_code c
JOIN "user" u ON u.id = c.user_id
WHERE c.created_at >= ${start}::timestamp AND ${counted}
GROUP BY 1`;
}

/** Scans per week, the real ones among them, and the codes they were on. */
export function scansSql(start: string, counted: SQL): SQL {
  return sql`SELECT ${week("s.scanned_at")} AS week,
  count(*)::int AS scans,
  count(*) FILTER (WHERE ${realScan})::int AS real_scans,
  count(DISTINCT c.id) FILTER (WHERE ${realScan})::int AS codes
FROM qr_scan s
JOIN qr_code c ON c.id = s.qr_code_id
JOIN "user" u ON u.id = c.user_id
WHERE s.scanned_at >= ${start}::timestamp AND ${counted}
GROUP BY 1`;
}

/** All codes ever (still stored), and how many got a real scan. */
export function codeTotalsSql(counted: SQL): SQL {
  return sql`SELECT count(*)::int AS codes,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM qr_scan s WHERE s.qr_code_id = c.id AND ${realScan}
  ))::int AS really_scanned
FROM qr_code c
JOIN "user" u ON u.id = c.user_id
WHERE ${counted}`;
}

/** usage_daily summed per week, one key per "channel · metric". */
export function usageWeeklySql(start: string): SQL {
  return sql`SELECT ${week("d.day::timestamp")} AS week,
  d.channel || ' · ' || d.metric AS key,
  sum(d.count)::int AS count
FROM usage_daily d
WHERE d.day >= ${start}::date
GROUP BY 1, 2`;
}

/** The busiest tools, routes and commands of the last 28 days. */
export function usageTopSql(): SQL {
  return sql`SELECT d.channel, d.metric, d.key, sum(d.count)::int AS count
FROM usage_daily d
WHERE d.day >= (${NOW} - interval '28 days')::date AND d.key <> ''
GROUP BY 1, 2, 3
ORDER BY 4 DESC, 1, 2, 3
LIMIT 15`;
}

/** API keys and OAuth (MCP and app) tokens of counted accounts. */
export function developerAccountsSql(counted: SQL): SQL {
  const liveKey = sql`k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > ${NOW})`;
  const usedKey = sql`${liveKey} AND k.last_used_at >= ${NOW} - interval '7 days'`;
  // Usable now, or renewable with a refresh token that hasn't expired.
  const liveToken = sql`t.revoked_at IS NULL AND (t.access_token_expires_at > ${NOW}
    OR (t.refresh_token_hash IS NOT NULL
      AND (t.refresh_token_expires_at IS NULL OR t.refresh_token_expires_at > ${NOW})))`;
  return sql`SELECT
  (SELECT count(*) FROM api_key k JOIN "user" u ON u.id = k.user_id
    WHERE ${liveKey} AND ${counted})::int AS keys_live,
  (SELECT count(*) FROM api_key k JOIN "user" u ON u.id = k.user_id
    WHERE ${usedKey} AND ${counted})::int AS keys_used,
  (SELECT count(DISTINCT k.user_id) FROM api_key k JOIN "user" u ON u.id = k.user_id
    WHERE ${usedKey} AND ${counted})::int AS key_users,
  (SELECT count(*) FROM oauth_token t JOIN "user" u ON u.id = t.user_id
    WHERE ${liveToken} AND ${counted})::int AS tokens_live,
  (SELECT count(DISTINCT t.user_id) FROM oauth_token t JOIN "user" u ON u.id = t.user_id
    WHERE ${liveToken} AND ${counted})::int AS token_users,
  (SELECT count(DISTINCT t.app_id) FROM oauth_token t JOIN "user" u ON u.id = t.user_id
    WHERE ${liveToken} AND ${counted})::int AS token_apps`;
}

/** Slack workspaces with the bot, leaving out installs by admins. */
export function slackInstallsSql(counted: SQL): SQL {
  return sql`SELECT count(*)::int AS installs,
  count(*) FILTER (WHERE i.created_at >= ${NOW} - interval '28 days')::int AS recent
FROM slack_bot_installation i
LEFT JOIN "user" u ON u.id = i.installed_by_user_id
WHERE u.id IS NULL OR ${counted}`;
}

// ─── Running them ────────────────────────────────────────────────────────────

type Rows = Record<string, unknown>[];
type Statement = ReturnType<typeof db.execute>;

export const READ_ONLY_STATEMENTS = [
  "SET TRANSACTION READ ONLY",
  `SET LOCAL statement_timeout = '${GROWTH_STATEMENT_TIMEOUT}'`,
] as const;

/** Runs `statements` in one read-only transaction; their rows, in order. */
async function readOnly(statements: readonly SQL[]): Promise<Rows[]> {
  const [readOnlyMode, timeout] = READ_ONLY_STATEMENTS;
  const batch: [Statement, ...Statement[]] = [
    db.execute(sql.raw(readOnlyMode)),
    db.execute(sql.raw(timeout)),
    ...statements.map((statement) => db.execute(statement)),
  ];
  const results = await withTimeout(DEADLINE_MS, () => db.batch(batch));
  return (results as unknown as { rows: Rows }[])
    .slice(READ_ONLY_STATEMENTS.length)
    .map((result) => result.rows);
}

// Postgres: undefined_table, undefined_column.
const NOT_SET_UP = new Set(["42P01", "42703"]);

/** A table or column this page reads doesn't exist (yet), however wrapped. */
export function isNotSetUpError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && NOT_SET_UP.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export type SetUp<T> = { ready: true; data: T } | { ready: false };

/** `load`, or "not set up" when its tables aren't there; other errors throw. */
async function ifSetUp<T>(load: () => Promise<T>): Promise<SetUp<T>> {
  try {
    return { ready: true, data: await load() };
  } catch (error) {
    if (isNotSetUpError(error)) return { ready: false };
    throw error;
  }
}

const toNumber = (value: unknown) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : 0;
};
const toText = (value: unknown) =>
  typeof value === "string" ? value : String(value ?? "");

const toWeekCounts = (rows: Rows): WeekCount[] =>
  rows.map((row) => ({
    week: toText(row.week),
    key: toText(row.key),
    count: toNumber(row.count),
  }));

const byWeek = (rows: Rows) =>
  new Map(rows.map((row) => [toText(row.week), row]));

// ─── Sections ────────────────────────────────────────────────────────────────

export interface TopValue {
  value: string;
  count: number;
}

export interface Signups {
  /** False until user_acquisition exists: every sign-up is "unknown" */
  tracking: boolean;
  weekly: WeekPivot;
  /** Last 28 days; null until user_acquisition exists */
  top: Record<AcquisitionField, TopValue[]> | null;
}

const toTopValues = (rows: Rows = []): TopValue[] =>
  rows.map((row) => ({ value: toText(row.value), count: toNumber(row.count) }));

export async function getSignups(weeks: readonly string[]): Promise<Signups> {
  const counted = countedUser(adminExclusions());
  const start = weeks[0];
  const tracked = await ifSetUp(() =>
    readOnly([
      signupsByChannelSql(start, counted),
      ...ACQUISITION_FIELDS.map((field) => topAcquisitionSql(field, counted)),
    ]),
  );
  if (!tracked.ready) {
    const [weekly] = await readOnly([signupsSql(start, counted)]);
    return {
      tracking: false,
      weekly: pivotWeeks(weeks, toWeekCounts(weekly), [UNKNOWN_CHANNEL]),
      top: null,
    };
  }
  const [weekly, referrers, sources, landings] = tracked.data;
  return {
    tracking: true,
    weekly: pivotWeeks(weeks, toWeekCounts(weekly), [UNKNOWN_CHANNEL]),
    top: {
      referrer_host: toTopValues(referrers),
      utm_source: toTopValues(sources),
      landing_path: toTopValues(landings),
    },
  };
}

export interface Cohort {
  week: string;
  signedUp: number;
  madeCode: number;
  realScan: number;
  returned: number;
  paid: number;
}

export async function getActivation(
  weeks: readonly string[],
): Promise<Cohort[]> {
  const [rows] = await readOnly([
    activationSql(weeks[0], countedUser(adminExclusions())),
  ]);
  const found = byWeek(rows);
  return weeks.map((week) => {
    const row = found.get(week) ?? {};
    return {
      week,
      signedUp: toNumber(row.signed_up),
      madeCode: toNumber(row.made_code),
      realScan: toNumber(row.real_scan),
      returned: toNumber(row.returned),
      paid: toNumber(row.paid),
    };
  });
}

export async function getCodesAndScans(weeks: readonly string[]) {
  const counted = countedUser(adminExclusions());
  const start = weeks[0];
  const rest = [scansSql(start, counted), codeTotalsSql(counted)];
  const tracked = await ifSetUp(() =>
    readOnly([codesByViaSql(start, counted), ...rest]),
  );
  const [codes, scans, totals] = tracked.ready
    ? tracked.data
    : await readOnly([codesSql(start, counted), ...rest]);
  const scansByWeek = byWeek(scans);
  const total = totals[0] ?? {};
  return {
    tracking: tracked.ready,
    codes: pivotWeeks(weeks, toWeekCounts(codes), [NOT_RECORDED]),
    scans: weeks.map((week) => {
      const row = scansByWeek.get(week) ?? {};
      return {
        week,
        scans: toNumber(row.scans),
        realScans: toNumber(row.real_scans),
        codes: toNumber(row.codes),
      };
    }),
    totals: {
      codes: toNumber(total.codes),
      reallyScanned: toNumber(total.really_scanned),
    },
  };
}

export interface UsageTop {
  channel: string;
  metric: string;
  key: string;
  count: number;
}

/** usage_daily has no accounts in it, so admins' own calls are included. */
export function getDeveloperUsage(
  weeks: readonly string[],
): Promise<SetUp<{ weekly: WeekPivot; top: UsageTop[] }>> {
  return ifSetUp(async () => {
    const [weekly, top] = await readOnly([
      usageWeeklySql(weeks[0]),
      usageTopSql(),
    ]);
    return {
      weekly: pivotWeeks(weeks, toWeekCounts(weekly)),
      top: top.map((row) => ({
        channel: toText(row.channel),
        metric: toText(row.metric),
        key: toText(row.key),
        count: toNumber(row.count),
      })),
    };
  });
}

export async function getDeveloperAccounts() {
  const counted = countedUser(adminExclusions());
  const [[accounts], slack] = await Promise.all([
    readOnly([developerAccountsSql(counted)]),
    ifSetUp(() => readOnly([slackInstallsSql(counted)])),
  ]);
  const row = accounts[0] ?? {};
  const install = slack.ready ? (slack.data[0][0] ?? {}) : null;
  return {
    apiKeys: {
      live: toNumber(row.keys_live),
      used7d: toNumber(row.keys_used),
      users7d: toNumber(row.key_users),
    },
    oauth: {
      live: toNumber(row.tokens_live),
      users: toNumber(row.token_users),
      apps: toNumber(row.token_apps),
    },
    slack: install
      ? {
          installs: toNumber(install.installs),
          recent: toNumber(install.recent),
        }
      : null,
  };
}
