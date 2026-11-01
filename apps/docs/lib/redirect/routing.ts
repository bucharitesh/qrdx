import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { qrScan, SCAN_DEVICE_TYPES, type ScanDeviceType } from "@repo/database";
import { and, gte, inArray, lt, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/lib/env";
import { getClientIp } from "@/lib/request-guards";
import {
  parseUserAgent,
  preferredLanguage,
  scanGeo,
  visitorHash,
} from "@/lib/scans";
import type { Awaitable, RedirectCode } from "./code";

/**
 * Marketing settings of a dynamic code, stored as JSON on qr_code:
 * - `routing`: ordered rules (device/OS, country/region, schedule, dates,
 *   Accept-Language, scan count) → a URL or a weighted A/B split. First
 *   enabled rule whose conditions all match wins; none → destination_url.
 * - `utm`: query parameters appended to the final URL (never overriding
 *   parameters the URL already has).
 * - `pixels`: owner's tracking pixels for hosted pages (components/landing/pixels.tsx)
 *   and the conversion-tracking switch (appends `qrdx_sid`).
 * Everything is validated on write (actions/code-marketing.ts) and again here
 * on read; invalid stored JSON is ignored so a code always redirects.
 */

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const MAX_RULES = 20;
export const MAX_CONDITIONS = 8;
export const MAX_VARIANTS = 5;
export const MAX_CUSTOM_PARAMS = 10;
const MAX_URL_LENGTH = 2048;

/** OS names as lib/scans.ts parseUserAgent reports them. */
export const ROUTING_OS = [
  "iOS",
  "Android",
  "Windows",
  "macOS",
  "Linux",
  "ChromeOS",
  "HarmonyOS",
  "Windows Phone",
  "KaiOS",
] as const;

const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter a URL")
  .max(MAX_URL_LENGTH, "The URL is too long")
  .transform((value, ctx) => {
    try {
      const url = new URL(value);
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.username &&
        !url.password
      ) {
        return url.href;
      }
    } catch {
      // Reported below.
    }
    ctx.addIssue({
      code: "custom",
      message: "Enter a full URL, starting with https://",
    });
    return z.NEVER;
  });

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/, "Invalid id");

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const timeZoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine(
    (value) => /^[A-Za-z0-9_+\-/]+$/.test(value) && isTimeZone(value),
    "Unknown time zone",
  );

const timeOfDaySchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

const dateTimeSchema = z.iso.datetime({ offset: true });

const negatable = { not: z.boolean().optional() };

export const routingConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("device"),
    devices: z.array(z.enum(SCAN_DEVICE_TYPES)).min(1).max(4),
    ...negatable,
  }),
  z.object({
    type: z.literal("os"),
    os: z.array(z.enum(ROUTING_OS)).min(1).max(ROUTING_OS.length),
    ...negatable,
  }),
  z.object({
    type: z.literal("country"),
    countries: z
      .array(
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{2}$/, "Use 2-letter country codes, like US"),
      )
      .min(1, "Add at least one country")
      .max(300),
    ...negatable,
  }),
  z.object({
    type: z.literal("region"),
    regions: z
      .array(
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/, "Use region codes, like US-CA"),
      )
      .min(1, "Add at least one region")
      .max(100),
    ...negatable,
  }),
  z.object({
    type: z.literal("language"),
    languages: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(
            /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/,
            "Use language codes, like en or pt-BR",
          ),
      )
      .min(1, "Add at least one language")
      .max(50),
    ...negatable,
  }),
  z.object({
    type: z.literal("schedule"),
    /** 0 = Sunday … 6 = Saturday, in `timeZone` */
    days: z.array(z.int().min(0).max(6)).min(1, "Pick at least one day").max(7),
    start: timeOfDaySchema,
    end: timeOfDaySchema,
    timeZone: timeZoneSchema,
    ...negatable,
  }),
  z.object({
    type: z.literal("dates"),
    from: dateTimeSchema.nullable(),
    to: dateTimeSchema.nullable(),
    ...negatable,
  }),
  z.object({
    type: z.literal("scans"),
    /** "first": scans 1…count, "after": every scan after `count` */
    operator: z.enum(["first", "after"]),
    count: z.int().min(1).max(1_000_000_000),
    ...negatable,
  }),
]);

