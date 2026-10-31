"use server";

import { createHash } from "node:crypto";
import { database as db, qrCode, SCAN_DEVICE_TYPES } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  codeIdSchema,
  destinationUrlSchema,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { snapshotCodeVersion } from "@/lib/code-versions";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import {
  evaluateRouting,
  finalizeUrl,
  type PixelConfig,
  parsePixelConfig,
  parseRoutingConfig,
  parseUtmConfig,
  pixelConfigSchema,
  ROUTING_OS,
  type RoutingConfig,
  type RoutingTrace,
  routingConfigSchema,
  SCAN_TOKEN_PARAM,
  type UtmConfig,
  utmConfigSchema,
} from "@/lib/redirect/routing";
import { enforceRateLimits } from "@/lib/request-guards";
import { mapWithConcurrency } from "@/lib/safety/check";
import { screenUrlChange } from "@/lib/safety/destinations";
import { type ActiveScope, getActiveScope, isInScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError, ValidationError } from "@/types/errors";

export type MarketingErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "PLAN_REQUIRED"
  | "RATE_LIMITED"
  | "UNSAFE_DESTINATION"
  | "UNKNOWN_ERROR";

export type MarketingActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: MarketingErrorCode; message: string } };

export interface CodeMarketingSettings {
  codeId: string;
  kind: "redirect" | "page";
  destinationUrl: string;
  plan: Plan;
  /** What the scope's plan allows editing (saved settings keep working either way) */
  features: {
    routing: boolean;
    utm: boolean;
    pixels: boolean;
    conversions: boolean;
  };
  routing: RoutingConfig | null;
  utm: UtmConfig | null;
  pixels: PixelConfig | null;
  /** For the conversion snippet */
  origin: string;
}

const KNOWN_CODES = new Set<string>([
  "NOT_FOUND",
  "PLAN_REQUIRED",
  "RATE_LIMITED",
  "UNSAFE_DESTINATION",
]);

function failure(
  error: unknown,
  context: Record<string, unknown>,
): MarketingActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to manage this code." },
    };
  }
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: error.message },
    };
  }
  if (error instanceof HttpError) {
    return {
      success: false,
      error: {
        code: KNOWN_CODES.has(error.code)
          ? (error.code as MarketingErrorCode)
          : "UNKNOWN_ERROR",
        message: error.message,
      },
    };
  }
  logError(error as Error, context);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Something went wrong." },
  };
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = issue?.message ?? "Invalid input";
    // Routing configs: say which rule (1-based) the problem is in.
    const rule = issue?.path[0] === "rules" ? issue.path[1] : undefined;
    throw new ValidationError(
      typeof rule === "number" ? `Rule ${rule + 1}: ${message}` : message,
    );
  }
  return result.data;
}

async function run<T>(
  action: string,
  fn: (scope: ActiveScope) => Promise<T>,
): Promise<MarketingActionResult<T>> {
  try {
    return { success: true, data: await fn(await getActiveScope()) };
  } catch (error) {
    return failure(error, { action });
  }
}

const saveLimiter = createRateLimiter({ limiter: slidingWindow(30, "60 s") });

const enforceSaveLimit = (userId: string) =>
  enforceRateLimits([
    { limiter: saveLimiter, key: `code-marketing:save:user:${userId}` },
  ]);

const codeColumns = {
  id: qrCode.id,
  userId: qrCode.userId,
  organizationId: qrCode.organizationId,
  kind: qrCode.kind,
  destinationUrl: qrCode.destinationUrl,
  scanCount: qrCode.scanCount,
  routing: qrCode.routing,
  utm: qrCode.utm,
  pixels: qrCode.pixels,
};

function scopeWhere(scope: ActiveScope): SQL {
  return scope.organizationId
    ? eq(qrCode.organizationId, scope.organizationId)
    : (and(
        eq(qrCode.userId, scope.userId),
        isNull(qrCode.organizationId),
      ) as SQL);
}

async function loadCode(scope: ActiveScope, id: string) {
  const [row] = await db
    .select(codeColumns)
    .from(qrCode)
    .where(eq(qrCode.id, parse(codeIdSchema, id)))
    .limit(1);
  // Codes outside the scope look exactly like missing ones.
  if (!(row && isInScope(scope, row))) {
    throw new HttpError(404, "NOT_FOUND", "QR code not found");
  }
  return row;
}

type CodeRow = Awaited<ReturnType<typeof loadCode>>;

async function toSettings(
  scope: ActiveScope,
  row: CodeRow,
): Promise<CodeMarketingSettings> {
  const plan = await getPlanForScope(scope);
  const limits = getPlanLimits(plan);
  return {
    codeId: row.id,
    kind: row.kind,
    destinationUrl: row.destinationUrl,
    plan,
    features: {
      routing: limits.routing,
      utm: limits.routing,
      pixels: limits.pixels,
      conversions: limits.conversions,
    },
    routing: parseRoutingConfig(row.routing),
    utm: parseUtmConfig(row.utm),
    pixels: parsePixelConfig(row.pixels),
    origin: baseUrl.origin,
  };
}

