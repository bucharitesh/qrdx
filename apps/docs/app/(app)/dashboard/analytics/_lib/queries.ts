import "server-only";

import {
  conversion,
  database as db,
  landingEvent,
  qrCode,
  qrScan,
} from "@repo/database";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  getTableName,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  min,
  ne,
  or,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";
import { fillSeries, type SeriesInterval } from "@/lib/scan-ranges";
import {
  type BreakdownRow,
  bucketOf,
  type DailyCount,
  nfcTapCount,
  type ScanSourceCounts,
  scanSourceCounts,
  seriesInterval,
} from "@/lib/scans";
import type { ActiveScope } from "@/lib/scope";

/** Codes of the workspace (personal or team), trashed ones excluded. */
export function scopeCodesWhere(scope: ActiveScope): SQL {
  return and(
    scope.organizationId
      ? eq(qrCode.organizationId, scope.organizationId)
      : and(eq(qrCode.userId, scope.userId), isNull(qrCode.organizationId)),
    isNull(qrCode.deletedAt),
  ) as SQL;
}

/** qr_scan rows of the workspace's codes. */
export function scopeScansWhere(scope: ActiveScope): SQL {
  return inArray(
    qrScan.qrCodeId,
    db.select({ id: qrCode.id }).from(qrCode).where(scopeCodesWhere(scope)),
  );
}

/**
 * Where "All time" starts for a workspace: the day of the first scan of any
 * of its codes, else the first code's creation (null: no codes). Each code's
 * first scan is one read of the (qr_code_id, scanned_at) index, so this
 * never scans the workspace's scans.
 */
export async function workspaceHistoryStart(
  scope: ActiveScope,
): Promise<Date | null> {
  // A single-table select writes columns without their table, so the outer
  // "qr_code"."id" is spelled out: a bare "id" would be qr_scan's own.
  const codeId = sql`${sql.identifier(getTableName(qrCode))}.${sql.identifier(qrCode.id.name)}`;
  const [row] = await db
    .select({
      firstScan:
        sql<Date | null>`min((select min(${qrScan.scannedAt}) from ${qrScan} where ${qrScan.qrCodeId} = ${codeId}))`.mapWith(
          qrScan.scannedAt,
        ),
      firstCode: min(qrCode.createdAt),
    })
    .from(qrCode)
    .where(scopeCodesWhere(scope));
  const first = row?.firstScan ?? row?.firstCode ?? null;
  return first ? new Date(first) : null;
}

// ─── Workspace overview ──────────────────────────────────────────────────────

export interface TopCode {
  id: string;
  title: string | null;
  slug: string;
  scans: number;
  unique: number;
}

export interface WorkspaceAnalytics {
  codes: number;
  allTimeScans: number;
  total: number;
  unique: number;
  /** What one `series` point counts (lib/scan-ranges.ts seriesInterval) */
  interval: SeriesInterval;
  series: DailyCount[];
  topCodes: TopCode[];
  countries: BreakdownRow[];
  devices: BreakdownRow[];
  /** QR scans and NFC taps in the range (they add up to `total`) */
  sources: ScanSourceCounts;
}