const variantSchema = z.object({
  id: idSchema,
  name: z.string().trim().max(40).optional(),
  url: httpUrlSchema,
  weight: z.int().min(1).max(100),
});

const ruleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("redirect"), url: httpUrlSchema }),
  z.object({
    type: z.literal("split"),
    variants: z
      .array(variantSchema)
      .min(2, "An A/B split needs at least two variants")
      .max(MAX_VARIANTS),
    /** When the current variants and weights took effect (set on save) */
    since: dateTimeSchema.optional(),
  }),
]);

export const routingRuleSchema = z.object({
  id: idSchema,
  name: z.string().trim().max(60).optional(),
  enabled: z.boolean().default(true),
  conditions: z.array(routingConditionSchema).max(MAX_CONDITIONS).default([]),
  action: ruleActionSchema,
});

export const routingConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    rules: z.array(routingRuleSchema).max(MAX_RULES),
  })
  .superRefine((config, ctx) => {
    const ids = new Set<string>();
    config.rules.forEach((rule, index) => {
      if (ids.has(rule.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["rules", index, "id"],
          message: "Rule ids must be unique",
        });
      }
      ids.add(rule.id);
      if (rule.action.type === "split") {
        const variantIds = rule.action.variants.map((variant) => variant.id);
        if (new Set(variantIds).size !== variantIds.length) {
          ctx.addIssue({
            code: "custom",
            path: ["rules", index, "action", "variants"],
            message: "Variant ids must be unique",
          });
        }
      }
      for (const condition of rule.conditions) {
        if (
          condition.type === "dates" &&
          condition.from &&
          condition.to &&
          Date.parse(condition.from) >= Date.parse(condition.to)
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["rules", index, "conditions"],
            message: "The start date must be before the end date",
          });
        }
      }
    });
  });

export type RoutingCondition = z.output<typeof routingConditionSchema>;
export type RoutingRule = z.output<typeof routingRuleSchema>;
export type RoutingConfig = z.output<typeof routingConfigSchema>;
export type RoutingConfigInput = z.input<typeof routingConfigSchema>;
export type SplitVariant = z.output<typeof variantSchema>;

const paramValueSchema = z.string().trim().max(200, "Up to 200 characters");
const optionalParam = paramValueSchema
  .optional()
  .transform((v) => v || undefined);

/** Query parameter names a code may never set (conversion tracking owns qrdx_*). */
const RESERVED_PARAM = /^qrdx_/i;

export const utmConfigSchema = z.object({
  source: optionalParam,
  medium: optionalParam,
  campaign: optionalParam,
  term: optionalParam,
  content: optionalParam,
  params: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .regex(
            /^[A-Za-z0-9_.\-[\]]{1,40}$/,
            "Parameter names: letters, numbers, - _ . [ ] (up to 40)",
          )
          .refine((key) => !RESERVED_PARAM.test(key), "qrdx_ is reserved"),
        value: paramValueSchema.min(1, "Enter a value"),
      }),
    )
    .max(MAX_CUSTOM_PARAMS)
    .default([]),
});

export type UtmConfig = z.output<typeof utmConfigSchema>;
export type UtmConfigInput = z.input<typeof utmConfigSchema>;

const optionalId = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => value === undefined || pattern.test(value), message);

/**
 * IDs are interpolated into inline scripts on hosted pages, so each one is
 * restricted to the provider's exact format.
 */
