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
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";
import type { BreakdownRow, DailyCount } from "@/lib/scans";
import type { ActiveScope } from "@/lib/scope";

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (column: SQL | typeof qrScan.scannedAt) =>
  sql<string>`to_char(date_trunc('day', ${column}), 'YYYY-MM-DD')`;

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

function fillDays(
  rows: { day: string; count: number }[],
  from: Date,
  days: number,
): DailyCount[] {
  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(from.getTime() + i * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return { date, count: byDay.get(date) ?? 0 };
  });
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
  series: DailyCount[];
  topCodes: TopCode[];
  countries: BreakdownRow[];
  devices: BreakdownRow[];
}

export async function getWorkspaceAnalytics(
  scope: ActiveScope,
  from: Date,
  days: number,
): Promise<WorkspaceAnalytics> {
  const codesWhere = scopeCodesWhere(scope);
  const scansWhere = and(scopeScansWhere(scope), gte(qrScan.scannedAt, from));

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
        .select({ total: count(), unique: countDistinct(qrScan.visitorHash) })
        .from(qrScan)
        .where(scansWhere),
      db
        .select({ day: dayOf(qrScan.scannedAt), count: count() })
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
    series: fillDays(series, from, days),
    topCodes,
    countries: countries as BreakdownRow[],
    devices: devices as BreakdownRow[],
  };
}

export interface CodeOption {
  id: string;
  title: string | null;
  slug: string;
}

/** Codes to pick from for comparisons, most scanned first. */
export function listCodeOptions(
  scope: ActiveScope,
  limit = 200,
): Promise<CodeOption[]> {
  return db
    .select({ id: qrCode.id, title: qrCode.title, slug: qrCode.slug })
    .from(qrCode)
    .where(scopeCodesWhere(scope))
    .orderBy(desc(qrCode.scanCount), desc(qrCode.createdAt))
    .limit(limit);
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