function planRequired(feature: string, plan: "Pro" | "Business"): HttpError {
  return new HttpError(
    402,
    "PLAN_REQUIRED",
    `${feature} is a ${plan} feature. You can still turn off or remove what's already set up.`,
  );
}

/** Same rules as the code's main destination (http/https, not another short link). */
function assertDestination(url: string, label: string) {
  const result = destinationUrlSchema.safeParse(url);
  if (!result.success) {
    throw new ValidationError(
      `${label}: ${result.error.issues[0]?.message ?? "invalid URL"}`,
    );
  }
}

function assertRoutingUrls(config: RoutingConfig) {
  config.rules.forEach((rule, index) => {
    const label = rule.name || `Rule ${index + 1}`;
    if (rule.action.type === "redirect") {
      assertDestination(rule.action.url, label);
    } else {
      for (const variant of rule.action.variants) {
        assertDestination(
          variant.url,
          `${label}, variant ${variant.name || variant.id}`,
        );
      }
    }
  });
}

const routingUrls = (config: RoutingConfig | null): string[] =>
  (config?.rules ?? []).flatMap((rule) =>
    rule.action.type === "redirect"
      ? [rule.action.url]
      : rule.action.variants.map((variant) => variant.url),
  );

/**
 * lib/safety screen for URLs the rules add (unchanged ones aren't re-checked).
 * Throws for unsafe URLs; true = switch the code off pending review, as for
 * a new main destination.
 */
async function screenRoutingUrls(
  scope: ActiveScope,
  row: CodeRow,
  next: RoutingConfig,
  previous: RoutingConfig | null,
): Promise<boolean> {
  const known = new Set(routingUrls(previous));
  const added = [...new Set(routingUrls(next))].filter(
    (url) => !known.has(url),
  );
  const holds = await mapWithConcurrency(added, 4, (url) =>
    screenUrlChange(scope, row, {
      previous: null,
      next: url,
      field: "routing rule",
    }),
  );
  return holds.some(Boolean);
}

const withoutEnabled = (rule: RoutingConfig["rules"][number]) =>
  JSON.stringify({ ...rule, enabled: undefined });

/** Only removes or turns off existing rules (allowed without the plan). */
function isRoutingReduction(
  next: RoutingConfig | null,
  previous: RoutingConfig | null,
): boolean {
  if (!next || next.rules.length === 0) return true;
  const before = new Map(previous?.rules.map((rule) => [rule.id, rule]));
  return next.rules.every((rule) => {
    const old = before.get(rule.id);
    return (
      old !== undefined &&
      withoutEnabled(old) === withoutEnabled(rule) &&
      (old.enabled || !rule.enabled)
    );
  });
}

/** A split keeps its start date while its variants and weights stay the same. */
function stampSplits(
  next: RoutingConfig,
  previous: RoutingConfig | null,
  now: Date,
): RoutingConfig {
  const before = new Map(previous?.rules.map((rule) => [rule.id, rule]));
  const shape = (variants: { id: string; weight: number }[]) =>
    JSON.stringify(variants.map(({ id, weight }) => [id, weight]));
  return {
    ...next,
    rules: next.rules.map((rule) => {
      if (rule.action.type !== "split") return rule;
      const old = before.get(rule.id)?.action;
      const since =
        old?.type === "split" &&
        old.since &&
        shape(old.variants) === shape(rule.action.variants)
          ? old.since
          : now.toISOString();
      return { ...rule, action: { ...rule.action, since } };
    }),
  };
}