export const pixelConfigSchema = z.object({
  ga4: optionalId(/^G-[A-Z0-9]{4,20}$/, "GA4 IDs look like G-XXXXXXXXXX"),
  gtm: optionalId(/^GTM-[A-Z0-9]{4,12}$/, "GTM IDs look like GTM-XXXXXXX"),
  meta: optionalId(/^\d{6,20}$/, "Meta pixel IDs are 6-20 digits"),
  tiktok: optionalId(
    /^[A-Z0-9]{10,30}$/,
    "TikTok pixel IDs are 10-30 letters and digits",
  ),
  linkedin: optionalId(/^\d{3,12}$/, "LinkedIn partner IDs are 3-12 digits"),
  /** "auto": ask for consent where the law requires it; "always": everywhere */
  consent: z.enum(["auto", "always"]).default("auto"),
  /** Append qrdx_sid to the destination for conversion tracking (Business) */
  conversions: z.boolean().default(false),
});

export type PixelConfig = z.output<typeof pixelConfigSchema>;
export type PixelConfigInput = z.input<typeof pixelConfigSchema>;
export type PixelProvider = "ga4" | "gtm" | "meta" | "tiktok" | "linkedin";
export const PIXEL_PROVIDERS: readonly PixelProvider[] = [
  "ga4",
  "gtm",
  "meta",
  "tiktok",
  "linkedin",
];

export const hasPixels = (config: PixelConfig | null): boolean =>
  Boolean(config && PIXEL_PROVIDERS.some((provider) => config[provider]));

/**
 * The pixels that may load where a hosted page is served. A Google Tag Manager
 * container runs whatever scripts its owner publishes, so on QRdx's own
 * origin it could act with a signed-in visitor's QRdx session. It loads only
 * on the owner's custom domains, which are a separate origin.
 */
export function pixelsForOrigin(
  config: PixelConfig | null,
  { customDomain }: { customDomain: boolean },
): PixelConfig | null {
  if (!config?.gtm || customDomain) return config;
  return { ...config, gtm: undefined };
}

function parseStored<T extends z.ZodType>(
  schema: T,
  value: unknown,
  label: string,
): z.output<T> | null {
  if (value === null || value === undefined) return null;
  const result = schema.safeParse(value);
  if (!result.success) {
    console.error(`Ignoring invalid stored ${label} config`);
    return null;
  }
  return result.data;
}

export const parseRoutingConfig = (value: unknown) =>
  parseStored(routingConfigSchema, value, "routing");
export const parseUtmConfig = (value: unknown) =>
  parseStored(utmConfigSchema, value, "utm");
export const parsePixelConfig = (value: unknown) =>
  parseStored(pixelConfigSchema, value, "pixels");

// ─── Request → routing input ─────────────────────────────────────────────────

export interface RoutingInput {
  deviceType: ScanDeviceType;
  os: string | null;
  /** ISO 3166-1 alpha-2, uppercase */
  country: string | null;
  /** Subdivision code without the country (Vercel's x-vercel-ip-country-region) */
  region: string | null;
  /** Most preferred Accept-Language tag, lowercase */
  language: string | null;
  now: Date;
  /** 1-based number of this scan (approximate under concurrency) */
  scanNumber: number;
  /** Daily visitor hash, the same value recordScan stores in qr_scan.visitor_hash */
  visitorKey: string;
}

export function routingInputFromRequest(
  code: Pick<RedirectCode, "scanCount">,
  request: Request,
  now: Date,
): RoutingInput {
  const { headers } = request;
  // Same normalization as recordScan, so visitorKey equals the stored hash.
  const ua = headers.get("user-agent")?.slice(0, 512) ?? "";
  const { deviceType, os } = parseUserAgent(ua);
  const { country, region } = scanGeo(headers);
  return {
    deviceType,
    os,
    country,
    region: region?.toUpperCase() ?? null,
    language: preferredLanguage(headers.get("accept-language")),
    now,
    scanNumber: code.scanCount + 1,
    visitorKey: visitorHash(getClientIp(request), ua, now),
  };
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function localClock(
  now: Date,
  timeZone: string,
): { day: number; minutes: number } {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    if (formatters.size < 500) formatters.set(timeZone, format);
  }
  let day = 0;
  let hour = 0;
  let minute = 0;
  for (const part of format.formatToParts(now)) {
    if (part.type === "weekday") day = WEEKDAYS[part.value] ?? 0;
    if (part.type === "hour") hour = Number(part.value) % 24;
    if (part.type === "minute") minute = Number(part.value);
  }
  return { day, minutes: hour * 60 + minute };
}

