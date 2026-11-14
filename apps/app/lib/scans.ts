import "server-only";

import { createHash } from "node:crypto";
import {
  database as db,
  qrCode,
  qrScan,
  type ScanDeviceType,
  type ScanLocationSource,
  type ScanSource,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import {
  and,
  asc,
  avg,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  type SQL,
  sql,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { isbot } from "isbot";
import { env } from "@/env";
import { getClientIp } from "@/lib/request-guards";
import { scanGeo } from "./request-geo";
import { parseUserAgent } from "./user-agent";

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── User agent ──────────────────────────────────────────────────────────────

export { type ParsedUserAgent, parseUserAgent } from "./user-agent";

// ─── Request details ─────────────────────────────────────────────────────────

// The country, region and city from the platform's headers live in
// ./request-geo.ts (no server imports), shared with the session check.
export { scanGeo } from "./request-geo";

/** Host of an http(s) referrer; paths and queries are never stored. */
export function refererHost(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase().slice(0, 255) || null;
  } catch {
    return null;
  }
}

let cachedSalt: string | null = null;

function scanHashSalt(): string {
  if (!cachedSalt) {
    cachedSalt =
      env.SCAN_HASH_SALT ??
      createHash("sha256")
        .update(`qrdx:scan-salt:${env.BETTER_AUTH_SECRET}`)
        .digest("hex");
  }
  return cachedSalt;
}

/** The highest-q language tag of an Accept-Language header, lowercase. */
export function preferredLanguage(header: string | null): string | null {
  if (!header) return null;
  let best: string | null = null;
  let bestQ = 0;
  for (const part of header.slice(0, 512).split(",").slice(0, 20)) {
    const [rawTag = "", ...params] = part.split(";");
    const tag = rawTag.trim().toLowerCase();
    if (!/^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/.test(tag)) continue;
    let q = 1;
    for (const param of params) {
      const match = /^\s*q\s*=\s*([01](?:\.\d{0,3})?)\s*$/.exec(param);
      if (match) q = Number(match[1]);
    }
    if (q > bestQ) {
      best = tag;
      bestQ = q;
    }
  }
  return best?.slice(0, 35) ?? null;
}

/** Salted SHA-256 of ip + user agent + UTC day: counts unique visitors per day without storing IPs. */
export function visitorHash(
  ip: string,
  ua: string,
  at: Date,
  salt: string = scanHashSalt(),
): string {
  const day = at.toISOString().slice(0, 10);
  return createHash("sha256")
    .update(`${salt}\n${ip}\n${ua}\n${day}`)
    .digest("hex");
}

// Repeated scans of one code from one IP stop counting after this (the redirect still works).
const scanRecordLimiter = createRateLimiter({
  limiter: slidingWindow(20, "60 s"),
});

async function withinRecordLimit(qrCodeId: string, ip: string) {
  try {
    const { success } = await scanRecordLimiter.limit(
      `scan:record:${qrCodeId}:${ip}`,
    );
    return success;
  } catch {
    return true;
  }
}

function isPrefetch(headers: Headers): boolean {
  const purpose = `${headers.get("sec-purpose") ?? ""} ${headers.get("purpose") ?? ""}`;
  return /prefetch|prerender/i.test(purpose);
}

/** Id for a scan row, created before the redirect so routing can pass it on. */
export function createScanId(): string {
  return cuid();
}

/**
 * Stores one scan and bumps the code's counters in a single transaction.
 * Bots, link previews, prefetches and bursts from one IP are skipped.
 * Returns the stored scan's id, or null when the scan was skipped.
 */
export async function recordScan(
  qrCodeId: string,
  request: Request,
  {
    scanId = createScanId(),
    now = new Date(),
    variant = null,
    source = "qr",
    locationAsked = false,
  }: {
    scanId?: string;
    now?: Date;
    /** A/B variant served (lib/redirect/routing.ts scanVariantKey) */
    variant?: string | null;
    /** "nfc" when the visit came through the code's NFC link (lib/nfc/links.ts) */
    source?: ScanSource;
    /**
     * The scanner is being asked for their precise location (lib/scan-location):
     * stored as location_source "ip" until they share it ("gps").
     */
    locationAsked?: boolean;
  } = {},
): Promise<string | null> {
  const { headers } = request;
  const ua = headers.get("user-agent")?.slice(0, 512) ?? "";
  if (!ua || isbot(ua) || isPrefetch(headers)) {
    return null;
  }
  const ip = getClientIp(request);
  if (!(await withinRecordLimit(qrCodeId, ip))) {
    return null;
  }

  const { deviceType, os, browser } = parseUserAgent(ua);
  const scan = {
    id: scanId,
    qrCodeId,
    scannedAt: now,
    ...scanGeo(headers),
    deviceType,
    os,
    browser,
    referer: refererHost(headers.get("referer")),
    visitorHash: visitorHash(ip, ua, now),
    language: preferredLanguage(headers.get("accept-language")),
    variant: variant?.slice(0, 64) ?? null,
    source,
    ...(locationAsked && { locationSource: "ip" as const }),
  };

  const [, [counted]] = await db.batch([
    db.insert(qrScan).values(scan),
    db
      .update(qrCode)
      .set({
        scanCount: sql`${qrCode.scanCount} + 1`,
        lastScannedAt: now,
        // A scan is not an edit: keep updated_at as it was.
        updatedAt: sql`${qrCode.updatedAt}`,
      })
      .where(eq(qrCode.id, qrCodeId))
      // The post-increment count lets lib/events fire each milestone once.
      .returning({
        id: qrCode.id,
        userId: qrCode.userId,
        organizationId: qrCode.organizationId,
        slug: qrCode.slug,
        title: qrCode.title,
        scanCount: qrCode.scanCount,
      }),
  ]);
  if (counted) {
    // Webhooks + notifications (scan.created batched, scan.milestone); never throws.
    const { emitScanRecorded } = await import("@/lib/events/emit");
    await emitScanRecorded(scan, counted);
  }
  return scanId;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export const SCAN_RANGES = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
  // Each plan's reach is in lib/scan-history (Pro and Business: everything).
  // Scans started in October 2026, so 3 years covers every workspace's
  // whole history until late 2029; a longer range is needed before then.
  "1095d": 1095,
} as const;

export type ScanRange = keyof typeof SCAN_RANGES;

/** "30 days", "1 year", "3 years" */
export function scanRangeLabel(range: ScanRange): string {
  const days = SCAN_RANGES[range];
  if (days < 365) return `${days} days`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"}`;
}

export const SCAN_RANGE_KEYS = Object.keys(SCAN_RANGES) as ScanRange[];

const isScanRange = (value: unknown): value is ScanRange =>
  typeof value === "string" && value in SCAN_RANGES;

/** The requested range, or the longest one the plan's retention allows. */
export function resolveScanRange(
  value: unknown,
  retentionDays: number,
): { range: ScanRange; days: number } {
  const allowed = SCAN_RANGE_KEYS.filter(
    (key) => SCAN_RANGES[key] <= retentionDays,
  );
  const fallback = allowed.includes("30d") ? "30d" : (allowed.at(-1) ?? "7d");
  const range =
    isScanRange(value) && allowed.includes(value) ? value : fallback;
  return { range, days: SCAN_RANGES[range] };
}

/** Start of the UTC day `days - 1` days ago, so a range always includes today. */
export function rangeStart(days: number, now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface BreakdownRow {
  value: string | null;
  count: number;
}

export interface CityRow {
  city: string | null;
  country: string | null;
  count: number;
}

export interface ScanAnalytics {
  from: Date;
  days: number;
  total: number;
  unique: number;
  series: DailyCount[];
  countries: BreakdownRow[];
  cities: CityRow[];
  devices: BreakdownRow[];
  os: BreakdownRow[];
  browsers: BreakdownRow[];
  referrers: BreakdownRow[];
  /** QR scans and NFC taps in the range (they add up to `total`) */
  sources: ScanSourceCounts;
}

const BREAKDOWN_LIMIT = 10;
const dayOf = (column: PgColumn) =>
  sql<string>`to_char(date_trunc('day', ${column}), 'YYYY-MM-DD')`;

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

/** Every aggregate uses the (qr_code_id, scanned_at) index and runs in one round trip. */
export async function getScanAnalytics(
  qrCodeId: string,
  days: number,
): Promise<ScanAnalytics> {
  const from = rangeStart(days);
  const where = and(
    eq(qrScan.qrCodeId, qrCodeId),
    gte(qrScan.scannedAt, from),
  ) as SQL;

  const breakdown = (column: PgColumn) =>
    db
      .select({ value: column, count: count() })
      .from(qrScan)
      .where(where)
      .groupBy(column)
      .orderBy(desc(count()), asc(column))
      .limit(BREAKDOWN_LIMIT);

  const [
    [totals],
    series,
    countries,
    cities,
    devices,
    os,
    browsers,
    referrers,
  ] = await db.batch([
    db
      .select({
        total: count(),
        unique: countDistinct(qrScan.visitorHash),
        nfc: nfcTapCount(),
      })
      .from(qrScan)
      .where(where),
    db
      .select({ day: dayOf(qrScan.scannedAt), count: count() })
      .from(qrScan)
      .where(where)
      .groupBy(sql`1`),
    breakdown(qrScan.country),
    db
      .select({ city: qrScan.city, country: qrScan.country, count: count() })
      .from(qrScan)
      .where(where)
      .groupBy(qrScan.city, qrScan.country)
      .orderBy(desc(count()), asc(qrScan.city))
      .limit(BREAKDOWN_LIMIT),
    breakdown(qrScan.deviceType),
    breakdown(qrScan.os),
    breakdown(qrScan.browser),
    breakdown(qrScan.referer),
  ]);

  return {
    from,
    days,
    total: totals?.total ?? 0,
    unique: totals?.unique ?? 0,
    series: fillDays(series, from, days),
    countries: countries as BreakdownRow[],
    cities,
    devices: devices as BreakdownRow[],
    os: os as BreakdownRow[],
    browsers: browsers as BreakdownRow[],
    referrers: referrers as BreakdownRow[],
    sources: scanSourceCounts(totals?.total ?? 0, totals?.nfc ?? 0),
  };
}

/** Daily scan counts for several codes (dashboard sparklines). */
export async function getScanSparklines(
  qrCodeIds: string[],
  days = 7,
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  if (qrCodeIds.length === 0) return result;

  const from = rangeStart(days);
  const rows = await db
    .select({
      qrCodeId: qrScan.qrCodeId,
      day: dayOf(qrScan.scannedAt),
      count: count(),
    })
    .from(qrScan)
    .where(
      and(inArray(qrScan.qrCodeId, qrCodeIds), gte(qrScan.scannedAt, from)),
    )
    .groupBy(qrScan.qrCodeId, sql`2`);

  const grouped = new Map<string, { day: string; count: number }[]>();
  for (const row of rows) {
    const list = grouped.get(row.qrCodeId) ?? [];
    list.push(row);
    grouped.set(row.qrCodeId, list);
  }
  for (const id of qrCodeIds) {
    result.set(
      id,
      fillDays(grouped.get(id) ?? [], from, days).map((point) => point.count),
    );
  }
  return result;
}

// ─── Time of day and A/B splits ──────────────────────────────────────────────

/** Scans of one code (its id) or of the codes a condition selects. */
export type ScanFilter = string | SQL;

const scanFilterSql = (filter: ScanFilter): SQL =>
  typeof filter === "string" ? eq(qrScan.qrCodeId, filter) : filter;

/** A valid IANA time zone, or "UTC". */
export function normalizeTimeZone(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !/^[A-Za-z0-9_+\-/]+$/.test(value)
  ) {
    return "UTC";
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export interface TimeBreakdown {
  timeZone: string;
  /** Scans per local hour, 0–23 */
  hours: number[];
  /** Scans per local weekday, 0 = Sunday … 6 = Saturday */
  weekdays: number[];
}

export async function getScanTimeBreakdown(
  filter: ScanFilter,
  from: Date,
  timeZone = "UTC",
): Promise<TimeBreakdown> {
  const zone = normalizeTimeZone(timeZone);
  // scanned_at holds UTC wall time.
  const local = sql`((${qrScan.scannedAt} at time zone 'UTC') at time zone ${zone}::text)`;
  const where = and(scanFilterSql(filter), gte(qrScan.scannedAt, from));
  const [hourRows, dayRows] = await db.batch([
    db
      .select({
        key: sql<number>`extract(hour from ${local})::int`,
        count: count(),
      })
      .from(qrScan)
      .where(where)
      .groupBy(sql`1`),
    db
      .select({
        key: sql<number>`extract(dow from ${local})::int`,
        count: count(),
      })
      .from(qrScan)
      .where(where)
      .groupBy(sql`1`),
  ]);
  const fill = (rows: { key: number; count: number }[], size: number) => {
    const values = Array.from({ length: size }, () => 0);
    for (const row of rows) {
      const index = Number(row.key);
      if (index >= 0 && index < size) values[index] = row.count;
    }
    return values;
  };
  return {
    timeZone: zone,
    hours: fill(hourRows, 24),
    weekdays: fill(dayRows, 7),
  };
}

export interface SplitVariantCounts {
  /** Scans per variant id */
  counts: Map<string, number>;
  /** Scans whose variant was stored when they were served (qr_scan.variant) */
  recorded: number;
  /** Older scans, from before variants were stored, assigned by replay */
  replayed: number;
}

/**
 * Scans per variant of one A/B split rule. Scans store the variant they were
 * served (`<prefix><variantId>`, see lib/redirect/routing.ts scanVariantKey).
 * Scans from before the code's first stored variant are replayed instead:
 * lib/redirect/routing.ts assigns a visitor to the first variant whose
 * threshold is above int(first 7 hex digits of sha256(key + visitor_hash)),
 * and `where` selects the scans that reached the rule. `thresholds` are
 * ascending exclusive upper bounds; the last variant takes the rest.
 */
export async function getSplitVariantCounts(
  qrCodeId: string,
  {
    from,
    prefix,
    key,
    thresholds,
    where,
  }: {
    from: Date;
    prefix: string;
    key: string;
    thresholds: { id: string; below: number }[];
    where?: SQL;
  },
): Promise<SplitVariantCounts> {
  const counts = new Map(thresholds.map((t) => [t.id, 0]));
  const last = thresholds.at(-1);
  if (!last) return { counts, recorded: 0, replayed: 0 };

  const inRange = and(
    eq(qrScan.qrCodeId, qrCodeId),
    gte(qrScan.scannedAt, from),
  );
  // Uses the (qr_code_id, scanned_at) index and stops at the first match.
  const firstStored = sql`coalesce((select min(${qrScan.scannedAt}) from ${qrScan} where ${qrScan.qrCodeId} = ${qrCodeId} and ${qrScan.variant} is not null), 'infinity'::timestamp)`;
  const legacy = db
    .select({
      bucket:
        sql<number>`('x' || substr(encode(sha256(convert_to(${key}::text || ${qrScan.visitorHash}, 'UTF8')), 'hex'), 1, 7))::bit(28)::int`.as(
          "bucket",
        ),
    })
    .from(qrScan)
    .where(
      and(
        inRange,
        isNull(qrScan.variant),
        isNotNull(qrScan.visitorHash),
        sql`${qrScan.scannedAt} < ${firstStored}`,
        where,
      ),
    )
    .as("legacy");
  const cases = thresholds
    .slice(0, -1)
    .map(
      (t) => sql`when ${legacy.bucket} < ${t.below}::int then ${t.id}::text`,
    );
  const replayVariant =
    cases.length > 0
      ? sql<string>`case ${sql.join(cases, sql` `)} else ${last.id}::text end`
      : sql<string>`${last.id}::text`;

  const [stored, replayed] = await db.batch([
    db
      .select({ variant: qrScan.variant, count: count() })
      .from(qrScan)
      .where(and(inRange, isNotNull(qrScan.variant)))
      .groupBy(qrScan.variant),
    db
      .select({ variant: replayVariant, count: count() })
      .from(legacy)
      .groupBy(sql`1`),
  ]);

  let recordedTotal = 0;
  for (const row of stored) {
    const id = row.variant?.startsWith(prefix)
      ? row.variant.slice(prefix.length)
      : null;
    if (id !== null && counts.has(id)) {
      counts.set(id, (counts.get(id) ?? 0) + row.count);
      recordedTotal += row.count;
    }
  }
  let replayedTotal = 0;
  for (const row of replayed) {
    if (counts.has(row.variant)) {
      counts.set(row.variant, (counts.get(row.variant) ?? 0) + row.count);
      replayedTotal += row.count;
    }
  }
  return { counts, recorded: recordedTotal, replayed: replayedTotal };
}

export interface LanguageBreakdown {
  /** Scans in range (shares are of this) */
  total: number;
  /** Top languages; null = not sent by the browser or scanned before languages were stored */
  rows: BreakdownRow[];
}

export async function getLanguageBreakdown(
  filter: ScanFilter,
  from: Date,
): Promise<LanguageBreakdown> {
  const where = and(scanFilterSql(filter), gte(qrScan.scannedAt, from));
  const [[totals], rows] = await db.batch([
    db.select({ total: count() }).from(qrScan).where(where),
    db
      .select({ value: qrScan.language, count: count() })
      .from(qrScan)
      .where(where)
      .groupBy(qrScan.language)
      .orderBy(desc(count()), asc(qrScan.language))
      .limit(BREAKDOWN_LIMIT),
  ]);
  return { total: totals?.total ?? 0, rows };
}

export interface ScanEvent {
  scannedAt: Date;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: ScanDeviceType | null;
  os: string | null;
  browser: string | null;
  referer: string | null;
  /** "nfc" for a tap on an NFC tag, "qr" for a QR scan */
  source: ScanSource;
  /** Precise location the scanner shared (rounded to ~100 m), else null */
  latitude: number | null;
  longitude: number | null;
  /** Meters, as the scanner's browser reported it */
  locationAccuracyM: number | null;
  /** "gps": shared; "ip": asked, not shared; null: the code didn't ask */
  locationSource: ScanLocationSource | null;
}

/** Individual scans in a range, newest first (visitor hashes are not exposed). */
export function listScans(
  qrCodeId: string,
  { from, before, limit }: { from: Date; before?: Date | null; limit: number },
): Promise<ScanEvent[]> {
  return db
    .select({
      scannedAt: qrScan.scannedAt,
      country: qrScan.country,
      region: qrScan.region,
      city: qrScan.city,
      deviceType: qrScan.deviceType,
      os: qrScan.os,
      browser: qrScan.browser,
      referer: qrScan.referer,
      source: scanSourceColumn(),
      latitude: qrScan.latitude,
      longitude: qrScan.longitude,
      locationAccuracyM: qrScan.locationAccuracyM,
      locationSource: qrScan.locationSource,
    })
    .from(qrScan)
    .where(
      and(
        eq(qrScan.qrCodeId, qrCodeId),
        gte(qrScan.scannedAt, from),
        before ? lt(qrScan.scannedAt, before) : undefined,
      ),
    )
    .orderBy(desc(qrScan.scannedAt))
    .limit(limit);
}

const CSV_COLUMNS: (keyof ScanEvent)[] = [
  "scannedAt",
  "country",
  "region",
  "city",
  "deviceType",
  "os",
  "browser",
  "referer",
  "source",
  "latitude",
  "longitude",
  "locationAccuracyM",
  "locationSource",
];

function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  // Spreadsheet formula injection: header-derived values must stay plain text.
  // Numbers (coordinates like -73.986) are never formulas.
  if (typeof value !== "number" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function scansToCsv(events: ScanEvent[]): string {
  const header = [
    "scanned_at",
    "country",
    "region",
    "city",
    "device_type",
    "os",
    "browser",
    "referrer",
    "source",
    "latitude",
    "longitude",
    "location_accuracy_m",
    "location_source",
  ].join(",");
  const lines = events.map((event) =>
    CSV_COLUMNS.map((column) => csvCell(event[column])).join(","),
  );
  return `${[header, ...lines].join("\r\n")}\r\n`;
}

// ─── NFC taps (feat/nfc, manual-sql/2026-11-11-nfc.sql) ──────────────────────
// qr_scan.source is "nfc" for visits through a code's NFC link and "qr" for
// the rest; rows from before the column existed are null and count as QR.

export interface ScanSourceCounts {
  qr: number;
  nfc: number;
}

/** The stored source with null read as "qr". */
export const scanSourceColumn = () =>
  sql<ScanSource>`coalesce(${qrScan.source}, 'qr')`;

/** count(*) of NFC taps, for a select next to count(). */
export const nfcTapCount = () =>
  sql<number>`count(*) filter (where ${qrScan.source} = 'nfc')`.mapWith(Number);

export function scanSourceCounts(total: number, nfc: number): ScanSourceCounts {
  const taps = Math.min(Math.max(0, nfc), total);
  return { qr: total - taps, nfc: taps };
}

// ─── Precise location (lib/scan-location) ────────────────────────────────────

/** A visit recordScan would count: a browser, not a bot, preview or prefetch. */
export function isRecordableVisit(headers: Headers): boolean {
  const ua = headers.get("user-agent")?.slice(0, 512) ?? "";
  return Boolean(ua) && !isbot(ua) && !isPrefetch(headers);
}

/** A scan event without the precise-location fields (plans without them). */
export function withoutPreciseLocation(event: ScanEvent): ScanEvent {
  return {
    ...event,
    latitude: null,
    longitude: null,
    locationAccuracyM: null,
    locationSource: null,
  };
}

export interface PreciseLocationPoint {
  /** Rounded to 3 decimals (~100 m), as stored */
  latitude: number;
  longitude: number;
  count: number;
  /** Average accuracy the scanners' browsers reported, meters */
  accuracyM: number | null;
  lastScannedAt: Date;
}

export interface PreciseLocationSummary {
  /** Scans whose scanner was asked (the code had the setting on) */
  asked: number;
  /** Of those, scans whose scanner shared their location */
  shared: number;
  /** Shared points, most scans first */
  points: PreciseLocationPoint[];
}

const PRECISE_POINTS_LIMIT = 500;

/** Shared GPS points of a code's scans since `from`, and how many were asked. */
export async function getPreciseLocations(
  qrCodeId: string,
  from: Date,
  { limit = PRECISE_POINTS_LIMIT }: { limit?: number } = {},
): Promise<PreciseLocationSummary> {
  const inRange = and(
    eq(qrScan.qrCodeId, qrCodeId),
    gte(qrScan.scannedAt, from),
  );
  const shared = and(
    inRange,
    eq(qrScan.locationSource, "gps"),
    isNotNull(qrScan.latitude),
    isNotNull(qrScan.longitude),
  );
  const [counts, points] = await db.batch([
    db
      .select({ source: qrScan.locationSource, count: count() })
      .from(qrScan)
      .where(and(inRange, isNotNull(qrScan.locationSource)))
      .groupBy(qrScan.locationSource),
    db
      .select({
        latitude: qrScan.latitude,
        longitude: qrScan.longitude,
        count: count(),
        accuracyM: avg(qrScan.locationAccuracyM),
        lastScannedAt: max(qrScan.scannedAt),
      })
      .from(qrScan)
      .where(shared)
      .groupBy(qrScan.latitude, qrScan.longitude)
      .orderBy(desc(count()), asc(qrScan.latitude), asc(qrScan.longitude))
      .limit(limit),
  ]);
  let asked = 0;
  let sharedCount = 0;
  for (const row of counts) {
    asked += row.count;
    if (row.source === "gps") sharedCount += row.count;
  }
  return {
    asked,
    shared: sharedCount,
    points: points.map((row) => ({
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      count: row.count,
      accuracyM:
        row.accuracyM === null || row.accuracyM === undefined
          ? null
          : Math.round(Number(row.accuracyM)),
      lastScannedAt: new Date(row.lastScannedAt ?? 0),
    })),
  };
}

/**
 * Stores the location a scanner shared on their scan (rounded by the
 * caller), once: a scan that already has a shared location keeps it. Also
 * stores the A/B variant the location's routing served, when given. Returns
 * whether a row was updated (false: unknown scan, not recorded, or already
 * shared).
 */
export async function attachScanLocation(
  scanId: string,
  qrCodeId: string,
  location: { latitude: number; longitude: number; accuracyM: number | null },
  { variant }: { variant?: string | null } = {},
): Promise<boolean> {
  const rows = await db
    .update(qrScan)
    .set({
      latitude: location.latitude,
      longitude: location.longitude,
      locationAccuracyM: location.accuracyM,
      locationSource: "gps",
      ...(variant !== undefined && { variant: variant?.slice(0, 64) ?? null }),
    })
    .where(
      and(
        eq(qrScan.id, scanId),
        eq(qrScan.qrCodeId, qrCodeId),
        // Only scans that were asked, and only once.
        eq(qrScan.locationSource, "ip"),
      ),
    )
    .returning({ id: qrScan.id });
  return rows.length > 0;
}