async function saveColumn(
  scope: ActiveScope,
  row: CodeRow,
  values: Partial<
    Pick<typeof qrCode.$inferInsert, "routing" | "utm" | "pixels" | "isActive">
  >,
): Promise<CodeMarketingSettings> {
  await snapshotCodeVersion(row.id, scope.userId);
  const [updated] = await db
    .update(qrCode)
    .set(values)
    .where(and(eq(qrCode.id, row.id), scopeWhere(scope)))
    .returning(codeColumns);
  if (!updated) throw new HttpError(404, "NOT_FOUND", "QR code not found");
  revalidatePath(`/dashboard/codes/${row.id}`);
  return toSettings(scope, updated);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function getCodeMarketing(
  id: string,
): Promise<MarketingActionResult<CodeMarketingSettings>> {
  return run("getCodeMarketing", async (scope) =>
    toSettings(scope, await loadCode(scope, id)),
  );
}

const nullable = <T extends z.ZodType>(schema: T) => schema.nullable();

export async function saveCodeRouting(input: {
  id: string;
  routing: unknown;
}): Promise<MarketingActionResult<CodeMarketingSettings>> {
  return run("saveCodeRouting", async (scope) => {
    await enforceSaveLimit(scope.userId);
    const row = await loadCode(scope, input.id);
    const parsed = parse(nullable(routingConfigSchema), input.routing);
    const next = parsed && parsed.rules.length > 0 ? parsed : null;
    const previous = parseRoutingConfig(row.routing);
    const limits = getPlanLimits(await getPlanForScope(scope));
    if (!(limits.routing || isRoutingReduction(next, previous))) {
      throw planRequired("Smart routing", "Pro");
    }
    if (next) assertRoutingUrls(next);
    const hold = next
      ? await screenRoutingUrls(scope, row, next, previous)
      : false;
    return saveColumn(scope, row, {
      routing: next ? stampSplits(next, previous, new Date()) : null,
      ...(hold ? { isActive: false } : {}),
    });
  });
}

const isEmptyUtm = (utm: UtmConfig | null) =>
  !utm ||
  (!(utm.source || utm.medium || utm.campaign || utm.term || utm.content) &&
    utm.params.length === 0);

export async function saveCodeUtm(input: {
  id: string;
  utm: unknown;
}): Promise<MarketingActionResult<CodeMarketingSettings>> {
  return run("saveCodeUtm", async (scope) => {
    await enforceSaveLimit(scope.userId);
    const row = await loadCode(scope, input.id);
    const parsed = parse(nullable(utmConfigSchema), input.utm);
    const next = isEmptyUtm(parsed) ? null : parsed;
    const limits = getPlanLimits(await getPlanForScope(scope));
    if (next && !limits.routing) throw planRequired("UTM parameters", "Pro");
    return saveColumn(scope, row, { utm: next });
  });
}

export async function saveCodePixels(input: {
  id: string;
  pixels: unknown;
}): Promise<MarketingActionResult<CodeMarketingSettings>> {
  return run("saveCodePixels", async (scope) => {
    await enforceSaveLimit(scope.userId);
    const row = await loadCode(scope, input.id);
    const parsed = parse(nullable(pixelConfigSchema), input.pixels);
    const previous = parsePixelConfig(row.pixels);
    const limits = getPlanLimits(await getPlanForScope(scope));

    if (parsed) {
      // Without the plan, ids may only be removed and conversions turned off.
      const added = (
        ["ga4", "gtm", "meta", "tiktok", "linkedin"] as const
      ).some((key) => parsed[key] && parsed[key] !== previous?.[key]);
      if (added && !limits.pixels) throw planRequired("Tracking pixels", "Pro");
      if (parsed.conversions && !previous?.conversions && !limits.conversions) {
        throw planRequired("Conversion tracking", "Business");
      }
    }
    const empty =
      !parsed ||
      (!(
        parsed.ga4 ||
        parsed.gtm ||
        parsed.meta ||
        parsed.tiktok ||
        parsed.linkedin
      ) &&
        !parsed.conversions);
    return saveColumn(scope, row, { pixels: empty ? null : parsed });
  });
}

// ─── Rule tester ─────────────────────────────────────────────────────────────

const sampleSchema = z.object({
  device: z.enum(SCAN_DEVICE_TYPES),
  os: z.enum(ROUTING_OS).nullable(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(?:[A-Z]{2})?$/, "Use a 2-letter country code")
    .transform((value) => value || null),
  region: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(?:(?:[A-Z]{2}-)?[A-Z0-9]{1,3})?$/, "Use a region code like CA")
    .transform((value) => value.replace(/^[A-Z]{2}-/, "") || null),
  language: z
    .string()
    .trim()
    .toLowerCase()
    .max(35)
    .transform((value) => value || null),
  at: z.iso.datetime({ offset: true }),
  scanNumber: z.int().min(1).max(1_000_000_000),
  visitor: z.string().trim().max(100),
});

const testSchema = z.object({
  id: codeIdSchema,
  /** Unsaved rules from the editor */
  routing: routingConfigSchema.nullable(),
  sample: sampleSchema,
});

export interface RoutingTestResult {
  ruleId: string | null;
  variantId: string | null;
  url: string;
  trace: RoutingTrace[];
}

/**
 * Evaluates unsaved rules against a simulated scan with the saved UTM and
 * conversion settings (nothing is stored).
 */
export async function testCodeRouting(
  input: z.input<typeof testSchema>,
): Promise<MarketingActionResult<RoutingTestResult>> {
  return run("testCodeRouting", async (scope) => {
    const { id, routing, sample } = parse(testSchema, input);
    const row = await loadCode(scope, id);
    const result = evaluateRouting(
      routing,
      {
        deviceType: sample.device,
        os: sample.os,
        country: sample.country,
        region: sample.region,
        language: sample.language,
        now: new Date(sample.at),
        scanNumber: sample.scanNumber,
        visitorKey: createHash("sha256")
          .update(sample.visitor || "visitor")
          .digest("hex"),
      },
      row.destinationUrl,
    );
    const conversions = parsePixelConfig(row.pixels)?.conversions;
    return {
      ruleId: result.rule?.id ?? null,
      variantId: result.variant?.id ?? null,
      url: finalizeUrl(result.url, {
        utm: parseUtmConfig(row.utm),
        scanToken: conversions ? "…" : null,
      }).replace(`${SCAN_TOKEN_PARAM}=%E2%80%A6`, `${SCAN_TOKEN_PARAM}=…`),
      trace: result.trace,
    };
  });
}