const toMinutes = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

/**
 * Inside the weekly window? A window that ends before it starts runs past
 * midnight, and its after-midnight part belongs to the day it started on
 * ("Fri 22:00–02:00" includes Saturday 01:00). start = end means all day.
 */
export function inSchedule(
  condition: Extract<RoutingCondition, { type: "schedule" }>,
  now: Date,
): boolean {
  const { day, minutes } = localClock(now, condition.timeZone);
  const start = toMinutes(condition.start);
  const end = toMinutes(condition.end);
  if (start === end) return condition.days.includes(day);
  if (start < end) {
    return minutes >= start && minutes < end && condition.days.includes(day);
  }
  if (minutes >= start) return condition.days.includes(day);
  if (minutes < end) return condition.days.includes((day + 6) % 7);
  return false;
}

const languageMatches = (language: string, wanted: string) =>
  language === wanted || language.startsWith(`${wanted}-`);

function conditionHolds(
  condition: RoutingCondition,
  input: RoutingInput,
): boolean {
  switch (condition.type) {
    case "device":
      return condition.devices.includes(input.deviceType);
    case "os":
      return Boolean(
        input.os && (condition.os as readonly string[]).includes(input.os),
      );
    case "country":
      return Boolean(
        input.country && condition.countries.includes(input.country),
      );
    case "region":
      return Boolean(
        input.country &&
          input.region &&
          condition.regions.includes(`${input.country}-${input.region}`),
      );
    case "language": {
      const { language } = input;
      return Boolean(
        language &&
          condition.languages.some((wanted) =>
            languageMatches(language, wanted),
          ),
      );
    }
    case "schedule":
      return inSchedule(condition, input.now);
    case "dates": {
      const time = input.now.getTime();
      return (
        (!condition.from || time >= Date.parse(condition.from)) &&
        (!condition.to || time < Date.parse(condition.to))
      );
    }
    case "scans":
      return condition.operator === "first"
        ? input.scanNumber <= condition.count
        : input.scanNumber > condition.count;
  }
}

export function matchesCondition(
  condition: RoutingCondition,
  input: RoutingInput,
): boolean {
  const holds = conditionHolds(condition, input);
  return condition.not ? !holds : holds;
}

const BUCKET_HEX_DIGITS = 7;
/** Buckets are 28-bit so the SQL in lib/scans.ts can use a plain int. */
export const BUCKET_RANGE = 16 ** BUCKET_HEX_DIGITS;

/** The split's hash key; scans.ts hashes `key + visitor_hash` the same way. */
export const splitBucketKey = (ruleId: string) => `${ruleId}:`;

/** Sticky 0 … BUCKET_RANGE-1 bucket for a visitor in one split. */
export function splitBucket(ruleId: string, visitorKey: string): number {
  const hex = createHash("sha256")
    .update(`${splitBucketKey(ruleId)}${visitorKey}`, "utf8")
    .digest("hex");
  return Number.parseInt(hex.slice(0, BUCKET_HEX_DIGITS), 16);
}

/** Exclusive upper bucket of each variant; the last one takes the rest. */
export function splitThresholds(
  variants: readonly Pick<SplitVariant, "id" | "weight">[],
): { id: string; below: number }[] {
  const total = variants.reduce((sum, variant) => sum + variant.weight, 0);
  let cumulative = 0;
  return variants.map((variant, index) => {
    cumulative += variant.weight;
    return {
      id: variant.id,
      below:
        index === variants.length - 1
          ? BUCKET_RANGE
          : Math.floor((cumulative * BUCKET_RANGE) / total),
    };
  });
}

export function pickVariant(
  ruleId: string,
  variants: readonly SplitVariant[],
  visitorKey: string,
): SplitVariant {
  const bucket = splitBucket(ruleId, visitorKey);
  const thresholds = splitThresholds(variants);
  const index = thresholds.findIndex((threshold) => bucket < threshold.below);
  return variants[index === -1 ? variants.length - 1 : index] as SplitVariant;
}