export async function getWorkspaceAnalytics(
  scope: ActiveScope,
  from: Date,
  days: number,
): Promise<WorkspaceAnalytics> {
  const codesWhere = scopeCodesWhere(scope);
  const scansWhere = and(scopeScansWhere(scope), gte(qrScan.scannedAt, from));
  const interval = seriesInterval(days);

  const [[codeTotals], [scanTotals], series, topCodes, countries, devices] =
    await db.batch([
      db
        .select({
          codes: count(),
          allTime: sql<number>`coalesce(sum(${qrCode.scanCount}), 0)::int`,
        })
        .from(qrCode)
        .where(codesWhere),
      db
        .select({
          total: count(),
          unique: countDistinct(qrScan.visitorHash),
          nfc: nfcTapCount(),
        })
        .from(qrScan)
        .where(scansWhere),
      db
        .select({ day: bucketOf(qrScan.scannedAt, interval), count: count() })
        .from(qrScan)
        .where(scansWhere)
        .groupBy(sql`1`),
      db
        .select({
          id: qrCode.id,
          title: qrCode.title,
          slug: qrCode.slug,
          scans: count(),
          unique: countDistinct(qrScan.visitorHash),
        })
        .from(qrScan)
        .innerJoin(qrCode, eq(qrCode.id, qrScan.qrCodeId))
        .where(and(codesWhere, gte(qrScan.scannedAt, from)))
        .groupBy(qrCode.id, qrCode.title, qrCode.slug)
        .orderBy(desc(count()), asc(qrCode.id))
        .limit(10),
      db
        .select({ value: qrScan.country, count: count() })
        .from(qrScan)
        .where(scansWhere)
        .groupBy(qrScan.country)
        .orderBy(desc(count()), asc(qrScan.country))
        .limit(10),
      db
        .select({ value: qrScan.deviceType, count: count() })
        .from(qrScan)
        .where(scansWhere)
        .groupBy(qrScan.deviceType)
        .orderBy(desc(count()), asc(qrScan.deviceType))
        .limit(10),
    ]);

  return {
    codes: codeTotals?.codes ?? 0,
    allTimeScans: Number(codeTotals?.allTime ?? 0),
    total: scanTotals?.total ?? 0,
    unique: scanTotals?.unique ?? 0,
    interval,
    series: fillSeries(series, from, days, interval),
    topCodes,
    countries: countries as BreakdownRow[],
    devices: devices as BreakdownRow[],
    sources: scanSourceCounts(scanTotals?.total ?? 0, scanTotals?.nfc ?? 0),
  };
}

export interface CodeOption {
  id: string;
  title: string | null;
  slug: string;
}

/** Codes the compare picker offers at a time; typing finds the rest. */
export const CODE_OPTIONS_LIMIT = 50;
const MAX_SEARCH = 200;

