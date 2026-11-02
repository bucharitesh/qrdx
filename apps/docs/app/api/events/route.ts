import {
  database as db,
  landingEvent,
  landingPage,
  qrCode,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { and, eq, isNull } from "drizzle-orm";
import { isbot } from "isbot";
import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { CUSTOM_DOMAIN_HEADER } from "@/app/dashboard/domains/_lib/hostname";
import { getClientIp, readJsonBody } from "@/lib/request-guards";
import { visitorHash } from "@/lib/scans";
import { slugWhere } from "@/lib/slug-claims";

/**
 * Hosted-page interactions (view, click, …) → landing_event. Public and
 * beacon-friendly: accepts `navigator.sendBeacon` text/plain bodies from any
 * origin (custom domains). Inflation guards:
 * - bots and link previews (user agent) are accepted and dropped;
 * - only published pages count (an active, live page code): anything else
 *   answers 404 and stores nothing;
 * - per IP (hashed): a request budget, and per page a cap on views and
 *   interactions, so rotating user agents doesn't multiply views;
 * - per visitor (IP + user agent, hashed): one view per page per 30 minutes.
 * Raw IPs are never stored, nor sent to the rate limiter: every key holds a
 * salted, daily-rotating hash (lib/scans visitorHash).
 *
 * Body: { pageId, qrCodeId?, type, target? } or { slug, type, target? }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const MAX_BODY_BYTES = 4096;

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const eventSchema = z
  .object({
    pageId: idSchema.optional(),
    qrCodeId: idSchema.nullish(),
    slug: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .optional(),
    type: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
    target: z
      .string()
      .max(2048)
      .nullish()
      .transform((value) => value?.trim().slice(0, 200) || null),
  })
  .refine((event) => event.pageId || event.slug, {
    message: "pageId or slug is required",
  });

const ipLimiter = createRateLimiter({ limiter: slidingWindow(120, "60 s") });
/** One view per visitor and page per 30 minutes */
const viewLimiter = createRateLimiter({ limiter: slidingWindow(1, "30 m") });
const interactionLimiter = createRateLimiter({
  limiter: slidingWindow(20, "60 s"),
});
/**
 * Per IP and page, whatever the user agent: generous enough for a shared
 * network (a café's Wi-Fi scanning its menu), small enough that rotating user
 * agents can't inflate a page's numbers.
 */
const ipPageViewLimiter = createRateLimiter({
  limiter: slidingWindow(20, "30 m"),
});
const ipPageInteractionLimiter = createRateLimiter({
  limiter: slidingWindow(60, "10 m"),
});

function reply(status: number): Response {
  return new Response(null, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
  });
}

async function allowed(
  limiter: ReturnType<typeof createRateLimiter>,
  key: string,
): Promise<boolean> {
  try {
    return (await limiter.limit(key)).success;
  } catch {
    return true;
  }
}

/** A code that publishes a hosted page (as app/p/_lib/public-page.ts). */
const livePageCode = () =>
  and(
    eq(qrCode.kind, "page"),
    eq(qrCode.isActive, true),
    isNull(qrCode.archivedAt),
    isNull(qrCode.deletedAt),
  );

/**
 * The page and (when it belongs to it) the code; null unless the page is
 * published, i.e. some live code of kind "page" opens it.
 */
async function resolveTarget(
  event: z.output<typeof eventSchema>,
  customDomainId: string | null,
): Promise<{ pageId: string; qrCodeId: string | null } | null> {
  if (event.slug) {
    const [code] = await db
      .select({ id: qrCode.id, pageId: qrCode.pageId })
      .from(qrCode)
      .where(and(slugWhere(event.slug, customDomainId), livePageCode()))
      .limit(1);
    return code?.pageId ? { pageId: code.pageId, qrCodeId: code.id } : null;
  }
  const pageId = event.pageId as string;
  const codes = await db
    .select({ id: qrCode.id })
    .from(qrCode)
    .innerJoin(landingPage, eq(landingPage.id, qrCode.pageId))
    .where(and(eq(qrCode.pageId, pageId), livePageCode()))
    .limit(50);
  if (codes.length === 0) return null;
  const code = event.qrCodeId
    ? codes.find((row) => row.id === event.qrCodeId)
    : undefined;
  return { pageId, qrCodeId: code?.id ?? null };
}

export function OPTIONS() {
  return reply(204);
}

/** Salted, daily-rotating hash of the IP alone (never the IP itself). */
const ipHashOf = (ip: string, at: Date) => visitorHash(ip, "events:ip", at);

/**
 * Whether this event should be stored: the visitor's dedupe first, then the
 * IP's cap for the page (so a visitor's own repeats don't use up the budget
 * of everyone else on that network).
 */
async function shouldRecord(
  type: string,
  pageId: string,
  { visitor, ip }: { visitor: string; ip: string | null },
): Promise<boolean> {
  const view = type === "view";
  const fresh = view
    ? await allowed(viewLimiter, `events:view:${pageId}:${visitor}`)
    : await allowed(interactionLimiter, `events:act:${pageId}:${visitor}`);
  if (!(fresh && ip)) return fresh;
  return view
    ? allowed(ipPageViewLimiter, `events:view-ip:${pageId}:${ip}`)
    : allowed(ipPageInteractionLimiter, `events:act-ip:${pageId}:${ip}`);
}

export async function POST(request: NextRequest) {
  const ua = request.headers.get("user-agent")?.slice(0, 512) ?? "";
  // Bots and link previews are accepted and dropped.
  if (!ua || isbot(ua)) return reply(204);

  const now = new Date();
  const ip = getClientIp(request);
  // Without a client IP (local runs) only the per-visitor checks apply.
  const ipHash = ip === "unknown" ? null : ipHashOf(ip, now);
  if (ipHash && !(await allowed(ipLimiter, `events:ip:${ipHash}`))) {
    return reply(429);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, MAX_BODY_BYTES);
  } catch {
    return reply(400);
  }
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return reply(400);
  const event = parsed.data;

  let target: Awaited<ReturnType<typeof resolveTarget>>;
  try {
    target = await resolveTarget(
      event,
      request.headers.get(CUSTOM_DOMAIN_HEADER),
    );
  } catch (error) {
    console.error("Failed to resolve landing event page:", error);
    return reply(503);
  }
  // Unknown, deleted, archived or paused pages count nothing.
  if (!target) return reply(404);
  const { pageId, qrCodeId } = target;

  after(async () => {
    try {
      const visitor = visitorHash(ip, ua, now);
      if (!(await shouldRecord(event.type, pageId, { visitor, ip: ipHash }))) {
        return;
      }
      await db.insert(landingEvent).values({
        id: cuid(),
        pageId,
        qrCodeId,
        type: event.type,
        target: event.type === "view" ? null : event.target,
        visitorHash: visitor,
        createdAt: now,
      });
    } catch (error) {
      console.error("Failed to record landing event:", error);
    }
  });
  return reply(204);
}