export interface RoutingTrace {
  ruleId: string;
  enabled: boolean;
  matched: boolean;
  conditions: { type: RoutingCondition["type"]; matched: boolean }[];
}

export interface RoutingResult {
  /** The rule that decided the URL; null = no rule matched (destination_url) */
  rule: RoutingRule | null;
  variant: SplitVariant | null;
  url: string;
  trace: RoutingTrace[];
}

/** First enabled rule whose conditions all match wins. */
export function evaluateRouting(
  config: RoutingConfig | null,
  input: RoutingInput,
  defaultUrl: string,
): RoutingResult {
  const trace: RoutingTrace[] = [];
  for (const rule of config?.rules ?? []) {
    const conditions = rule.conditions.map((condition) => ({
      type: condition.type,
      matched: rule.enabled && matchesCondition(condition, input),
    }));
    const matched =
      rule.enabled && conditions.every((condition) => condition.matched);
    trace.push({ ruleId: rule.id, enabled: rule.enabled, matched, conditions });
    if (!matched) continue;

    if (rule.action.type === "redirect") {
      return { rule, variant: null, url: rule.action.url, trace };
    }
    const variant = pickVariant(
      rule.id,
      rule.action.variants,
      input.visitorKey,
    );
    return { rule, variant, url: variant.url, trace };
  }
  return { rule: null, variant: null, url: defaultUrl, trace };
}

// ─── Query parameters ────────────────────────────────────────────────────────

/** UTM + custom parameters in order (first occurrence of a name wins). */
export function utmParams(config: UtmConfig | null): [string, string][] {
  if (!config) return [];
  const params: [string, string][] = [];
  const add = (key: string, value: string | undefined) => {
    if (value && !params.some(([existing]) => existing === key)) {
      params.push([key, value]);
    }
  };
  add("utm_source", config.source);
  add("utm_medium", config.medium);
  add("utm_campaign", config.campaign);
  add("utm_term", config.term);
  add("utm_content", config.content);
  for (const { key, value } of config.params) add(key, value);
  return params;
}

/**
 * Appends parameters the URL doesn't already have. The existing query string
 * is kept byte for byte (no re-encoding), so destination URLs never break.
 */
export function appendQueryParams(
  href: string,
  params: readonly (readonly [string, string])[],
): string {
  if (params.length === 0) return href;
  const url = new URL(href);
  const extra = params
    .filter(([key]) => !url.searchParams.has(key))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    );
  if (extra.length === 0) return href;
  url.search = url.search
    ? `${url.search}&${extra.join("&")}`
    : `?${extra.join("&")}`;
  return url.href;
}

// ─── Conversion attribution (qrdx_sid) ───────────────────────────────────────

export const SCAN_TOKEN_PARAM = "qrdx_sid";
/** Conversions are attributed to scans up to this many days old. */
export const CONVERSION_WINDOW_DAYS = 30;
const TOKEN_ID = /^[a-z0-9]{8,40}$/;
const SIGNATURE_LENGTH = 22;

let tokenKey: Buffer | null = null;

function scanTokenKey(): Buffer {
  if (!tokenKey) {
    tokenKey = createHash("sha256")
      .update(
        `qrdx:scan-token:${env.SCAN_HASH_SALT ?? process.env.BETTER_AUTH_SECRET ?? "development"}`,
      )
      .digest();
  }
  return tokenKey;
}

const tokenSignature = (payload: string) =>
  createHmac("sha256", scanTokenKey())
    .update(payload)
    .digest("base64url")
    .slice(0, SIGNATURE_LENGTH);

/** Signed `<scanId>.<codeId>.<issuedAt>.<sig>`: can't be guessed or altered. */
export function signScanToken(
  scanId: string,
  codeId: string,
  issuedAt: Date,
): string {
  const payload = `${scanId}.${codeId}.${Math.floor(issuedAt.getTime() / 1000).toString(36)}`;
  return `${payload}.${tokenSignature(payload)}`;
}

