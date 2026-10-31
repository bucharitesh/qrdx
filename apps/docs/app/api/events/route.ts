import {
  database as db,
  landingEvent,
  landingPage,
  qrCode,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { and, eq } from "drizzle-orm";
import { isbot } from "isbot";
import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { getClientIp, readJsonBody } from "@/lib/request-guards";
import { visitorHash } from "@/lib/scans";

/**
 * Hosted-page interactions (view, click, …) → landing_event. Public and
 * beacon-friendly: accepts `navigator.sendBeacon` text/plain bodies from any
 * origin (custom domains), answers 204 right away and stores the event after
 * the response. Bots are ignored, each visitor counts one view per page per
 * 30 minutes, and clicks and IPs are rate limited.
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
      .regex(/^[A-Za-z0-9]{1,32}$/)
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
const viewLimiter = createRateLimiter({ limiter: slidingWindow(1, "30 m") });
const interactionLimiter = createRateLimiter({
  limiter: slidingWindow(20, "60 s"),
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

/** The page and (when it belongs to it) the code; null for unknown pages. */
async function resolveTarget(
  event: z.output<typeof eventSchema>,
): Promise<{ pageId: string; qrCodeId: string | null } | null> {
  if (event.slug) {
    const [code] = await db
      .select({ id: qrCode.id, kind: qrCode.kind, pageId: qrCode.pageId })
      .from(qrCode)
      .where(eq(qrCode.slug, event.slug))
      .limit(1);
    return code?.kind === "page" && code.pageId
      ? { pageId: code.pageId, qrCodeId: code.id }
      : null;
  }
  const pageId = event.pageId as string;
  const [[page], [code]] = await Promise.all([
    db
      .select({ id: landingPage.id })
      .from(landingPage)
      .where(eq(landingPage.id, pageId))
      .limit(1),
    event.qrCodeId
      ? db
          .select({ id: qrCode.id })
          .from(qrCode)
          .where(and(eq(qrCode.id, event.qrCodeId), eq(qrCode.pageId, pageId)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  return page ? { pageId: page.id, qrCodeId: code?.id ?? null } : null;
}

export function OPTIONS() {
  return reply(204);
}

export async function POST(request: NextRequest) {
  const ua = request.headers.get("user-agent")?.slice(0, 512) ?? "";
  // Bots and link previews are accepted and dropped.
  if (!ua || isbot(ua)) return reply(204);

  const ip = getClientIp(request);
  if (ip !== "unknown" && !(await allowed(ipLimiter, `events:ip:${ip}`))) {
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
  const now = new Date();

  after(async () => {
    try {
      const target = await resolveTarget(event);
      if (!target) return;
      const hash = visitorHash(ip, ua, now);
      const fresh =
        event.type === "view"
          ? await allowed(viewLimiter, `events:view:${target.pageId}:${hash}`)
          : await allowed(
              interactionLimiter,
              `events:act:${target.pageId}:${hash}`,
            );
      if (!fresh) return;
      await db.insert(landingEvent).values({
        id: cuid(),
        pageId: target.pageId,
        qrCodeId: target.qrCodeId,
        type: event.type,
        target: event.type === "view" ? null : event.target,
        visitorHash: hash,
        createdAt: now,
      });
    } catch (error) {
      console.error("Failed to record landing event:", error);
    }
  });
  return reply(204);
}
