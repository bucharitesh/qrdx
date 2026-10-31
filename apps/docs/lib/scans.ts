import "server-only";

import { createHash } from "node:crypto";
import {
  database as db,
  qrCode,
  qrScan,
  type ScanDeviceType,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
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
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { isbot } from "isbot";
import { env } from "@/lib/env";
import { getClientIp } from "@/lib/request-guards";

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── User agent ──────────────────────────────────────────────────────────────

export interface ParsedUserAgent {
  deviceType: ScanDeviceType;
  os: string | null;
  browser: string | null;
}

// First match wins, so more specific tokens come first.
const OS_RULES: [RegExp, string][] = [
  [/Windows Phone/i, "Windows Phone"],
  [/HarmonyOS/i, "HarmonyOS"],
  [/Android/i, "Android"],
  [/iPhone|iPad|iPod/i, "iOS"],
  [/CrOS/, "ChromeOS"],
  [/KAIOS/i, "KaiOS"],
  [/Windows/i, "Windows"],
  [/Macintosh|Mac OS X/i, "macOS"],
  [/Linux/i, "Linux"],
];

// In-app browsers first: their user agents also carry Safari/Chrome tokens.
const BROWSER_RULES: [RegExp, string][] = [
  [/FBAN|FBAV|FB_IAB/, "Facebook"],
  [/Instagram/, "Instagram"],
  [/MicroMessenger/, "WeChat"],
  [/\bLine\//, "LINE"],
  [/Snapchat/, "Snapchat"],
  [/musical_ly|TikTok|BytedanceWebview/, "TikTok"],
  [/\bGSA\//, "Google App"],
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|OPiOS|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/UCBrowser/, "UC Browser"],
  [/YaBrowser/, "Yandex"],
  [/Firefox\/|FxiOS/, "Firefox"],
  [/CriOS|Chrome\/|Chromium/, "Chrome"],
  [/Safari\//, "Safari"],
];

const TABLET_PATTERN = /iPad|Tablet|PlayBook|Silk|Kindle|Nexus (?:7|9|10)\b/i;
const MOBILE_PATTERN =
  /Mobi|iPhone|iPod|Windows Phone|IEMobile|BlackBerry|BB10|Opera Mini|KAIOS/i;
const DESKTOP_PATTERN = /Windows NT|Macintosh|X11|CrOS|Linux x86_64/i;

function firstMatch(rules: [RegExp, string][], ua: string): string | null {
  for (const [pattern, name] of rules) {
    if (pattern.test(ua)) return name;
  }
  return null;
}

function deviceTypeOf(ua: string): ScanDeviceType {
  // Android tablets drop the "Mobile" token that Android phones send.
  if (TABLET_PATTERN.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua))) {
    return "tablet";
  }
  if (MOBILE_PATTERN.test(ua)) return "mobile";
  if (DESKTOP_PATTERN.test(ua)) return "desktop";
  return "other";
}

/** Coarse device / OS / browser detection; null when unknown. */
export function parseUserAgent(ua: string): ParsedUserAgent {
  return {
    deviceType: deviceTypeOf(ua),
    os: firstMatch(OS_RULES, ua),
    browser: firstMatch(BROWSER_RULES, ua),
  };
}

// ─── Request details ─────────────────────────────────────────────────────────

function headerText(
  headers: Headers,
  name: string,
  maxLength: number,
): string | null {
  const raw = headers.get(name);
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // Keep the raw value when it is not percent-encoded.
  }
  return value.trim().slice(0, maxLength) || null;
}

/** Vercel geo headers (absent when self-hosted; Cloudflare's country is a fallback). */
export function scanGeo(headers: Headers): {
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const country = (
    headerText(headers, "x-vercel-ip-country", 8) ??
    headerText(headers, "cf-ipcountry", 8)
  )?.toUpperCase();
  return {
    // "XX" = unknown on Cloudflare
    country:
      country && country !== "XX" && /^[A-Z]{2}$/.test(country)
        ? country
        : null,
    region: headerText(headers, "x-vercel-ip-country-region", 16),
    city: headerText(headers, "x-vercel-ip-city", 100),
  };
}

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
        .update(
          `qrdx:scan-salt:${process.env.BETTER_AUTH_SECRET ?? "development"}`,
        )
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
  }: {
    scanId?: string;
    now?: Date;
    /** A/B variant served (lib/redirect/routing.ts scanVariantKey) */
    variant?: string | null;
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
  // Pro keeps 3 years; Business keeps everything (lib/plans).
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
      .select({ total: count(), unique: countDistinct(qrScan.visitorHash) })
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
];

function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  // Spreadsheet formula injection: header-derived values must stay plain text.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
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
  ].join(",");
  const lines = events.map((event) =>
    CSV_COLUMNS.map((column) => csvCell(event[column])).join(","),
  );
  return `${[header, ...lines].join("\r\n")}\r\n`;
}