/** A pasted short link ("…/q/AbC123", "…/p/menu") searches by its back-half. */
const SHORT_LINK_PATH = /\/[qp]\/([A-Za-z0-9_-]{1,64})(?:[/?#]|$)/;

/** `%`, `_` and `\` match themselves. */
const likePattern = (term: string) =>
  `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/** Title, back-half or destination containing `term`. */
function codeSearchWhere(term: string): SQL {
  const slug = term.match(SHORT_LINK_PATH)?.[1] ?? term;
  return or(
    ilike(qrCode.title, likePattern(term)),
    ilike(qrCode.slug, likePattern(slug)),
    ilike(qrCode.destinationUrl, likePattern(term)),
  ) as SQL;
}

/**
 * Codes to pick from for comparisons, most scanned first: every code of the
 * workspace (not in the trash), or with `q` those whose title, back-half or
 * destination contains it. `more` says there are more than `limit` (the
 * picker asks to type to narrow).
 */
export async function searchCodeOptions(
  scope: ActiveScope,
  { q, limit = CODE_OPTIONS_LIMIT }: { q?: string; limit?: number } = {},
): Promise<{ options: CodeOption[]; more: boolean }> {
  const term = q?.trim().slice(0, MAX_SEARCH);
  const size = Math.min(Math.max(1, Math.floor(limit)), CODE_OPTIONS_LIMIT);
  const rows = await db
    .select({ id: qrCode.id, title: qrCode.title, slug: qrCode.slug })
    .from(qrCode)
    .where(
      and(scopeCodesWhere(scope), term ? codeSearchWhere(term) : undefined),
    )
    .orderBy(desc(qrCode.scanCount), desc(qrCode.createdAt), desc(qrCode.id))
    .limit(size + 1);
  return { options: rows.slice(0, size), more: rows.length > size };
}

/** The workspace's codes among `ids` (the ones being compared, for labels). */
export function codeOptionsByIds(
  scope: ActiveScope,
  ids: string[],
): Promise<CodeOption[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return db
    .select({ id: qrCode.id, title: qrCode.title, slug: qrCode.slug })
    .from(qrCode)
    .where(and(scopeCodesWhere(scope), inArray(qrCode.id, ids)));
}

/** The ids that belong to the workspace, in the given order. */
export async function filterScopeCodeIds(
  scope: ActiveScope,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: qrCode.id })
    .from(qrCode)
    .where(and(scopeCodesWhere(scope), inArray(qrCode.id, ids)));
  const allowed = new Set(rows.map((row) => row.id));
  return ids.filter((id) => allowed.has(id));
}

export async function getCodeTotals(
  ids: string[],
  from: Date,
): Promise<Map<string, { scans: number; unique: number }>> {
  const result = new Map<string, { scans: number; unique: number }>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({
      id: qrScan.qrCodeId,
      scans: count(),
      unique: countDistinct(qrScan.visitorHash),
    })
    .from(qrScan)
    .where(and(inArray(qrScan.qrCodeId, ids), gte(qrScan.scannedAt, from)))
    .groupBy(qrScan.qrCodeId);
  for (const row of rows)
    result.set(row.id, { scans: row.scans, unique: row.unique });
  return result;
}

// ─── Conversions ─────────────────────────────────────────────────────────────

export interface ConversionSummary {
  count: number;
  /** Revenue per currency (decimal strings) */
  revenue: { currency: string | null; total: string; count: number }[];
  names: { name: string; count: number }[];
}

/** Conversions of one code, or of every code of the workspace. */
export async function getConversionSummary(
  target: { qrCodeId: string } | { scope: ActiveScope },
  from: Date,
): Promise<ConversionSummary> {
  const where = and(
    "qrCodeId" in target
      ? eq(conversion.qrCodeId, target.qrCodeId)
      : inArray(
          conversion.qrCodeId,
          db
            .select({ id: qrCode.id })
            .from(qrCode)
            .where(scopeCodesWhere(target.scope)),
        ),
    gte(conversion.createdAt, from),
  );
  const [revenue, names] = await db.batch([
    db
      .select({
        currency: conversion.currency,
        total: sql<string>`coalesce(${sum(conversion.value)}, 0)::text`,
        count: count(),
      })
      .from(conversion)
      .where(where)
      .groupBy(conversion.currency)
      .orderBy(desc(count())),
    db
      .select({ name: conversion.name, count: count() })
      .from(conversion)
      .where(where)
      .groupBy(conversion.name)
      .orderBy(desc(count()), asc(conversion.name))
      .limit(10),
  ]);
  return {
    count: revenue.reduce((total, row) => total + row.count, 0),
    revenue,
    names,
  };
}

// ─── Hosted page interactions ────────────────────────────────────────────────

export interface PageEventSummary {
  views: number;
  visitors: number;
  interactions: number;
  targets: BreakdownRow[];
}

export async function getPageEventSummary(
  pageId: string,
  qrCodeId: string,
  from: Date,
): Promise<PageEventSummary> {
  // Uses the (page_id, created_at) index; the code narrows shared pages.
  const where = and(
    eq(landingEvent.pageId, pageId),
    eq(landingEvent.qrCodeId, qrCodeId),
    gte(landingEvent.createdAt, from),
  );
  const [[views], [interactions], targets] = await db.batch([
    db
      .select({
        total: count(),
        visitors: countDistinct(landingEvent.visitorHash),
      })
      .from(landingEvent)
      .where(and(where, eq(landingEvent.type, "view"))),
    db
      .select({ total: count() })
      .from(landingEvent)
      .where(and(where, ne(landingEvent.type, "view"))),
    db
      .select({ value: landingEvent.target, count: count() })
      .from(landingEvent)
      .where(
        and(
          where,
          ne(landingEvent.type, "view"),
          isNotNull(landingEvent.target),
        ),
      )
      .groupBy(landingEvent.target)
      .orderBy(desc(count()), asc(landingEvent.target))
      .limit(10),
  ]);
  return {
    views: views?.total ?? 0,
    visitors: views?.visitors ?? 0,
    interactions: interactions?.total ?? 0,
    targets,
  };
}