export interface ScanToken {
  scanId: string;
  codeId: string;
  issuedAt: Date;
}

/** The token's scan, or null when forged, malformed or outside the window. */
export function verifyScanToken(
  token: unknown,
  now: Date = new Date(),
): ScanToken | null {
  if (typeof token !== "string" || token.length > 160) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [scanId = "", codeId = "", issued = "", signature = ""] = parts;
  if (
    !(TOKEN_ID.test(scanId) && TOKEN_ID.test(codeId)) ||
    !/^[0-9a-z]{1,10}$/.test(issued) ||
    signature.length !== SIGNATURE_LENGTH
  ) {
    return null;
  }
  const expected = tokenSignature(`${scanId}.${codeId}.${issued}`);
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  const issuedAt = new Date(Number.parseInt(issued, 36) * 1000);
  const age = now.getTime() - issuedAt.getTime();
  if (age > CONVERSION_WINDOW_DAYS * 86_400_000 || age < -5 * 60_000) {
    return null;
  }
  return { scanId, codeId, issuedAt };
}

// ─── The redirect step ───────────────────────────────────────────────────────

export interface RoutingContext {
  /**
   * Id the scan is recorded under (qr_scan.id), e.g. to pass on for
   * conversion attribution. Bots and bursts are not recorded, so the row may
   * never exist.
   */
  scanId: string;
  now: Date;
  /**
   * Set by resolveDestination when an A/B split served the scan: the
   * `scanVariantKey` stored in qr_scan.variant. The /q route reads it when it
   * records the scan (after the response), so recording never delays the redirect.
   */
  variant?: string | null;
}

/** qr_scan.variant value for a split rule's variant. */
export const scanVariantKey = (ruleId: string, variantId: string) =>
  `${ruleId}:${variantId}`;

/** Final URL for a routed destination: UTM parameters, then qrdx_sid. */
export function finalizeUrl(
  url: string,
  { utm, scanToken }: { utm: UtmConfig | null; scanToken?: string | null },
): string {
  const params = utmParams(utm);
  if (scanToken) params.push([SCAN_TOKEN_PARAM, scanToken]);
  return appendQueryParams(url, params);
}

/**
 * Step 2 of /q/<slug> for kind "redirect": the final destination URL after
 * device/geo/time/language rules, A/B splits and UTM parameters (`routing`,
 * `utm` columns). Must return an absolute http(s) URL. Errors thrown here
 * fall back to `destination_url`, so a broken rule never stops a code.
 *
 * Settings saved on a paid plan keep working after a downgrade (limits only
 * block creating new things); editing them needs the plan again.
 */
export function resolveDestination(
  code: RedirectCode,
  request: Request,
  context: RoutingContext,
): Awaitable<string> {
  const routing = parseRoutingConfig(code.routing);
  const utm = parseUtmConfig(code.utm);
  const pixels = parsePixelConfig(code.pixels);
  if (!(routing?.rules.length || utm || pixels?.conversions)) {
    return code.destinationUrl;
  }

  const { url, rule, variant } = routing?.rules.length
    ? evaluateRouting(
        routing,
        routingInputFromRequest(code, request, context.now),
        code.destinationUrl,
      )
    : { url: code.destinationUrl, rule: null, variant: null };
  if (rule && variant) context.variant = scanVariantKey(rule.id, variant.id);
  return finalizeUrl(url, {
    utm,
    scanToken: pixels?.conversions
      ? signScanToken(context.scanId, code.id, context.now)
      : null,
  });
}

// ─── A/B analytics ───────────────────────────────────────────────────────────

const coalesceFalse = (expr: SQL | undefined) =>
  sql`coalesce(${expr ?? sql`true`}, false)`;

/**
 * SQL over qr_scan columns equivalent to `matchesCondition`, or null when the
 * condition depends on data scans don't store (language, scan number).
 */
function conditionSql(condition: RoutingCondition): SQL | null {
  let holds: SQL;
  switch (condition.type) {
    case "device":
      holds = coalesceFalse(inArray(qrScan.deviceType, condition.devices));
      break;
    case "os":
      holds = coalesceFalse(inArray(qrScan.os, [...condition.os]));
      break;
    case "country":
      holds = coalesceFalse(inArray(qrScan.country, condition.countries));
      break;
    case "region":
      holds = coalesceFalse(
        inArray(
          sql`${qrScan.country} || '-' || upper(${qrScan.region})`,
          condition.regions,
        ),
      );
      break;
    case "dates":
      holds = coalesceFalse(
        and(
          condition.from
            ? gte(qrScan.scannedAt, new Date(condition.from))
            : undefined,
          condition.to
            ? lt(qrScan.scannedAt, new Date(condition.to))
            : undefined,
        ),
      );
      break;
    case "schedule": {
      // scanned_at holds UTC wall time.
      const local = sql`((${qrScan.scannedAt} at time zone 'UTC') at time zone ${condition.timeZone}::text)`;
      const minutes = sql`(extract(hour from ${local})::int * 60 + extract(minute from ${local})::int)`;
      const day = sql`extract(dow from ${local})::int`;
      const start = toMinutes(condition.start);
      const end = toMinutes(condition.end);
      const days = sql`(${sql.join(
        condition.days.map((value) => sql`${value}::int`),
        sql`, `,
      )})`;
      if (start === end) {
        holds = sql`(${day} in ${days})`;
      } else if (start < end) {
        holds = sql`(${minutes} >= ${start}::int and ${minutes} < ${end}::int and ${day} in ${days})`;
      } else {
        holds = sql`((${minutes} >= ${start}::int and ${day} in ${days}) or (${minutes} < ${end}::int and ((${day} + 6) % 7) in ${days}))`;
      }
      break;
    }
    case "language":
    case "scans":
      return null;
  }
  return condition.not ? sql`not ${holds}` : holds;
}

export interface SplitBreakdownPlan {
  ruleId: string;
  ruleName: string | null;
  variants: SplitVariant[];
  thresholds: { id: string; below: number }[];
  key: string;
  /** qr_scan.variant values of this rule start with it */
  variantPrefix: string;
  since: Date | null;
  /** Scans that reached this rule (undefined = all scans) */
  where: SQL | undefined;
  /** Some conditions can't be replayed for scans without a stored variant */
  approximate: boolean;
  /** An earlier rule without conditions catches every scan */
  unreachable: boolean;
}

/**
 * For each enabled split rule: how to replay, from stored scans, which scans
 * reached it and which variant each visitor got (lib/scans.ts
 * getSplitVariantCounts). Based on the current rules.
 */
export function splitBreakdownPlans(
  config: RoutingConfig | null,
): SplitBreakdownPlan[] {
  const plans: SplitBreakdownPlan[] = [];
  const earlier: SQL[] = [];
  let approximate = false;
  let unreachable = false;

  for (const rule of config?.rules ?? []) {
    if (!rule.enabled) continue;
    const parts: SQL[] = [];
    let ruleApproximate = false;
    for (const condition of rule.conditions) {
      const part = conditionSql(condition);
      if (part) parts.push(part);
      else ruleApproximate = true;
    }
    const own = parts.length > 0 ? (and(...parts) as SQL) : undefined;

    if (rule.action.type === "split") {
      plans.push({
        ruleId: rule.id,
        ruleName: rule.name ?? null,
        variants: rule.action.variants,
        thresholds: splitThresholds(rule.action.variants),
        key: splitBucketKey(rule.id),
        variantPrefix: scanVariantKey(rule.id, ""),
        since: rule.action.since ? new Date(rule.action.since) : null,
        where: and(...earlier, own),
        approximate: approximate || ruleApproximate,
        unreachable,
      });
    }

    if (rule.conditions.length === 0) {
      unreachable = true;
    } else if (ruleApproximate) {
      // Can't tell which scans this rule caught: later counts may include them.
      approximate = true;
    } else if (own) {
      earlier.push(sql`not (${own})`);
    }
  }
  return plans;
}
